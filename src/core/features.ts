import { direction, plannedDuration, plannedRange, type ExerciseDefinition } from './exercise';
import type { Sample } from './repDetector';
import { dtwMeanAbs, resample, targetCurve } from './trajectory';

/**
 * Per-rep features. These are the inputs to both the rule-based scorer and
 * any trained model. The ORDER of FEATURE_NAMES is the column order of the
 * exported training CSV, so only ever append new names at the end.
 */
export const FEATURE_NAMES = [
  'range_frac',
  'peak_shortfall_deg',
  'path_error',
  'duration_s',
  'duration_ratio',
  'to_target_ratio',
  'hold_s',
  'return_ratio',
  'jerk_index',
  'side_diff_deg',
  'posture_excess_deg',
  'confidence',
  'range_vs_first',
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];
export type RepFeatures = Record<FeatureName, number>;

/** Number of points used for the normalized rep curve. */
export const CURVE_POINTS = 50;

export interface FeatureContext {
  /** Range (degrees) of the first rep in this set, for fatigue drift. */
  firstRangeDeg?: number;
}

export interface RepShape {
  /** Rep curve in progress units over normalized time, CURVE_POINTS long. */
  curve: number[];
  rangeDeg: number;
}

export function repShape(ex: ExerciseDefinition, samples: Sample[], baseline: number): RepShape {
  const dir = direction(ex);
  const range = plannedRange(ex);
  const ts = samples.map((s) => s.t);
  const prog = samples.map((s) => (dir * (s.angle - baseline)) / range);
  const curve = resample(ts, prog, CURVE_POINTS);
  const peakP = Math.max(...prog);
  return { curve, rangeDeg: peakP * range };
}

export function computeFeatures(
  ex: ExerciseDefinition,
  samples: Sample[],
  baseline: number,
  ctx: FeatureContext = {},
): RepFeatures {
  const dir = direction(ex);
  const range = plannedRange(ex);
  const ts = samples.map((s) => s.t);
  const prog = samples.map((s) => (dir * (s.angle - baseline)) / range);
  const t0 = ts[0];
  const tEnd = ts[ts.length - 1];
  const duration = tEnd - t0;

  const peakP = Math.max(...prog);
  const rangeDeg = peakP * range;
  const peakAngle = baseline + dir * rangeDeg;
  const peakShortfall = dir * (ex.rep.targetDeg - peakAngle);

  // Phase timing: up until 90% of this rep's own peak, hold, then return.
  const thr = 0.9 * peakP;
  const iUp = prog.findIndex((p) => p >= thr);
  let iRet = iUp;
  for (let i = prog.length - 1; i >= 0; i--) {
    if (prog[i] >= thr) {
      iRet = i;
      break;
    }
  }
  const toTarget = ts[iUp] - t0;
  const hold = ts[iRet] - ts[iUp];
  const ret = tEnd - ts[iRet];
  // The eased guide reaches 90% at about 80% of each phase's time.
  const toTargetRatio = toTarget / (0.8 * ex.tempo.toTargetSec);
  const returnRatio = ret / (0.8 * ex.tempo.returnSec);

  // Shape vs the target path, both in progress units over normalized time.
  const curve = resample(ts, prog, CURVE_POINTS);
  const target = targetCurve(ex, CURVE_POINTS);
  const pathError = dtwMeanAbs(curve, target);

  // Smoothness: total variation of velocity over 4 x peak speed. One smooth
  // up-and-down movement is about 1; wobbles and stops push it higher.
  // Resample at 20 Hz in real time and lightly average, so camera jitter is
  // not mistaken for wobble but a real 2 Hz shake still shows.
  const n20 = Math.max(8, Math.round(duration / 0.05));
  const rt = resample(ts, prog, n20);
  const sm = rt.map((_, i) => {
    const w = rt.slice(Math.max(0, i - 1), i + 2);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  const vel = sm.slice(1).map((v, i) => v - sm[i]);
  const vmax = Math.max(...vel.map(Math.abs)) || 1;
  let tv = 0;
  for (let i = 1; i < vel.length; i++) tv += Math.abs(vel[i] - vel[i - 1]);
  tv += Math.abs(vel[0]) + Math.abs(vel[vel.length - 1]);
  const jerk = tv / (4 * vmax);

  // Symmetry: compare range on each side when both are tracked.
  let sideDiff = 0;
  const lefts = samples.map((s) => s.left).filter((v): v is number => v !== undefined);
  const rights = samples.map((s) => s.right).filter((v): v is number => v !== undefined);
  if (lefts.length && rights.length) {
    const lr = dir > 0 ? Math.max(...lefts) - lefts[0] : lefts[0] - Math.min(...lefts);
    const rr = dir > 0 ? Math.max(...rights) - rights[0] : rights[0] - Math.min(...rights);
    sideDiff = Math.abs(lr - rr);
  }

  // Posture: worst amount any posture angle went over its limit.
  let postureExcess = 0;
  (ex.posture ?? []).forEach((p, k) => {
    const worst = Math.max(...samples.map((s) => s.posture[k] ?? 0));
    postureExcess = Math.max(postureExcess, worst - p.maxDeg);
  });

  const confidence = samples.reduce((a, s) => a + s.confidence, 0) / samples.length;

  return {
    range_frac: peakP,
    peak_shortfall_deg: peakShortfall,
    path_error: pathError,
    duration_s: duration,
    duration_ratio: duration / plannedDuration(ex),
    to_target_ratio: toTargetRatio,
    hold_s: hold,
    return_ratio: returnRatio,
    jerk_index: jerk,
    side_diff_deg: sideDiff,
    posture_excess_deg: Math.max(0, postureExcess),
    confidence,
    range_vs_first: ctx.firstRangeDeg ? rangeDeg / ctx.firstRangeDeg : 1,
  };
}
