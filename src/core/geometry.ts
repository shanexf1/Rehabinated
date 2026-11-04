import { jointIndex } from './landmarks';
import type { AngleSpec, Landmark, PoseFrame, Side } from './types';

const RAD = 180 / Math.PI;

/** Interior angle at b (degrees, 0..180). Uses z only when both points carry it meaningfully. */
export function angleAt(a: Landmark, b: Landmark, c: Landmark): number {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const n1 = Math.hypot(v1[0], v1[1], v1[2]);
  const n2 = Math.hypot(v2[0], v2[1], v2[2]);
  if (n1 === 0 || n2 === 0) return NaN;
  const cos = Math.min(1, Math.max(-1, dot / (n1 * n2)));
  return Math.acos(cos) * RAD;
}

/** Angle of segment from->to away from vertical "up" (degrees, 0..180). Image y points down. */
export function tiltFromVertical(from: Landmark, to: Landmark): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const n = Math.hypot(dx, dy, dz);
  if (n === 0) return NaN;
  // "up" is (0,-1,0) in image/world coordinates used by MediaPipe.
  const cos = Math.min(1, Math.max(-1, -dy / n));
  return Math.acos(cos) * RAD;
}

export interface AngleReading {
  value: number;
  /** Lowest visibility of the landmarks used. */
  confidence: number;
}

/** Measure an AngleSpec on one side of the body. Prefers world landmarks when present. */
export function measure(frame: PoseFrame, spec: AngleSpec, side: Side): AngleReading {
  const pts = frame.world ?? frame.landmarks;
  const vis = frame.landmarks;
  if (spec.kind === 'joint') {
    const ia = jointIndex(spec.a, side);
    const ib = jointIndex(spec.b, side);
    const ic = jointIndex(spec.c, side);
    return {
      value: angleAt(pts[ia], pts[ib], pts[ic]),
      confidence: Math.min(vis[ia].visibility, vis[ib].visibility, vis[ic].visibility),
    };
  }
  const i1 = jointIndex(spec.from, side);
  const i2 = jointIndex(spec.to, side);
  return {
    value: tiltFromVertical(pts[i1], pts[i2]),
    confidence: Math.min(vis[i1].visibility, vis[i2].visibility),
  };
}

/** Pick the side the camera sees best for this angle. */
export function bestSide(frame: PoseFrame, spec: AngleSpec): Side {
  const l = measure(frame, spec, 'left').confidence;
  const r = measure(frame, spec, 'right').confidence;
  return r > l ? 'right' : 'left';
}
