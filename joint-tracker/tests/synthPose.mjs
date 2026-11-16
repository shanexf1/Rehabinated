// Synthetic MediaPipe-style pose (33 normalized landmarks) for each evaluation test,
// seen from the side, person facing +x. Used by unit tests and the browser test stub.
const rad = (d) => (d * Math.PI) / 180;
const dirDown = (a) => [Math.sin(rad(a)), Math.cos(rad(a))];   // angle from straight down, + = forward
const dirUp = (a) => [Math.sin(rad(a)), -Math.cos(rad(a))];    // angle from straight up, + = forward
const add = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s];

// Smooth 0 -> 1 -> 0 over one period.
const bump = (t, period) => (1 - Math.cos((2 * Math.PI * t) / period)) / 2;

let seed = 1;
const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 4; };

// Straight leg raise: hip flexion over one 6 s cycle (rise 1 s, hold 3 s, lower 1 s, rest 1 s).
export function truthHipSLR(t, o = {}) {
  const P = 6, u = ((t % P) + P) % P, top = o.lift ?? 40;
  if (u < 1) return top * bump(u, 2);
  if (u < 4) return top;
  if (u < 5) return top * (1 - bump(u - 4, 2));
  return 0;
}

// Single-leg stand: list of [start, end] seconds when the other foot is lifted.
export const BAL_SCHEDULE = [[2, 14], [17, 37.5], [40, 45.5]];
export const footLifted = (t, sched = BAL_SCHEDULE) => sched.some(([a, b]) => t >= a && t < b);

/** Knee flexion of the moving leg over time for each test. */
export function truthFlex(test, t, o = {}) {
  if (test === "straight_leg_raise") return (o.lag ?? 0) * truthHipSLR(t, o) / (o.lift ?? 40) + 2;
  if (test === "single_leg_stand") return 3;
  if (test === "lying_knee_rom") return 6 + 109 * bump(t, o.period ?? 5);          // 6 (straight) -> 115
  if (test === "seated_knee_rom") {                                                // 90 -> 8 -> 90 -> 115 -> 90
    const P = o.period ?? 8, u = ((t % P) + P) % P;
    return u < P / 2 ? 90 - 82 * bump(u, P / 2) : 90 + 25 * bump(u - P / 2, P / 2);
  }
  if (test === "chair_stand_30s") return (o.standFlex ?? 3) + (95 - (o.standFlex ?? 3)) * (1 - bump(t, o.period ?? 2.5));
  throw new Error(`unknown test ${test}`);
}

/**
 * @param {string} test lying_knee_rom | seated_knee_rom | chair_stand_30s
 * @param {number} t seconds
 * @param {object} o { W, H, movingSide, visMoving, visOther, period, standFlex }
 */
