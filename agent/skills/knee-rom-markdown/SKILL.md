---
name: knee-rom-markdown
description: Screen knee range of motion for a rehab patient from side-view 2D pose landmarks (hip, knee, ankle) during a seated knee extension. Compute knee flexion per frame by hand, reject unreliable frames, summarize extension lag and ROM, compare with clinician targets and the last session, and decide on_track, below_target, or clinician_review. Use for rehab joint-angle evaluation questions.
---

This is the Markdown-only condition. This directory contains only SKILL.md.
Work through the procedure below by hand and show the arithmetic for every
frame (vectors, dot product, lengths, cosine, angle, flexion). Do not call MCP
services, shell commands, calculators, Python, or other computational tools.
Native skill loading and reading the session input file are allowed.
If a calculation cannot be completed confidently, report the uncertainty and
the frames affected instead of inventing a value. Do not claim an executed or
independent numerical check. Arccos values computed by hand are approximate:
state them to the nearest 0.5° and say they are hand estimates.

# Expert procedure: knee range-of-motion screen from 2D pose landmarks

## Scope and analysis selection

Use this procedure for ONE knee during ONE exercise recorded from the side
(sagittal view) by a single phone camera, where a pose model (for example
MediaPipe BlazePose) supplies hip, knee, and ankle landmarks per frame. The
reference exercise is a seated knee extension: the patient sits, thigh
roughly horizontal, and straightens the knee from about 90° of flexion toward
0°. The output is a screening summary for a clinician, not a diagnosis, a
prescription, or permission to progress the exercise plan.

Confirm before calculating:
- camera_view is "sagittal". A frontal or oblique view projects the knee
  angle onto the wrong plane; 2D flexion from those views is not valid. Do not
  "correct" it; stop and route to clinician review.
- One side is analyzed (left or right), and all three landmarks belong to that
  side. Mixing a left hip with a right knee produces a meaningless angle.
- The exercise matches. Squats, gait, and stair climbing involve trunk and
  hip motion and other targets; do not reuse these targets for them.

## Inputs, units, and coordinate meaning

Required: side, camera_view, coordinate_units, frames (each with time t_s and
hip/knee/ankle as [x, y, visibility]), clinician targets
(max_extension_lag_deg, min_rom_deg), and patient-reported pain_0_10.
Optional: previous_session (extension_lag_deg, rom_deg, pain_0_10).
If targets or pain are missing, do not invent them: ask for them, and report
only the measured angles, with no on_track / below_target decision.

Units: landmark x, y in pixels with the image origin at top-left and y
pointing DOWN; angles in degrees; time in seconds; pain on a 0–10 scale.
If coordinates are normalized (0–1, as MediaPipe outputs), multiply x by
image width and y by image height BEFORE computing any angle. Normalized x and
y have different scales on a non-square (e.g. 1080×1920 portrait) image, so
angles computed on unscaled values are distorted. Without image size, stop.

Visibility is the pose model's confidence that a landmark is visible and
correctly placed. It is not a calibrated probability, and a high score does
not guarantee a correct landmark.

## Joint-angle geometry

For each frame, let H = hip, K = knee, A = ankle (pixel coordinates).
1. Thigh vector u = H − K = (Hx − Kx, Hy − Ky). Shank vector v = A − K.
2. Dot product u·v = ux·vx + uy·vy. Lengths |u| = √(ux² + uy²), |v| = √(vx² + vy²).
3. Included angle θ = arccos( u·v / (|u||v|) ), between 0° and 180°. Clamp the
   cosine to [−1, 1] before arccos to absorb rounding.
4. Clinical knee flexion = 180° − θ. A straight leg (H, K, A collinear) has
   θ = 180° and flexion 0°. A right angle at the knee is flexion 90°.

Sanity examples: H=(100,500), K=(500,500), A=(500,900) gives u=(−400,0),
v=(0,400), u·v=0, θ=90°, flexion 90°. H=(100,500), K=(500,500), A=(900,500)
gives θ=180°, flexion 0°. Reporting θ itself as "flexion" is the most common
error; a seated patient with a nearly straight leg must read near 0°, not 180°.

The unsigned arccos angle cannot represent hyperextension (knee straighter
than 0°). Values near 0° may hide hyperextension; say so instead of reporting
a negative number.

## Frame quality: which frames to trust

