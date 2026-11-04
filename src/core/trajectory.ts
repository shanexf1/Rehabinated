import { plannedDuration, type ExerciseDefinition } from './exercise';

/** Smooth 0..1 ease (cosine), so the guide path has no sharp corners. */
function ease(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return 0.5 - 0.5 * Math.cos(Math.PI * c);
}

/**
 * Target progress (0 = start angle, 1 = target angle) at time t seconds into a rep.
 * This is the "target path" the user follows.
 */
export function targetProgressAt(ex: ExerciseDefinition, t: number): number {
  const { toTargetSec, holdSec, returnSec } = ex.tempo;
  if (t <= 0) return 0;
  if (t < toTargetSec) return ease(t / toTargetSec);
  if (t < toTargetSec + holdSec) return 1;
  if (t < toTargetSec + holdSec + returnSec) return 1 - ease((t - toTargetSec - holdSec) / returnSec);
  return 0;
}

/** Target angle in degrees at time t into a rep. */
export function targetAngleAt(ex: ExerciseDefinition, t: number): number {
  const p = targetProgressAt(ex, t);
  return ex.rep.startDeg + p * (ex.rep.targetDeg - ex.rep.startDeg);
}

/** The full target path sampled at n points over normalized time 0..1, in progress units. */
export function targetCurve(ex: ExerciseDefinition, n: number): number[] {
  const total = plannedDuration(ex);
  return Array.from({ length: n }, (_, i) => targetProgressAt(ex, (i / (n - 1)) * total));
}

/** Linear resample of (t, v) samples to n points over their own time span. */
export function resample(ts: number[], vs: number[], n: number): number[] {
  if (ts.length === 0) return new Array(n).fill(0);
  if (ts.length === 1) return new Array(n).fill(vs[0]);
  const t0 = ts[0];
  const t1 = ts[ts.length - 1];
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / (n - 1);
    while (j < ts.length - 2 && ts[j + 1] < t) j++;
    const span = ts[j + 1] - ts[j] || 1;
    const f = Math.min(1, Math.max(0, (t - ts[j]) / span));
    out.push(vs[j] + f * (vs[j + 1] - vs[j]));
  }
  return out;
}

/**
 * Dynamic time warping distance (mean absolute difference along the best
 * alignment), with a Sakoe-Chiba band so the match cannot warp too far.
 */
export function dtwMeanAbs(a: number[], b: number[], bandFraction = 0.15): number {
  const n = a.length;
  const m = b.length;
  const band = Math.max(1, Math.ceil(Math.max(n, m) * bandFraction));
  const INF = Number.POSITIVE_INFINITY;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const steps: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  cost[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    const center = Math.round((i * m) / n);
    for (let j = Math.max(1, center - band); j <= Math.min(m, center + band); j++) {
      const d = Math.abs(a[i - 1] - b[j - 1]);
      let best = cost[i - 1][j - 1];
      let bs = steps[i - 1][j - 1];
      if (cost[i - 1][j] < best) {
        best = cost[i - 1][j];
        bs = steps[i - 1][j];
      }
      if (cost[i][j - 1] < best) {
        best = cost[i][j - 1];
        bs = steps[i][j - 1];
      }
      cost[i][j] = best + d;
      steps[i][j] = bs + 1;
    }
  }
  const total = cost[n][m];
  return Number.isFinite(total) ? total / Math.max(1, steps[n][m]) : NaN;
}