export function synthPose(test, t, o = {}) {
  if (test === "single_leg_stand") return synthStand(t, o);
  const lying = test === "lying_knee_rom" || test === "straight_leg_raise";
  const W = o.W ?? (lying ? 1280 : 720), H = o.H ?? (lying ? 720 : 1280);
  const L = 0.9 * (lying ? W : H), Lt = 0.22 * L, Ls = 0.22 * L, Lb = 0.3 * L;
  const flex = truthFlex(test, t, o);
  let hip, knee, ankle, kneeO, ankleO, shoulder, nose;
  if (test === "chair_stand_30s") {
    ankle = [0.5 * W, 0.88 * H];
    const beta = 0.08 * flex;                             // shank leans forward a little when seated
    knee = add(ankle, dirUp(beta), Ls);
    hip = add(knee, dirUp(beta - flex), Lt);
    shoulder = add(hip, dirUp(0.25 * flex), Lb);          // trunk leans forward when seated/rising
    kneeO = [knee[0] + 4, knee[1]]; ankleO = [ankle[0] + 4, ankle[1]];
  } else if (test === "seated_knee_rom") {
    hip = [0.2 * W, 0.55 * H];
    knee = add(hip, dirDown(87), Lt);
    ankle = add(knee, dirDown(90 - flex), Ls);
    shoulder = add(hip, dirUp(3), Lb);
    kneeO = [knee[0] + 4, knee[1]]; ankleO = add(kneeO, dirDown(0), Ls);
  } else if (test === "straight_leg_raise") {
    hip = [0.42 * W, 0.66 * H];
    shoulder = [hip[0] - Lb, hip[1] - 4];
    const hf = truthHipSLR(t, o);
    knee = add(hip, [Math.cos(rad(hf)), -Math.sin(rad(hf))], Lt);
    ankle = add(knee, [Math.cos(rad(hf - flex)), -Math.sin(rad(hf - flex))], Ls);
    // other leg: knee bent, foot flat
    kneeO = add(hip, [Math.cos(rad(45)), -Math.sin(rad(45))], Lt);
    ankleO = add(kneeO, [Math.cos(rad(-45)), -Math.sin(rad(-45))], Ls);
  } else {
    hip = [0.42 * W, 0.66 * H];
    shoulder = [hip[0] - Lb, hip[1] - 4];
    const alpha = 0.55 * flex;                             // hip flexion lifts the thigh
    knee = add(hip, [Math.cos(rad(alpha)), -Math.sin(rad(alpha))], Lt);
    ankle = add(knee, [Math.cos(rad(alpha - flex)), -Math.sin(rad(alpha - flex))], Ls);
    kneeO = [hip[0] + Lt, hip[1] + 4]; ankleO = [kneeO[0] + Ls, kneeO[1]];
  }
  nose = lying ? [shoulder[0] - 0.07 * L, shoulder[1] - 0.02 * L] : add(shoulder, [0.25, -1], 0.09 * L);

  const vM = o.visMoving ?? 0.95, vO = o.visOther ?? 0.9;
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.2 }));
  const put = (i, p, v) => { lm[i] = { x: (p[0] + noise()) / W, y: (p[1] + noise()) / H, z: 0, visibility: v }; };
  const moving = o.movingSide ?? "right";
  const M = moving === "right" ? { hip: 24, knee: 26, ankle: 28, sh: 12 } : { hip: 23, knee: 25, ankle: 27, sh: 11 };
  const O = moving === "right" ? { hip: 23, knee: 25, ankle: 27, sh: 11 } : { hip: 24, knee: 26, ankle: 28, sh: 12 };
  put(0, nose, 0.95);
  put(M.sh, shoulder, vM); put(O.sh, [shoulder[0] + 3, shoulder[1]], vO);
  put(M.hip, hip, vM); put(M.knee, knee, vM); put(M.ankle, ankle, vM);
  put(O.hip, [hip[0] + 3, hip[1]], vO); put(O.knee, kneeO, vO); put(O.ankle, ankleO, vO);
  return { landmarks: lm, flex, W, H };
}

// Rotate landmarks into the frame the model sees when the app draws the image
// rotated (inverse of unrotateLandmarks).
export function rotateLandmarks(lm, rotation) {
  if (!rotation) return lm;
  return lm.map((p) => {
    const [u, v] = rotation === 90 ? [1 - p.y, p.x] : [p.y, 1 - p.x];
    return { ...p, x: u, y: v };
  });
}

// Front view, person facing the camera: their right side appears on the image left.
function synthStand(t, o = {}) {
  const W = o.W ?? 720, H = o.H ?? 1280, L = 0.9 * H, Lt = 0.22 * L, Ls = 0.22 * L, Lb = 0.3 * L;
  const stance = o.stance ?? "right";
  const lifted = footLifted(t, o.schedule);
  const x = { right: 0.44 * W, left: 0.56 * W };
  const hipY = 0.47 * H;
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.2 }));
  const put = (i, p, v = 0.93) => { lm[i] = { x: (p[0] + noise()) / W, y: (p[1] + noise()) / H, z: 0, visibility: v }; };
  const sway = 6 * Math.sin(t * 1.7);
  for (const side of ["right", "left"]) {
    const I = side === "right" ? { sh: 12, hip: 24, knee: 26, ankle: 28 } : { sh: 11, hip: 23, knee: 25, ankle: 27 };
    const hx = x[side] + sway;
    const up = lifted && side !== stance;
    const kneeP = [hx, hipY + Lt * (up ? 0.9 : 1)];
    const ankleP = [hx, up ? kneeP[1] + Ls * 0.55 : kneeP[1] + Ls];   // bent knee: foot about 0.2 L higher
    put(I.sh, [hx, hipY - Lb]); put(I.hip, [hx, hipY]); put(I.knee, kneeP); put(I.ankle, ankleP);
  }
  put(0, [0.5 * W + sway, hipY - Lb - 0.09 * L]);
  return { landmarks: lm, flex: 3, W, H, lifted };
}
