import { direction, plannedDuration, plannedRange, type ExerciseDefinition } from '../exercise';
import { LANDMARK_COUNT, LM } from '../landmarks';
import { targetProgressAt } from '../trajectory';
import type { Landmark, PoseFrame } from '../types';

/**
 * Demo mode: generates realistic pose frames for an exercise without a
 * camera, including deliberate mistakes. Used by the in-app demo, by tests,
 * and to make synthetic data for checking the training pipeline end to end.
 *
 * Supports exercises whose primary angle is at the knee (side view) or the
 * shoulder (front view). Other joints need a new body generator here.
 */
export type SimRep = 'good' | 'shallow' | 'fast' | 'slow' | 'dropped' | 'posture' | 'uneven' | 'jerky';

export interface SimOptions {
  seed?: number;
  fps?: number;
  /** Seconds of rest before the first rep and between reps. */
  restSec?: number;
  /** Angle noise, degrees. */
  noiseDeg?: number;
}

interface RepPlan {
  kind: SimRep;
  start: number;
  duration: number;
  amp: number;
  speed: number;
  returnSpeed: number;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulatorSupports(ex: ExerciseDefinition): boolean {
  const a = ex.primary.angle;
  return a.kind === 'joint' && (a.b === 'knee' || a.b === 'shoulder');
}

export class ExerciseSimulator {
  readonly fps: number;
  readonly totalSec: number;
  private readonly reps: RepPlan[] = [];
  private readonly rand: () => number;
  private readonly noise: number;

  constructor(
    private readonly ex: ExerciseDefinition,
    script: SimRep[],
    opts: SimOptions = {},
  ) {
    if (!simulatorSupports(ex)) throw new Error(`Demo mode does not support ${ex.id} yet`);
    this.fps = opts.fps ?? 30;
    this.rand = rng(opts.seed ?? 7);
    this.noise = opts.noiseDeg ?? 0.6;
    const rest = opts.restSec ?? 1.2;
    let t = rest + 0.5;
    for (const kind of script) {
      const speed = kind === 'fast' ? 2.2 : kind === 'slow' ? 0.45 : 0.9 + this.rand() * 0.2;
      const returnSpeed = kind === 'dropped' ? 3.2 : speed;
      const amp = kind === 'shallow' ? 0.55 + this.rand() * 0.1 : 0.95 + this.rand() * 0.08;
      const { toTargetSec, holdSec, returnSec } = ex.tempo;
      const duration = (toTargetSec + holdSec) / speed + returnSec / returnSpeed;
      this.reps.push({ kind, start: t, duration, amp, speed, returnSpeed });
      t += duration + rest + this.rand() * 0.4;
    }
    this.totalSec = t;
  }

  /** Progress 0..1 and active rep at time t (seconds). */
  private state(t: number): { p: number; rep?: RepPlan } {
    const rep = this.reps.find((r) => t >= r.start && t < r.start + r.duration);
    if (!rep) return { p: 0 };
    const local = t - rep.start;
    const { toTargetSec, holdSec } = this.ex.tempo;
    const upEnd = (toTargetSec + holdSec) / rep.speed;
    const guideT = local < upEnd ? local * rep.speed : toTargetSec + holdSec + (local - upEnd) * rep.returnSpeed;
    let p = targetProgressAt(this.ex, guideT) * rep.amp;
    if (rep.kind === 'jerky') p += 0.09 * Math.sin(local * 2 * Math.PI * 2.2) * Math.min(1, p * 4);
    return { p, rep };
  }

  private gauss(): number {
    return (this.rand() + this.rand() + this.rand() - 1.5) * 1.4;
  }

  frameAt(t: number): PoseFrame {
    const { p, rep } = this.state(t);
    const dir = direction(this.ex);
    const angle = this.ex.rep.startDeg + dir * plannedRange(this.ex) * p + this.gauss() * this.noise;
    const joint = this.ex.primary.angle.kind === 'joint' ? this.ex.primary.angle.b : 'knee';
    const world = joint === 'knee' ? sideBody(angle, rep?.kind === 'posture') : frontBody(angle, rep?.kind, p, plannedRange(this.ex), dir);
    return toFrame(world, t * 1000);
  }

  /** All frames from start to end at the simulator's fps. */
  frames(): PoseFrame[] {
    const out: PoseFrame[] = [];
    const dt = 1 / this.fps;
    for (let t = 0; t <= this.totalSec; t += dt) out.push(this.frameAt(t));
    return out;
  }

  get script(): SimRep[] {
    return this.reps.map((r) => r.kind);
  }

