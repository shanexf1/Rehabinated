// Pure knee-angle math and frame-quality rules. No DOM, no MediaPipe.
// Mirrors agent/skills/knee-rom-scripted/scripts/joint_angles.py so the phone
// preview and the agent's script agree. The script remains the source of truth
// for targets, trends, review triggers, and the decision.

export const DEFAULTS = Object.freeze({
  visibilityMin: 0.5,        // reject frame if hip, knee, or ankle visibility is below this
  segmentTolerance: 0.15,    // reject frame if thigh/shank length is >15% off its median
  minValidFrames: 5,
  minValidFraction: 0.6,
  smoothingMinFrames: 15,    // centered median-5 smoothing only for video-length series
});

// MediaPipe Pose landmark indices (person's own left/right).
export const LANDMARKS = Object.freeze({
  left: { hip: 23, knee: 25, ankle: 27 },
  right: { hip: 24, knee: 26, ankle: 28 },
});

export function includedAngleDeg(a, b, c) {
  const bax = a[0] - b[0], bay = a[1] - b[1];
  const bcx = c[0] - b[0], bcy = c[1] - b[1];
  const na = Math.hypot(bax, bay), nc = Math.hypot(bcx, bcy);
  if (na === 0 || nc === 0) return NaN;
  const cos = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy) / (na * nc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Clinical convention: 0 deg = straight knee, increasing with bending.
export function kneeFlexionDeg(hip, knee, ankle) {
  return 180 - includedAngleDeg(hip, knee, ankle);
}

export function median(values) {
  const s = [...values].sort((x, y) => x - y);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}

// Convert one MediaPipe pose (normalized landmarks) into a session frame in pixels.
export function poseToFrame(landmarks, side, width, height, tSeconds) {
  const idx = LANDMARKS[side];
  const pt = (i) => {
    const p = landmarks[i];
    const vis = Number.isFinite(p.visibility) ? p.visibility : 0;
    return [round1(p.x * width), round1(p.y * height), round3(vis)];
  };
  return { t_s: round3(tSeconds), hip: pt(idx.hip), knee: pt(idx.knee), ankle: pt(idx.ankle) };
}

// Pick the side facing the camera: higher mean visibility of hip, knee, ankle.
export function sideVisibility(landmarks, side) {
  const idx = LANDMARKS[side];
  return (landmarks[idx.hip].visibility + landmarks[idx.knee].visibility +
          landmarks[idx.ankle].visibility) / 3;
}

export function analyzeFrames(frames, settings = {}) {
  const cfg = { ...DEFAULTS, ...settings };
  const rows = frames.map((f, index) => {
    const h = f.hip, k = f.knee, a = f.ankle;
    return {
      index, t_s: f.t_s,
      flexion_deg: kneeFlexionDeg(h, k, a),
      thigh_px: Math.hypot(h[0] - k[0], h[1] - k[1]),
      shank_px: Math.hypot(a[0] - k[0], a[1] - k[1]),
      min_visibility: Math.min(h[2], k[2], a[2]),
      status: "valid", reason: null,
    };
  });
  for (const r of rows) {
    if (!Number.isFinite(r.flexion_deg)) {
      r.status = "rejected"; r.reason = "coincident landmarks";
    } else if (r.min_visibility < cfg.visibilityMin) {
      r.status = "rejected"; r.reason = `low visibility (${r.min_visibility.toFixed(2)})`;
    }
  }
  const visOk = rows.filter((r) => r.status === "valid");
  const medThigh = median(visOk.map((r) => r.thigh_px));
  const medShank = median(visOk.map((r) => r.shank_px));
  for (const r of visOk) {
    const dt = r.thigh_px / medThigh - 1, ds = r.shank_px / medShank - 1;
    if (Math.max(Math.abs(dt), Math.abs(ds)) > cfg.segmentTolerance) {
      r.status = "rejected";
      r.reason = `segment length off median (thigh ${pct(dt)}, shank ${pct(ds)})`;
    }
  }
  const valid = rows.filter((r) => r.status === "valid");
  let series = valid.map((r) => r.flexion_deg);
  let smoothing = "none";
  if (valid.length >= cfg.smoothingMinFrames) {
    series = series.map((_, j) => median(series.slice(Math.max(0, j - 2), j + 3)));
    valid.forEach((r, j) => { r.flexion_smoothed_deg = series[j]; });
    smoothing = "centered median, window 5";
  }
  const n = rows.length, nv = valid.length;
  const enough = nv >= cfg.minValidFrames && nv / Math.max(n, 1) >= cfg.minValidFraction;
  const summary = nv >= 2 ? {
    extension_lag_deg: Math.min(...series),
    peak_flexion_deg: Math.max(...series),
    rom_deg: Math.max(...series) - Math.min(...series),
  } : null;
  return { rows, summary, validFrames: nv, totalFrames: n, enoughFrames: enough,
           smoothing, medianThighPx: medThigh, medianShankPx: medShank };
}

const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;
const pct = (v) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
