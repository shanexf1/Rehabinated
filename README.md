# Rehabinated

Home rehab coach phone app (AI Design, Project 2).

The first working piece is a **knee joint tracker** that runs in a phone browser
and hands its measurements to an **agent skill** that interprets them.

```
phone camera ──► MediaPipe Pose (on the phone) ──► knee flexion per frame
            ──► session_input.json ──► knee-rom agent skill ──► on_track / below_target / clinician_review
```

## Knee tracker (phone web app)

Live app (after GitHub Pages is enabled): **https://shanexf1.github.io/Rehabinated/joint-tracker/**

How to use it:
1. Open the link in Safari (iPhone) or Chrome (Android) and allow camera access.
2. Put the phone at knee height, 2–3 m away, side-on to the leg, with hip, knee
   and ankle all in frame and good light.
3. **Start camera → Record**, do the seated knee extension, then **Stop & review**.
   You can also **Analyze a video** you already filmed with the phone camera.
4. Check the preview (extension lag, peak flexion, ROM, frames rejected), fill in
   the clinician targets, pain, and last session if known, then **Share JSON**.

What it does:
- Runs MediaPipe Pose Landmarker (lite or full) on the phone, GPU with CPU fallback.
  Video never leaves the phone; only landmark numbers are exported.
- Shows live knee flexion (0° = straight) with warnings when a landmark is not
  visible or the leg turns out of the camera plane.
- Records hip, knee, ankle `[x, y, visibility]` in pixels at 10 samples/s (adjustable),
  and picks the leg facing the camera automatically.
- Applies the same frame rules as the agent script (visibility < 0.5 rejected,
  thigh/shank length > 15% off median rejected, median smoothing for ≥ 15 frames).
- Remembers the last session's summary per patient ID on the phone to prefill
  "last session" next time.

The preview is not the decision. The exported file goes to the agent skill,
which applies the targets, measurement tolerance, trend and review triggers.

### Files

| Path | What it is |
|---|---|
| `joint-tracker/index.html`, `css/`, `js/app.js` | Phone UI, camera, MediaPipe, recording, export |
| `joint-tracker/js/kneeAngles.js` | Pure angle and frame-quality functions (no DOM) |
| `joint-tracker/tests/kneeAngles.test.mjs` | Checks the JS against the Python script: `node joint-tracker/tests/kneeAngles.test.mjs` |
| `joint-tracker/examples/session_input.json` | Synthetic example session (two planted bad frames) |
| `agent/skills/knee-rom-markdown/` | Agent skill, Markdown only |
| `agent/skills/knee-rom-scripted/` | Agent skill with `scripts/analyze_knee_rom.py` |
| `notebooks/Knee_ROM_Skills_Colab.ipynb` | Colab demo comparing both skills with OpenCode |

### Session file format

```json
{
  "patient_id": "P-anon-01", "exercise": "seated_knee_extension", "side": "right",
  "camera_view": "sagittal", "coordinate_units": "pixels",
  "image_width_px": 720, "image_height_px": 1280,
  "frames": [{"t_s": 0.0, "hip": [x, y, vis], "knee": [x, y, vis], "ankle": [x, y, vis]}],
  "targets": {"max_extension_lag_deg": 5, "min_rom_deg": 90},
  "previous_session": {"extension_lag_deg": 12, "rom_deg": 70, "pain_0_10": 3},
  "pain_0_10": 3,
  "source": {"app": "rehabinated-joint-tracker", "pose_model": "...", "sample_rate_hz": 10}
}
```

Run the agent's script on an exported file:

```bash
python agent/skills/knee-rom-scripted/scripts/analyze_knee_rom.py --input knee_session_....json
```

### Notes and limits

- Needs HTTPS for camera access, which GitHub Pages provides. Opening `index.html`
  as a local file will not get camera permission.
- The MediaPipe library loads from jsDelivr and the model from Google storage.
  If Google storage is blocked on your network, put `pose_landmarker_lite.task`
  (and `pose_landmarker_full.task`) in `joint-tracker/models/`; the app uses
  local copies first.
- 2D single-camera angles carry several degrees of error and are only valid from a
  side view. This is a course prototype and screening aid, not a medical device.
- Not yet: other joints, repetition counting, signed angles for hyperextension.

### Enabling GitHub Pages (one time)

Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch →
Branch: `main`, folder `/ (root)` → Save**. The site appears at the link above
within a minute or two.

## AI use

The tracker app, angle module, tests, agent skills, scripts, and notebook were
written with Claude (Anthropic) and reviewed by the team.