  /** Planned length of one good rep, for reference. */
  get repSec(): number {
    return plannedDuration(this.ex);
  }
}

type P3 = [number, number, number];

function blank(): P3[] {
  return Array.from({ length: LANDMARK_COUNT }, () => [0, 0, 0] as P3);
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Side view, facing +x. Coordinates in metres, y up, ankle at origin. */
function sideBody(kneeDeg: number, badPosture: boolean): P3[] {
  const pts = blank();
  const s = (180 - kneeDeg) * 0.25; // shank leans forward as the knee bends
  const bend = Math.max(0, (180 - kneeDeg) / 90);
  const lean = 6 + 28 * bend + (badPosture ? 40 * Math.min(1, bend + 0.4) : 0);
  for (const [side, z] of [
    ['left', 0.1],
    ['right', -0.1],
  ] as const) {
    const A: P3 = [0, 0, z];
    const thS = rad(90 - s);
    const K: P3 = [A[0] + 0.45 * Math.cos(thS), A[1] + 0.45 * Math.sin(thS), z];
    const thT = rad(270 - s - kneeDeg);
    const H: P3 = [K[0] + 0.45 * Math.cos(thT), K[1] + 0.45 * Math.sin(thT), z];
    const thB = rad(90 - lean);
    const S: P3 = [H[0] + 0.55 * Math.cos(thB), H[1] + 0.55 * Math.sin(thB), z];
    const E: P3 = [S[0] + 0.28 * Math.cos(rad(-70)), S[1] + 0.28 * Math.sin(rad(-70)), z];
    const W: P3 = [E[0] + 0.25 * Math.cos(rad(10)), E[1] + 0.25 * Math.sin(rad(10)), z];
    const L = side === 'left';
    pts[L ? LM.leftAnkle : LM.rightAnkle] = A;
    pts[L ? LM.leftKnee : LM.rightKnee] = K;
    pts[L ? LM.leftHip : LM.rightHip] = H;
    pts[L ? LM.leftShoulder : LM.rightShoulder] = S;
    pts[L ? LM.leftElbow : LM.rightElbow] = E;
    pts[L ? LM.leftWrist : LM.rightWrist] = W;
    pts[L ? LM.leftHeel : LM.rightHeel] = [-0.05, -0.04, z];
    pts[L ? LM.leftFoot : LM.rightFoot] = [0.16, -0.04, z];
    if (L) pts[LM.nose] = [S[0] + 0.25 * Math.cos(thB) + 0.08, S[1] + 0.25 * Math.sin(thB), 0];
  }
  return pts;
}

/** Front view, facing the camera. Arms raise out to the side by abductionDeg. */
function frontBody(abductionDeg: number, kind: SimRep | undefined, p: number, range: number, dir: number): P3[] {
  const pts = blank();
  const tilt = kind === 'posture' ? 22 * p : 0;
  const ct = Math.cos(rad(tilt));
  const st = Math.sin(rad(tilt));
  const hipC: P3 = [0, 0.9, 0];
  for (const sgn of [-1, 1]) {
    const L = sgn < 0; // left side of the body appears on the image right, but sign is only cosmetic
    let ab = abductionDeg;
    if (kind === 'uneven' && !L) ab -= dir * range * p * 0.35;
    const A: P3 = [sgn * 0.12, 0, 0];
    const K: P3 = [sgn * 0.12, 0.45, 0];
    const H: P3 = [sgn * 0.15, 0.9, 0];
    // shoulder = hip + trunk vector rotated by tilt
    const sx = sgn * 0.2;
    const sy = 0.55;
    const S: P3 = [hipC[0] + sx * ct + sy * st, hipC[1] - sx * st + sy * ct, 0];
    const trunk = [S[0] - (hipC[0] + sgn * 0.15), S[1] - hipC[1]];
    const tn = Math.hypot(trunk[0], trunk[1]);
    const down = [-trunk[0] / tn, -trunk[1] / tn];
    // rotate "down" outward by ab
    const a = rad(ab) * sgn;
    const dx = down[0] * Math.cos(a) - down[1] * Math.sin(a);
    const dy = down[0] * Math.sin(a) + down[1] * Math.cos(a);
    const E: P3 = [S[0] + 0.28 * dx, S[1] + 0.28 * dy, 0];
    const W: P3 = [E[0] + 0.25 * dx, E[1] + 0.25 * dy, 0];
    pts[L ? LM.leftAnkle : LM.rightAnkle] = A;
    pts[L ? LM.leftKnee : LM.rightKnee] = K;
    pts[L ? LM.leftHip : LM.rightHip] = H;
    pts[L ? LM.leftShoulder : LM.rightShoulder] = S;
    pts[L ? LM.leftElbow : LM.rightElbow] = E;
    pts[L ? LM.leftWrist : LM.rightWrist] = W;
    pts[L ? LM.leftHeel : LM.rightHeel] = [sgn * 0.12, -0.04, -0.05];
    pts[L ? LM.leftFoot : LM.rightFoot] = [sgn * 0.14, -0.04, 0.12];
  }
  pts[LM.nose] = [0.55 * st, 0.9 + 0.55 * ct + 0.22, 0];
  return pts;
}

/** y-up metres -> MediaPipe-style frame (y down). Image coords fit a 1.9 m tall box. */
function toFrame(world: P3[], timestamp: number): PoseFrame {
  const worldLm: Landmark[] = world.map(([x, y, z]) => ({ x, y: -y, z, visibility: 0.95 }));
  const landmarks: Landmark[] = world.map(([x, y, z]) => ({
    x: 0.5 + (x - 0.1) / 2.2,
    y: 0.93 - y / 2.1,
    z,
    visibility: 0.95,
  }));
  return { timestamp, landmarks, world: worldLm };
}
