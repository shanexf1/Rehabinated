/**
 * Shared types for the portable core. Nothing in src/core may use browser or
 * React APIs, so the same code can run in the web app, a React Native app,
 * tests, or a Node script that prepares training data.
 */

/** One body point from a pose model. x/y are normalized image coords (0..1, y down). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** 0..1, how sure the pose model is that this point is visible. */
  visibility: number;
}

/** One camera frame worth of pose data, in the MediaPipe 33-point layout. */
export interface PoseFrame {
  /** Milliseconds, monotonic. */
  timestamp: number;
  /** 33 image-space landmarks (for drawing the skeleton). */
  landmarks: Landmark[];
  /** Optional 33 world-space landmarks in metres (better for angles). */
  world?: Landmark[];
}

export type Side = 'left' | 'right';

/** Body joints the exercise files can refer to. Side is resolved at runtime. */
export type Joint = 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle' | 'heel' | 'foot';

/**
 * How to measure an angle, in degrees.
 * - joint: interior angle at `b` between segments b->a and b->c (0..180).
 * - tilt: angle of the segment from->to away from straight up (0 = upright).
 */
export type AngleSpec =
  | { kind: 'joint'; a: Joint; b: Joint; c: Joint }
  | { kind: 'tilt'; from: Joint; to: Joint };

/** Mistake classes. The trained mistake model must output these same ids. */
export const MISTAKES = [
  'good',
  'too_shallow',
  'too_fast',
  'too_slow',
  'dropped',
  'jerky',
  'off_path',
  'uneven',
  'posture',
] as const;
export type MistakeId = (typeof MISTAKES)[number];
