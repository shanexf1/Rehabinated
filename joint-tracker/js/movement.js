// Knee evaluation tests: body features per frame, choice of the leg to report, rotation helpers for lying down, and 30-s chair stand
// counting. Pure functions only (no DOM, no MediaPipe).
import { kneeFlexionDeg, median } from "./kneeAngles.js";

export const TESTS = Object.freeze({
  lying_knee_rom: {
    label: "Lying knee test",
    kind: "rom", singleLeg: true, lying: true,
    setup: "Lie on your back, side-on to the phone. Phone on the floor in landscape at hip level, about 2 m away. " +
           "1) Push the knee straight down as far as you can and hold 2 s. 2) Slide the heel toward your buttock as far as you can. Repeat 2–3 times.",
  },
  seated_knee_rom: {
    label: "Seated knee test",
    kind: "rom", singleLeg: true, lying: false,
    setup: "Sit side-on on a firm chair, phone at knee height about 2 m away. " +
           "1) Straighten the knee as far as you can and hold 2 s. 2) Slide the foot back under the chair as far as you can. Repeat 2–3 times.",
  },
  chair_stand_30s: {
    label: "30-second chair stand",
    kind: "chair_stand", singleLeg: false, lying: false,
    setup: "Chair against a wall, arms crossed on your chest, side-on to the phone. Press Record, wait for Go, " +
           "then stand up fully and sit down as many times as you can. The app stops after 30 s.",
  },
});

export const CHAIR = Object.freeze({
  sitDeg: 65,            // knee flexion at or above this = sitting
  standDeg: 30,          // knee flexion at or below this = standing (counted)
  fullStandDeg: 20,      // stand counted as knee fully straight when it reaches this
  windowS: 30,
});

const IDX = { nose: 0, lShoulder: 11, rShoulder: 12, left: { hip: 23, knee: 25, ankle: 27 }, right: { hip: 24, knee: 26, ankle: 28 } };
const VIS_OK = 0.5;
const deg = (r) => (r * 180) / Math.PI;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function px(lm, i, W, H) {
  const p = lm[i];
  return [p.x * W, p.y * H, Number.isFinite(p.visibility) ? p.visibility : 0];
}

function avgVisible(a, b) {
  if (a[2] >= VIS_OK && b[2] >= VIS_OK) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.min(a[2], b[2])];
  return a[2] >= b[2] ? a : b;
}

function angleTo(v, ref) {
  const n = Math.hypot(v[0], v[1]);
  if (!n) return NaN;
  return deg(Math.acos(Math.max(-1, Math.min(1, (v[0] * ref[0] + v[1] * ref[1]) / n))));
}

// Per-frame features in pixel space (y points down).
export function frameFeatures(lm, W, H) {
  const sh = avgVisible(px(lm, IDX.lShoulder, W, H), px(lm, IDX.rShoulder, W, H));
  const hip = avgVisible(px(lm, IDX.left.hip, W, H), px(lm, IDX.right.hip, W, H));
  const legs = {};
  for (const side of ["left", "right"]) {
    const h = px(lm, IDX[side].hip, W, H), k = px(lm, IDX[side].knee, W, H), a = px(lm, IDX[side].ankle, W, H);
    legs[side] = {
      flex: kneeFlexionDeg(h, k, a),
      thighTilt: angleTo([k[0] - h[0], k[1] - h[1]], [0, 1]), // 0 = thigh pointing down, 90 = horizontal
      vis: Math.min(h[2], k[2], a[2]),
    };
  }
  const nose = px(lm, IDX.nose, W, H);
  return {
    torsoTilt: angleTo([sh[0] - hip[0], sh[1] - hip[1]], [0, -1]), // 0 = upright, 90 = lying
    torsoVis: Math.min(sh[2], hip[2]),
    headLeft: nose[0] < hip[0],
    legs,
  };
}

export const pct = (arr, p) => {
  const s = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
};

