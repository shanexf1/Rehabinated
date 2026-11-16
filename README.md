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

It runs five knee evaluation tests. You pick the test (and, if needed, the leg)
before recording; both can be corrected afterwards on the results screen.

| Test | What you do | What it reports |
|---|---|---|
| **Lying knee test** | Lie on your back, push the knee straight down (hold 2 s), then slide the heel toward your buttock. Phone on the floor in landscape. | Best straightening (how far short of 0°) and deepest bend |
| **Seated knee test** | Sit on a chair, straighten the knee (hold 2 s), then slide the foot back under the chair. | Best straightening and deepest bend; compare with the lying test for extensor lag |
| **30-second chair stand** | Arms crossed, stand up fully and sit down as many times as you can in 30 s. | Stands in 30 s (OARSI core test), and whether the knee straightened at each stand |
| **Straight leg raise** | Lie on your back, other knee bent. Lift the straight leg to the height of the other knee, hold 3 s, lower. Repeat 3–5 times. | Lifts; knee bend at the top of each lift (extensor / quad lag); lift height; hold time |
| **Single-leg stand** | Face the phone, stand on the tested leg, lift the other foot and hold up to 30 s. Repeat 2–3 times. | Hold time per attempt and best, which leg was stood on |

How to use it:
1. Open the link in Safari (iPhone) or Chrome (Android) and allow camera access.
2. Put the phone side-on to the leg, 2–3 m away, whole body in frame, good light.
   The setup line above the camera explains each test.
3. Pick the **Test** (the app remembers your last choice) and the **Leg** (Auto picks
   the leg that moves most). The line under the menus explains the setup.
4. **Start camera → Record**, do the test, then **Stop & review**. For the chair stand
   the app counts down 3, 2, 1, Go and stops by itself after 30 s.
5. Check the result. If the test or leg was wrong, change it on the results screen or
   in the Leg menu and the numbers are recalculated. Then fill in pain and targets and
   **Share JSON**.

How it works:
- MediaPipe Pose Landmarker (lite or full) runs on the phone, GPU with CPU fallback.
  Video never leaves the phone; only landmark numbers are exported.
- **The test is always chosen by the user** (no automatic detection).
- **Which leg** (Auto): for the lying and seated tests, the visible leg that moves most
  (not just the leg nearest the camera); for the chair stand, the best-seen leg. The live
  view sticks to one leg and only switches after the other leg has looked better for
  about a second. Left/Right in the Leg menu overrides it.
- **Lying down**: pose models find upright people best, so for the lying test the frame
  is rotated 90° (head up) before detection and the points are rotated back. If no person
  is found, the app tries the other orientations.
- **Straight leg raise**: lift height is hip flexion from the shoulder–hip line. A lift
  counts when it rises above 20° from the leg resting on the floor and ends below 10°.
  At the top of each lift (≥ 70% of its peak) the knee angle is the extensor lag. Auto
  leg = the leg whose hip moves most (its knee hardly moves).
- **Single-leg stand** (front view): the lifted foot is the higher ankle. A hold starts
  when it is 8% of leg length above the other for 0.3 s and ends when it is back below
  4% for 0.2 s, or after a 30 s cap (a new attempt then needs the foot down first).
  Tracking gaps over 0.5 s end the attempt. Auto leg = the foot that stayed down.
- **Chair stand counting**: a stand counts when the knee reaches ≤ 30° after sitting
  (≥ 65°); a stand is "fully straight" at ≤ 20°. Timing starts at Go (for an uploaded
  video, at the first rise). If you are more than
  halfway up at 30 s (knee angle interpolated at exactly 30 s), that stand counts, as in
  the OARSI protocol. If you were already
  standing at Go, the result says so.
- Frame rules match the agent script: visibility < 0.5 rejected, thigh/shank length
  > 15% off median rejected, median smoothing for ≥ 15 frames.
- The last result per patient ID **and test** is remembered on the phone to prefill
  "last session".

Limits: the leg choice and all test thresholds were tuned on synthetic poses and have not yet been checked on real
patients or against a goniometer. 2D angles carry several degrees of error and are only
valid side-on. Hyperextension (below 0°) cannot be measured. Prone (face-down) knee bends
count as the lying test. The knee-ROM agent skill still covers only the seated
extension format; the new tests export an `evaluation` block it does not read yet.

The preview is not the decision. The exported file goes to the PT or the agent skill.

### Files

| Path | What it is |
|---|---|
| `joint-tracker/index.html`, `css/`, `js/app.js` | Phone UI, camera, MediaPipe, recording, export |
| `joint-tracker/js/kneeAngles.js` | Pure angle and frame-quality functions (no DOM) |
| `joint-tracker/js/movement.js` | Test definitions, leg choice, lying rotation, chair-stand counting, leg-raise and single-leg-stand analysis |
| `joint-tracker/tests/kneeAngles.test.mjs` | Checks the JS against the Python script: `node joint-tracker/tests/kneeAngles.test.mjs` |
| `joint-tracker/tests/movement.test.mjs` | Leg choice, ROM and stand counting on synthetic poses: `node joint-tracker/tests/movement.test.mjs` |
| `joint-tracker/tests/synthPose.mjs` | Synthetic side-view poses for the three tests |
| `joint-tracker/examples/session_input.json` | Synthetic example session (two planted bad frames) |
| `agent/skills/knee-rom-markdown/` | Agent skill, Markdown only |
| `agent/skills/knee-rom-scripted/` | Agent skill with `scripts/analyze_knee_rom.py` |
| `notebooks/Knee_ROM_Skills_Colab.ipynb` | Colab demo comparing both skills with OpenCode |

### Session file format

```json
{
  "patient_id": "P-anon-01", "exercise": "seated_knee_rom",
  "test_selected_by": "user",
  "side": "left", "side_reason": "leg that moves most",
  "camera_view": "sagittal", "coordinate_units": "pixels",
  "image_width_px": 720, "image_height_px": 1280,
  "frames": [{"t_s": 0.0, "hip": [x, y, vis], "knee": [x, y, vis], "ankle": [x, y, vis]}],
  "evaluation": {"type": "seated_knee_rom", "best_extension_deg": 4.5, "max_flexion_deg": 110.8, "rom_deg": 106.3},
  "pain_0_10": 3,
  "source": {"app": "rehabinated-joint-tracker", "app_version": "0.4.0", "detection_rotation_deg": 0}
}
```

`exercise` is `lying_knee_rom`, `seated_knee_rom`, `chair_stand_30s`,
`straight_leg_raise` or `single_leg_stand`. Frames also carry each side's `shoulder`
point (used for the leg-raise hip angle); single-leg stand frames add `other_ankle`.
For the straight leg raise, `evaluation` holds lifts, knee bend at the top (median and
worst), lift height and hold time, plus each lift. For the single-leg stand it holds the
stance leg, each attempt's hold time and how it ended, and the best hold.
For the chair stand, `evaluation` holds `stands_30s`, each stand's time and knee angle,
`fully_straight`, whether the halfway rule was used, and how timing started.

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
