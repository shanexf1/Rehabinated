// Run: node joint-tracker/tests/movement.test.mjs  (from the repo root)
import assert from "node:assert/strict";
import { frameFeatures, pickLeg, unrotateLandmarks, countChairStands, analyzeSLR, analyzeBalance, TESTS, CHAIR, SLR }
  from "../js/movement.js";
import { poseToFrame, analyzeFrames, kneeFlexionDeg } from "../js/kneeAngles.js";
import { synthPose, rotateLandmarks, truthFlex, truthHipSLR } from "./synthPose.mjs";

function run(test, o = {}, seconds = 8, hz = 10) {
  const feats = [], frames = { left: [], right: [] }, truth = [];
  for (let i = 0; i < seconds * hz; i++) {
    const t = i / hz;
    const { landmarks, flex, W, H } = synthPose(test, t, o);
    feats.push(frameFeatures(landmarks, W, H));
    frames.left.push(poseToFrame(landmarks, "left", W, H, t));
    frames.right.push(poseToFrame(landmarks, "right", W, H, t));
    truth.push(flex);
  }
  return { feats, frames, truth };
}

// 2. ROM tests report the moving leg; best extension and max flexion match the truth.
for (const test of ["lying_knee_rom", "seated_knee_rom"]) {
  for (const movingSide of ["right", "left"]) {
    const { feats, frames, truth } = run(test, { movingSide, visMoving: 0.7, visOther: 0.97 }, 10);
    const leg = pickLeg(feats, test);
    assert.equal(leg.side, movingSide, `${test}: picked ${leg.side} (${leg.reason})`);
    const a = analyzeFrames(frames[leg.side]).summary;
    // Median smoothing trims peaks the synthetic motion only touches for an instant
    // (real patients are told to hold end range), so allow 4 degrees.
    assert.ok(Math.abs(a.extension_lag_deg - Math.min(...truth)) < 4, `${test} extension ${a.extension_lag_deg} vs ${Math.min(...truth)}`);
    assert.ok(Math.abs(a.peak_flexion_deg - Math.max(...truth)) < 4, `${test} flexion ${a.peak_flexion_deg} vs ${Math.max(...truth)}`);
  }
}

// 3. Chair stand: both legs move, so the best-seen leg is reported.
{
  const { feats } = run("chair_stand_30s", { movingSide: "left", visMoving: 0.95, visOther: 0.7 });
  assert.equal(pickLeg(feats, "chair_stand_30s").side, "left");
}

// 4. Chair stand counting against the truth, for several paces, with the same
//    start definition (last seated sample before the first stand).
function expectedStands(o, hz = 10, seconds = 40) {
  const s = Array.from({ length: seconds * hz }, (_, i) => ({ t: i / hz, flex: truthFlex("chair_stand_30s", i / hz, o) }));
  const first = s.findIndex((p) => p.flex <= CHAIR.standDeg);
  const t0 = s.slice(0, first).filter((p) => p.flex >= CHAIR.sitDeg).at(-1).t;
  let n = 0, phase = "sitting", last;
  for (const p of s.filter((q) => q.t >= t0 && q.t <= t0 + 30)) {
    if (phase === "sitting" && p.flex <= CHAIR.standDeg) { n++; phase = "standing"; }
    else if (phase === "standing" && p.flex >= CHAIR.sitDeg) phase = "sitting";
    last = p;
  }
  if (phase === "sitting" && last.flex < (CHAIR.sitDeg + CHAIR.standDeg) / 2) n++;
  return n;
}
for (const period of [2.5, 3.2, 4.1]) {
  const { frames } = run("chair_stand_30s", { period }, 40);
  const series = frames.right.map((f) => {
    const [h, k, a] = [f.hip, f.knee, f.ankle];
    return { t: f.t_s, flex: 180 - Math.acos(((h[0]-k[0])*(a[0]-k[0]) + (h[1]-k[1])*(a[1]-k[1])) /
      (Math.hypot(h[0]-k[0], h[1]-k[1]) * Math.hypot(a[0]-k[0], a[1]-k[1]))) * 180 / Math.PI };
  });
  const r = countChairStands(series);
  assert.equal(r.reps, expectedStands({ period }), `period ${period}: counted ${r.reps}`);
  assert.ok(r.stands.every((s) => s.fullyStraight), `period ${period}: all stands straight`);
}
// Stands that never straighten the knee are flagged; a recording shorter than 30 s says so.
{
  const { frames } = run("chair_stand_30s", { period: 3, standFlex: 26 }, 40);
  const series = frames.right.map((f) => ({ t: f.t_s, flex: kneeFlexionDeg(f.hip, f.knee, f.ankle) }));
  const r = countChairStands(series);
  assert.ok(r.reps >= 9 && r.stands.every((s) => !s.fullyStraight), `bent stands: ${JSON.stringify(r.stands[0])}`);
  const short = countChairStands(series.filter((p) => p.t < 12));
  assert.equal(short.coversWindow, false);
}
// Countdown start: timing from "Go" when given.
{
  const s = Array.from({ length: 400 }, (_, i) => ({ t: i / 10, flex: truthFlex("chair_stand_30s", i / 10, { period: 2.5 }) }));
  assert.equal(countChairStands(s, { startT: 0 }).t0, 0);
}