// Leg to report: for single-leg tests the visible leg that moves most; for the
// chair stand (both legs move) the leg the camera sees best.
export function pickLeg(feats, testId) {
  const stats = {};
  for (const side of ["left", "right"]) {
    const vis = feats.map((f) => f.legs[side].vis);
    const okFlex = feats.filter((f) => f.legs[side].vis >= VIS_OK).map((f) => f.legs[side].flex);
    stats[side] = {
      visFrac: okFlex.length / Math.max(1, feats.length),
      meanVis: vis.reduce((a, b) => a + b, 0) / Math.max(1, vis.length),
      range: okFlex.length >= 3 ? pct(okFlex, 90) - pct(okFlex, 10) : 0,
    };
  }
  const byVis = stats.right.meanVis >= stats.left.meanVis ? "right" : "left";
  const cands = ["left", "right"].filter((s) => stats[s].visFrac >= 0.5);
  if (cands.length < 2) return { side: cands[0] ?? byVis, stats, reason: "only leg visible enough" };
  if (TESTS[testId] && !TESTS[testId].singleLeg) return { side: byVis, stats, reason: "both legs move: best-seen leg" };
  const [a, b] = stats.left.range >= stats.right.range ? ["left", "right"] : ["right", "left"];
  if (stats[a].range - stats[b].range < 10) return { side: byVis, stats, reason: "similar motion: best-seen leg" };
  return { side: a, stats, reason: "leg that moves most" };
}

// Rotation that shows a lying person upright to the pose model.
// 90 (clockwise): original (x, y) -> rotated (H - y, x); -90: (x, y) -> (y, W - x).
export function rotationForHead(headLeft) { return headLeft ? 90 : -90; }

export function unrotateLandmarks(lm, rotation) {
  if (!rotation) return lm;
  return lm.map((p) => {
    const u = p.x, v = p.y;
    const [x, y] = rotation === 90 ? [v, 1 - u] : [1 - v, u];
    return { ...p, x, y };
  });
}

export function drawRotated(ctx, source, W, H, rotation) {
  ctx.save();
  if (rotation === 90) { ctx.translate(H, 0); ctx.rotate(Math.PI / 2); }
  else { ctx.translate(0, W); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(source, 0, 0, W, H);
  ctx.restore();
}

// 30-second chair stand from a flexion series [{t, flex}] of trusted frames.
// Timing starts at `startT` if given (countdown "Go"), else when the person first
// starts to rise from sitting. A stand counts when the knee reaches standDeg after
// sitting; if the person is more than halfway up when 30 s ends, that stand counts
// too (OARSI 30-s chair stand rule).
export function countChairStands(series, { startT = null, ...opts } = {}) {
  const c = { ...CHAIR, ...opts };
  const s = series.filter((p) => Number.isFinite(p.flex)).sort((a, b) => a.t - b.t);
  const sm = s.map((p, i) => ({ t: p.t, flex: median(s.slice(Math.max(0, i - 1), i + 2).map((q) => q.flex)) }));
  let t0 = startT;
  if (t0 == null) {
    const firstStand = sm.findIndex((p) => p.flex <= c.standDeg);
    const lastSit = sm.slice(0, Math.max(0, firstStand)).map((p) => p.flex >= c.sitDeg).lastIndexOf(true);
    if (firstStand < 0 || lastSit < 0) {
      return { reps: 0, t0: null, tEnd: null, stands: [], halfwayCounted: false,
               note: "No sit-to-stand found: start seated, then stand up fully." };
    }
    t0 = sm[lastSit].t;
  }
  const tEnd = t0 + c.windowS;
  const win = sm.filter((p) => p.t >= t0 && p.t <= tEnd);
  const stands = [];
  let phase = win.length && win[0].flex <= c.standDeg ? "standing" : "sitting";
  let cur = null;
  for (const p of win) {
    if (phase === "sitting" && p.flex <= c.standDeg) {
      phase = "standing"; cur = { t: p.t, minFlex: p.flex }; stands.push(cur);
    } else if (phase === "standing") {
      if (cur) cur.minFlex = Math.min(cur.minFlex, p.flex);
      if (p.flex >= c.sitDeg) { phase = "sitting"; cur = null; }
    }
  }
  for (const st of stands) st.fullyStraight = st.minFlex <= c.fullStandDeg;
  // Halfway rule uses the raw value nearest the 30 s mark (smoothing at the very end
  // of a series would pull it back toward earlier, more bent samples).
  let halfwayCounted = false;
  const last = win[win.length - 1];
  const rawEnd = s.filter((p) => p.t <= tEnd).at(-1);
  const coversWindow = last && last.t >= tEnd - 0.3;
  if (coversWindow && phase === "sitting" && rawEnd.flex < (c.sitDeg + c.standDeg) / 2) halfwayCounted = true;
  const reps = stands.length + (halfwayCounted ? 1 : 0);
  const notes = [];
  if (win.length && win[0].flex <= c.standDeg) notes.push("You were already standing at the start: begin seated.");
  if (!coversWindow) notes.push(`Recording covers only ${last ? (last.t - t0).toFixed(1) : 0} s of the 30 s.`);
  const note = notes.join(" ");
  return { reps, t0, tEnd, stands, halfwayCounted, coversWindow: !!coversWindow, note };
}
