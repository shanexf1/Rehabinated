// Run: node joint-tracker/tests/kneeAngles.test.mjs  (from the repo root)
// Checks the phone app's angle/quality module against the agent's Python script.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { kneeFlexionDeg, analyzeFrames, poseToFrame } from "../js/kneeAngles.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const example = join(here, "..", "examples", "session_input.json");
const session = JSON.parse(readFileSync(example, "utf8"));

// 1. Convention: straight leg = 0 deg, right angle = 90 deg.
assert.equal(Math.round(kneeFlexionDeg([100, 500], [500, 500], [900, 500])), 0);
assert.equal(Math.round(kneeFlexionDeg([100, 500], [500, 500], [500, 900])), 90);

// 2. Same per-frame angles, statuses, and summary as the Python script.
const js = analyzeFrames(session.frames);
const py = JSON.parse(execFileSync("python3", [
  join(repo, "agent/skills/knee-rom-scripted/scripts/analyze_knee_rom.py"), "--input", example,
], { encoding: "utf8" }));
js.rows.forEach((r, i) => {
  assert.ok(Math.abs(r.flexion_deg - py.frames[i].flexion_deg) < 1e-9, `frame ${i} angle`);
  assert.equal(r.status, py.frames[i].status, `frame ${i} status`);
});
for (const k of ["extension_lag_deg", "peak_flexion_deg", "rom_deg"]) {
  assert.ok(Math.abs(js.summary[k] - py.summary[k]) < 1e-9, k);
}
assert.equal(js.validFrames, py.summary.valid_frames);

// 3. Smoothing path (>= 15 frames) matches too.
const long = { ...session, frames: [] };
for (let rep = 0; rep < 3; rep++) session.frames.forEach((f, i) =>
  long.frames.push({ ...f, t_s: rep * 5 + i * 0.5 }));
const tmp = join(here, "..", "examples", ".long_test.json");
await import("node:fs").then((fs) => fs.writeFileSync(tmp, JSON.stringify(long)));
const pyLong = JSON.parse(execFileSync("python3", [
  join(repo, "agent/skills/knee-rom-scripted/scripts/analyze_knee_rom.py"), "--input", tmp,
], { encoding: "utf8" }));
await import("node:fs").then((fs) => fs.unlinkSync(tmp));
const jsLong = analyzeFrames(long.frames);
assert.equal(jsLong.smoothing, pyLong.summary.smoothing);
assert.ok(Math.abs(jsLong.summary.rom_deg - pyLong.summary.rom_deg) < 1e-9, "smoothed ROM");

// 4. MediaPipe normalized landmarks -> pixel frame for the chosen side.
const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0.1 }));
lm[24] = { x: 0.5, y: 0.5, visibility: 0.9 };  // right hip
lm[26] = { x: 0.75, y: 0.5, visibility: 0.9 }; // right knee
lm[28] = { x: 0.75, y: 0.75, visibility: 0.9 }; // right ankle
const fr = poseToFrame(lm, "right", 1080, 1920, 1.23456);
assert.deepEqual(fr, { t_s: 1.235, hip: [540, 960, 0.9], knee: [810, 960, 0.9], ankle: [810, 1440, 0.9] });
// 270 px thigh across, 480 px shank down: still a right angle in pixels.
assert.equal(Math.round(kneeFlexionDeg(fr.hip, fr.knee, fr.ankle)), 90);

console.log("all knee-angle tests passed:", JSON.stringify(js.summary));