// 5. Rotation round trip, and a lying person rotated clockwise looks upright.
const { landmarks } = synthPose("lying_knee_rom", 1.3);
for (const rot of [90, -90]) {
  unrotateLandmarks(rotateLandmarks(landmarks, rot), rot).forEach((p, i) => {
    assert.ok(Math.abs(p.x - landmarks[i].x) < 1e-12 && Math.abs(p.y - landmarks[i].y) < 1e-12, `rot ${rot} idx ${i}`);
  });
}
assert.ok(frameFeatures(rotateLandmarks(landmarks, 90), 720, 1280).torsoTilt < 20);

// 6. Straight leg raise: the lifting leg is chosen by hip motion (its knee hardly moves),
//    and lifts, lift height, knee lag at the top and hold time match the truth.
for (const lag of [0, 12]) {
  for (const movingSide of ["left", "right"]) {
    const o = { movingSide, visMoving: 0.7, visOther: 0.97, lag };
    const { feats, frames } = run("straight_leg_raise", o, 24);
    const leg = pickLeg(feats, "straight_leg_raise");
    assert.equal(leg.side, movingSide, `SLR leg: ${leg.side} (${leg.reason})`);
    const series = feats.map((f, i) => ({ t: frames.left[i].t_s, hip: f.legs[leg.side].hipFlex, knee: f.legs[leg.side].flex }));
    const r = analyzeSLR(series);
    assert.equal(r.reps.length, 4, `SLR reps ${r.reps.length}`);
    assert.ok(Math.abs(r.lag_median_deg - (lag + 2)) < 2.5, `SLR lag ${r.lag_median_deg} vs ${lag + 2}`);
    assert.ok(Math.abs(r.lift_median_deg - 40) < 3, `SLR lift ${r.lift_median_deg}`);
    const ts = Array.from({ length: 600 }, (_, i) => i / 100).filter((t) => truthHipSLR(t) >= SLR.topFraction * 40);
    const trueHold = ts.at(-1) - ts[0];
    assert.ok(Math.abs(r.hold_median_s - trueHold) < 0.3, `SLR hold ${r.hold_median_s} vs ${trueHold}`);
  }
}
// The resting leg (knee bent, foot flat: hip ~45 deg, never down on the floor) gives no lifts.
{
  const { feats, frames } = run("straight_leg_raise", { movingSide: "left" }, 24);
  const r = analyzeSLR(feats.map((f, i) => ({ t: frames.left[i].t_s, hip: f.legs.right.hipFlex, knee: f.legs.right.flex })));
  assert.equal(r.reps.length, 0, `resting leg lifts: ${r.reps.length}`);
}
// A lift still in progress when recording ends is flagged.
{
  const { feats, frames } = run("straight_leg_raise", {}, 15);
  const r = analyzeSLR(feats.map((f, i) => ({ t: frames.left[i].t_s, hip: f.legs.right.hipFlex, knee: f.legs.right.flex })));
  assert.equal(r.unfinished, true);
}

// 7. Single-leg stand: stance leg found automatically; each hold matches the schedule
//    (12 s, 20.5 s, 5.5 s); a hold past 30 s is capped.
for (const stance of ["right", "left"]) {
  const { frames } = run("single_leg_stand", { stance }, 48);
  const r = analyzeBalance(frames.left, frames.right);
  assert.equal(r.stance, stance, `stance ${r.stance}`);
  const holds = r.attempts.map((a) => a.hold_s);
  [12, 20.5, 5.5].forEach((want, i) => assert.ok(Math.abs(holds[i] - want) < 0.25, `hold ${i}: ${holds[i]} vs ${want}`));
  assert.ok(Math.abs(r.best_s - 20.5) < 0.25);
}
{
  const { frames } = run("single_leg_stand", { schedule: [[1, 40]] }, 42);
  const r = analyzeBalance(frames.left, frames.right);
  assert.equal(r.attempts.length, 1);
  assert.equal(r.attempts[0].hold_s, 30);
  assert.equal(r.attempts[0].ended, "30 s reached");
  // Leg menu set by hand: the given stance leg is used.
  assert.equal(analyzeBalance(frames.left, frames.right, { stance: "right" }).stance, "right");
}
{
  const { frames } = run("single_leg_stand", { schedule: [] }, 10);
  assert.equal(analyzeBalance(frames.left, frames.right).stance, null);   // never lifted
}

console.log("all movement tests passed");
