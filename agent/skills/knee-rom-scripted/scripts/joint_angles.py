"""Knee range-of-motion (ROM) screen from 2D pose landmarks. Standard library only.

Tool contract adapted from the HW5 car-setup MCP tools (shanexf/car-setup-mcp):
a TOOL_SPEC with purpose, typed inputs, units and valid ranges, fixed range
checks that raise ValueError on invalid input, a structured result dict, a
qualitative label, and a list of warnings near model limits.

Units: pixels for landmark coordinates, degrees for angles, seconds for time,
0-10 numeric rating for pain. Clinical convention: knee flexion = 0 deg at
full extension, increasing as the knee bends.
"""
import math

TOOL_SPEC = {
    "name": "knee_rom_screen",
    "purpose": ("Compute knee flexion per frame from hip-knee-ankle landmarks of a "
                "side-view (sagittal) video, reject unreliable frames, summarize "
                "extension lag and ROM, compare with clinician targets and the last "
                "session, and return on_track / below_target / clinician_review."),
    "inputs": {
        "side": "str, 'left' or 'right'",
        "camera_view": "str, must be 'sagittal' for a valid 2D knee-flexion screen",
        "coordinate_units": "str, 'pixels' or 'normalized' (normalized needs image size)",
        "image_width_px, image_height_px": "int, 100-10000 px (needed for normalized)",
        "frames": "list of {t_s, hip:[x,y,vis], knee:[x,y,vis], ankle:[x,y,vis]}, 3-10000 frames",
        "targets.max_extension_lag_deg": "float, 0-30 deg (clinician-set)",
        "targets.min_rom_deg": "float, 10-150 deg (clinician-set)",
        "previous_session": "optional {extension_lag_deg, rom_deg, pain_0_10}",
        "pain_0_10": "float, 0-10 (patient-reported)",
    },
    "assumptions": [
        "2D image-plane angle; leg moves in a plane roughly parallel to the camera",
        "unsigned included angle: hyperextension (negative flexion) cannot be detected",
        "landmark visibility is a model confidence score, not a calibrated probability",
        "thresholds are team-chosen screening defaults, not clinical standards",
        "session extremes over the cleaned series; no per-repetition segmentation",
    ],
}

DEFAULT_SETTINGS = {
    "visibility_min": 0.5,             # drop frame if any of hip/knee/ankle below this
    "segment_tolerance": 0.15,         # drop frame if thigh/shank length deviates >15% from median
    "measurement_tolerance_deg": 5.0,  # changes/misses smaller than this are within 2D pose error
    "min_valid_frames": 5,
    "min_valid_fraction": 0.6,
    "max_plausible_flexion_deg": 150.0,
    "pain_review_level": 6.0,          # pain >= this -> clinician review
    "pain_increase_review": 2.0,       # pain increase >= this vs last session -> review
    "smoothing_min_frames": 15,        # median-5 smoothing only for real video-length series
}

RANGES = {
    "image_width_px": (100, 10000), "image_height_px": (100, 10000),
    "max_extension_lag_deg": (0, 30), "min_rom_deg": (10, 150),
    "pain_0_10": (0, 10), "extension_lag_deg": (0, 90), "rom_deg": (0, 160),
    "visibility_min": (0.0, 1.0), "segment_tolerance": (0.01, 0.5),
    "measurement_tolerance_deg": (0.0, 20.0), "min_valid_frames": (3, 1000),
    "min_valid_fraction": (0.1, 1.0), "max_plausible_flexion_deg": (90, 180),
    "pain_review_level": (0, 10), "pain_increase_review": (0, 10),
    "smoothing_min_frames": (5, 100000),
}