Reject a frame, and keep the reason, when:
- any of hip, knee, ankle has visibility < 0.5; or
- the thigh length |u| or shank length |v| differs from its median across the
  visibility-passing frames by more than 15%.
In a true side view, thigh and shank pixel lengths stay nearly constant.
A segment that suddenly shortens means the leg rotated out of the camera plane
or a landmark jumped; the 2D angle in that frame is wrong, and it often makes
the knee look straighter or more bent than it really is. Never keep such a
frame because its angle looks favorable.

Compute medians from the visibility-passing frames, not from all frames.
If fewer than 5 frames remain, or fewer than 60% of frames remain, the session
cannot support a decision: report clinician_review.
For long videos (15 or more valid frames), apply a centered median filter of
width 5 to the flexion series before taking extremes; with fewer frames, do not
smooth, because a filter would erase the real end-range frames.

## Session metrics

From the valid (and, if applicable, smoothed) flexion series:
- extension lag = minimum flexion (how far short of straight the knee stays);
- peak flexion = maximum flexion;
- ROM = peak flexion − extension lag.
Keep unrounded values through the comparisons; round to 0.1° only for display.
These are session extremes; this procedure does not segment repetitions.

## Measurement uncertainty

Single-camera pose estimation is not goniometry. One knee-gait study reported
a mean absolute error of 5.88° for MediaPipe knee angles against Kinovea
(IOP Conf. Ser.: Mater. Sci. Eng. 1279, 012004, doi:10.1088/1757-899x/1279/1/012004).
A 2026 JMIR Rehabilitation and Assistive Technologies study (Yue, Gu, Yu,
e102399) found static BlazePose accuracy depended on flexion angle, with RMSE
about 15° against a goniometer, overestimating at shallow flexion and
underestimating at deep flexion. This procedure therefore uses a measurement
tolerance of 5° (a team-chosen screening default, not a validated minimal
detectable change). A difference smaller than the tolerance is not evidence of
change, and a target missed by less than the tolerance is "within tolerance",
not met.

## Decision rules

Targets come from the clinician for this patient; normative values are only
context. Commonly cited normal knee motion is about 0° extension to 135°
flexion (AAOS reference values; see also PMC3435893, which stresses comparing
with the patient's other knee). Rising from a chair needs roughly 90° flexion.
Do not substitute these numbers for the clinician's targets.

For each target compute the miss:
- extension lag miss = extension lag − max_extension_lag_deg;
- ROM miss = min_rom_deg − ROM.
Status: miss ≤ 0 → met; 0 < miss ≤ tolerance → within_tolerance; miss >
tolerance → not_met.

Change versus previous session (improvement positive):
- extension: previous lag − current lag; ROM: current ROM − previous ROM.
Class: > +tolerance improved; < −tolerance worsened; otherwise
no_detectable_change.

Clinician-review triggers (any one forces decision = clinician_review):
- camera view not sagittal;
- insufficient reliable frames (rule above);
- implausible peak flexion > 150° for this exercise;
- either metric worsened beyond the tolerance versus last session;
- pain ≥ 6/10, or pain increased by ≥ 2 points since last session.

If no trigger fires: decision = below_target when any target is not_met;
otherwise on_track. If a target is within_tolerance, add the note "confirm
with a goniometer before calling it met". All thresholds here (0.5, 15%, 5°,
150°, pain 6 and +2) are team-chosen screening defaults for a course project,
not clinical standards; a clinician must approve them before real use.

## Verification, reporting, and human review

Check before reporting:
- the flexion convention (straight leg ≈ 0°) on at least one frame;
- that every rejected frame has a stated reason, and the valid count;
- that ROM = peak flexion − extension lag;
- that conclusions about change respect the tolerance;
- one frame recomputed independently (by hand from the coordinates, or a
  goniometer reading on the patient) and labeled with its source.

Report a compact table: per frame t_s, flexion, thigh and shank length,
status and reason; then extension lag, peak flexion, ROM, each target with
status, change versus last session with class, pain, review triggers, and the
decision. Explain the decision in plain language: which number drove it and
which frames were excluded.

A person must review the output whenever: any review trigger fires; data or
targets are missing; a target is within tolerance; the result will change the
exercise plan; or the patient reports new symptoms (swelling, instability,
locking, sharp pain). The screen omits swelling, strength, quadriceps lag
versus passive extension, compensation at the hip or trunk, pain quality,
surgical precautions, and 3D motion. Name any of these that could change the
interpretation before giving the result.