def _num(name, value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number, got {value!r}.")
    if name in RANGES:
        lo, hi = RANGES[name]
        if not lo <= value <= hi:
            raise ValueError(f"{name}={value} is outside the valid range [{lo}, {hi}].")
    return float(value)


def included_angle_deg(a, b, c):
    """Angle ABC in degrees between vectors B->A and B->C (0-180)."""
    bax, bay = a[0] - b[0], a[1] - b[1]
    bcx, bcy = c[0] - b[0], c[1] - b[1]
    na, nc = math.hypot(bax, bay), math.hypot(bcx, bcy)
    if na == 0 or nc == 0:
        raise ValueError("Coincident landmarks: a segment has zero length.")
    cosv = (bax * bcx + bay * bcy) / (na * nc)
    return math.degrees(math.acos(max(-1.0, min(1.0, cosv))))


def knee_flexion_deg(hip, knee, ankle):
    """Clinical knee flexion: 180 - included hip-knee-ankle angle (0 = straight)."""
    return 180.0 - included_angle_deg(hip, knee, ankle)


def _median(values):
    s = sorted(values)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def _classify_change(delta_better, tol):
    """delta_better > 0 means improvement."""
    if delta_better > tol:
        return "improved"
    if delta_better < -tol:
        return "worsened"
    return "no_detectable_change"


def analyze_session(session, settings=None):
    cfg = dict(DEFAULT_SETTINGS)
    cfg.update(settings or {})
    for k, v in cfg.items():
        cfg[k] = _num(k, v)
    warnings, review = [], []

    side = session.get("side")
    if side not in ("left", "right"):
        raise ValueError("side must be 'left' or 'right'.")
    view = session.get("camera_view")
    if view not in ("sagittal", "frontal", "oblique", "unknown"):
        raise ValueError("camera_view must be sagittal, frontal, oblique, or unknown.")
    units = session.get("coordinate_units")
    if units not in ("pixels", "normalized"):
        raise ValueError("coordinate_units must be 'pixels' or 'normalized'.")
    sx = sy = 1.0
    if units == "normalized":
        if "image_width_px" not in session or "image_height_px" not in session:
            raise ValueError("Normalized coordinates require image_width_px and image_height_px; "
                             "angles on unscaled normalized x,y are distorted for non-square images.")
        sx = _num("image_width_px", session["image_width_px"])
        sy = _num("image_height_px", session["image_height_px"])

    targets = session.get("targets")
    if not isinstance(targets, dict):
        raise ValueError("targets with max_extension_lag_deg and min_rom_deg are required (clinician-set).")
    lag_target = _num("max_extension_lag_deg", targets.get("max_extension_lag_deg"))
    rom_target = _num("min_rom_deg", targets.get("min_rom_deg"))
    if "pain_0_10" not in session:
        raise ValueError("pain_0_10 (patient-reported, 0-10) is required.")
    pain = _num("pain_0_10", session["pain_0_10"])
    prev = session.get("previous_session")
    if prev is not None:
        prev = {k: _num(k, prev[k]) for k in ("extension_lag_deg", "rom_deg", "pain_0_10") if k in prev}

    frames = session.get("frames")
    if not isinstance(frames, list) or not 3 <= len(frames) <= 10000:
        raise ValueError("frames must be a list of 3-10000 frames.")

    rows, last_t = [], None
    for i, f in enumerate(frames):
        try:
            t = _num(f"frames[{i}].t_s", f["t_s"])
            pts = {}
            for name in ("hip", "knee", "ankle"):
                x, y, vis = f[name]
                x, y, vis = (_num(f"frames[{i}].{name}", v) for v in (x, y, vis))
                if not 0 <= vis <= 1:
                    raise ValueError(f"frames[{i}].{name} visibility must be in [0, 1].")
                pts[name] = (x * sx, y * sy, vis)
        except (KeyError, TypeError) as e:
            raise ValueError(f"frames[{i}] must have t_s and hip/knee/ankle as [x, y, visibility].") from e
        if last_t is not None and t <= last_t:
            raise ValueError(f"frames[{i}].t_s must be strictly increasing.")
        last_t = t
        h, k, a = pts["hip"], pts["knee"], pts["ankle"]
        rows.append({
            "index": i, "t_s": t,
            "flexion_deg": knee_flexion_deg(h, k, a),
            "thigh_px": math.hypot(h[0] - k[0], h[1] - k[1]),
            "shank_px": math.hypot(a[0] - k[0], a[1] - k[1]),
            "min_visibility": min(h[2], k[2], a[2]),
            "status": "valid", "reason": None,
        })

    for r in rows:
        if r["min_visibility"] < cfg["visibility_min"]:
            r["status"], r["reason"] = "rejected", f"low visibility ({r['min_visibility']:.2f})"
    vis_ok = [r for r in rows if r["status"] == "valid"]
    if vis_ok:
        med_thigh = _median([r["thigh_px"] for r in vis_ok])
        med_shank = _median([r["shank_px"] for r in vis_ok])
        for r in vis_ok:
            dt = r["thigh_px"] / med_thigh - 1
            ds = r["shank_px"] / med_shank - 1
            if max(abs(dt), abs(ds)) > cfg["segment_tolerance"]:
                r["status"] = "rejected"
                r["reason"] = (f"segment length off median (thigh {dt:+.0%}, shank {ds:+.0%}): "
                               "out-of-plane motion or landmark error")
    else:
        med_thigh = med_shank = None

    valid = [r for r in rows if r["status"] == "valid"]
    n, nv = len(rows), len(valid)
    frac = nv / n
    if nv < cfg["min_valid_frames"] or frac < cfg["min_valid_fraction"]:
        review.append(f"insufficient reliable frames: {nv}/{n} valid "
                      f"(need >= {int(cfg['min_valid_frames'])} and >= {cfg['min_valid_fraction']:.0%})")
    elif nv < n:
        warnings.append(f"{n - nv} of {n} frames rejected; see per-frame reasons")
    if view != "sagittal":
        review.append(f"camera_view is '{view}': 2D knee flexion is only valid from a side (sagittal) view")

    series = [r["flexion_deg"] for r in valid]
    smoothing = "none"
    if nv >= cfg["smoothing_min_frames"]:
        sm = [_median(series[max(0, j - 2): j + 3]) for j in range(nv)]
        for r, v in zip(valid, sm):
            r["flexion_smoothed_deg"] = v
        series, smoothing = sm, "centered median, window 5"

    summary = None
    decision = "clinician_review"
    target_status, change = {}, {}
    if nv >= 2:
        ext_lag = min(series)
        peak_flex = max(series)
        rom = peak_flex - ext_lag
        summary = {"extension_lag_deg": ext_lag, "peak_flexion_deg": peak_flex, "rom_deg": rom,
                   "valid_frames": nv, "total_frames": n, "valid_fraction": frac,
                   "median_thigh_px": med_thigh, "median_shank_px": med_shank,
                   "smoothing": smoothing}
        if peak_flex > cfg["max_plausible_flexion_deg"]:
            review.append(f"implausible peak flexion {peak_flex:.1f} deg for this exercise")
        if ext_lag < 2.0:
            warnings.append("extension near 0 deg: hyperextension cannot be measured by an unsigned 2D angle")
        tol = cfg["measurement_tolerance_deg"]

        def status(miss):
            return "met" if miss <= 0 else ("within_tolerance" if miss <= tol else "not_met")
        target_status = {
            "extension_lag": {"value_deg": ext_lag, "target_max_deg": lag_target,
                              "miss_deg": ext_lag - lag_target, "status": status(ext_lag - lag_target)},
            "rom": {"value_deg": rom, "target_min_deg": rom_target,
                    "miss_deg": rom_target - rom, "status": status(rom_target - rom)},
        }
        if prev:
            if "extension_lag_deg" in prev:
                d = prev["extension_lag_deg"] - ext_lag
                change["extension_lag"] = {"previous_deg": prev["extension_lag_deg"], "now_deg": ext_lag,
                                           "improvement_deg": d, "class": _classify_change(d, tol)}
            if "rom_deg" in prev:
                d = rom - prev["rom_deg"]
                change["rom"] = {"previous_deg": prev["rom_deg"], "now_deg": rom,
                                 "improvement_deg": d, "class": _classify_change(d, tol)}
            for key, c in change.items():
                if c["class"] == "worsened":
                    review.append(f"{key} worsened by {-c['improvement_deg']:.1f} deg vs last session "
                                  f"(beyond {tol:g} deg measurement tolerance)")
        else:
            warnings.append("no previous session supplied: trend cannot be assessed")
    else:
        review.append("fewer than 2 valid frames: no angle summary")

    if pain >= cfg["pain_review_level"]:
        review.append(f"pain {pain:g}/10 at or above review level {cfg['pain_review_level']:g}")
    if prev and "pain_0_10" in prev and pain - prev["pain_0_10"] >= cfg["pain_increase_review"]:
        review.append(f"pain increased from {prev['pain_0_10']:g} to {pain:g}")

    if not review and target_status:
        statuses = [v["status"] for v in target_status.values()]
        decision = "below_target" if "not_met" in statuses else "on_track"
        if "within_tolerance" in statuses:
            warnings.append("a target is missed by less than the measurement tolerance: "
                            "confirm with a goniometer before calling it met")

    return {
        "tool": TOOL_SPEC["name"],
        "patient_id": session.get("patient_id"),
        "exercise": session.get("exercise"),
        "side": side, "camera_view": view, "coordinate_units": units,
        "settings": cfg,
        "frames": rows,
        "summary": summary,
        "targets": target_status,
        "change_vs_previous": change,
        "pain_0_10": pain,
        "decision": decision,
        "review_triggers": review,
        "warnings": warnings,
        "assumptions": TOOL_SPEC["assumptions"],
        "scope": ("Screening aid only. Not a diagnosis. A clinician decides any change "
                  "to the exercise plan."),
    }
