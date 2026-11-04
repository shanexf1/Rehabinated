import type { AngleSpec, MistakeId } from './types';

/**
 * An exercise is pure data. To add one, write a new file in src/exercises/
 * that calls defineExercise({...}) and add it to src/exercises/index.ts.
 * No other code needs to change. See docs/ADDING_AN_EXERCISE.md.
 */
export interface ExerciseDefinition {
  /** Stable id, kebab-case. Used in saved progress and as a model input. */
  id: string;
  /** Bump when the target path or rep rule changes, so old data can be told apart. */
  version: number;
  name: string;
  /** One line shown on the home screen. */
  summary: string;
  bodyArea: string;
  camera: {
    /** Which way the person faces the phone. */
    view: 'side' | 'front';
    /** Plain-language setup tip shown before the camera starts. */
    tip: string;
  };
  /** Step-by-step instructions, short sentences. */
  instructions: string[];
  /** When to stop and contact a clinician. */
  safety: string[];

  /** The joint angle that defines one rep and is drawn on the trajectory chart. */
  primary: {
    label: string;
    angle: AngleSpec;
    /** auto = the side the camera sees best; both = measure both and check symmetry. */
    sides: 'auto' | 'both';
  };

  /** Target path for one rep: start angle -> target angle -> back to start. */
  rep: {
    startDeg: number;
    targetDeg: number;
    /** A movement must reach this fraction of the planned range to count as a rep. */
    minRangeFraction: number;
    minDurationSec: number;
    maxDurationSec: number;
  };
  tempo: {
    toTargetSec: number;
    holdSec: number;
    returnSec: number;
  };

  /** Extra angles that must stay under a limit (e.g. trunk lean). */
  posture?: Array<{ label: string; angle: AngleSpec; maxDeg: number }>;

  /** How much each part counts toward the rule-based score. Missing keys use defaults. */
  weights?: Partial<ScoreWeights>;

  /** Coaching line per mistake. Missing keys fall back to generic cues. */
  cues?: Partial<Record<MistakeId, string>>;

  /** Default prescription. */
  plan: { sets: number; reps: number; restSec: number };
}

export interface ScoreWeights {
  range: number;
  path: number;
  tempo: number;
  control: number;
  symmetry: number;
  posture: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  range: 0.3,
  path: 0.2,
  tempo: 0.15,
  control: 0.15,
  symmetry: 0.1,
  posture: 0.1,
};

export const GENERIC_CUES: Record<MistakeId, string> = {
  good: 'Nice work. Keep that same smooth movement.',
  too_shallow: 'Try to move a little further each rep, as far as is comfortable.',
  too_fast: 'Slow down. Follow the guide line on the chart.',
  too_slow: 'You can move a bit more briskly. Follow the guide line.',
  dropped: 'Come back down slowly and with control.',
  jerky: 'Aim for one smooth movement without stops or wobbles.',
  off_path: 'Follow the guide line: move steadily, pause at the top, then return.',
  uneven: 'Try to move both sides the same amount.',
  posture: 'Keep your back tall while you move.',
};

/** Validates an exercise file at startup so mistakes show up immediately. */
export function defineExercise(def: ExerciseDefinition): ExerciseDefinition {
  const errors: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(def.id)) errors.push('id must be kebab-case');
  if (def.rep.startDeg === def.rep.targetDeg) errors.push('rep.startDeg and rep.targetDeg must differ');
  if (def.rep.minRangeFraction <= 0 || def.rep.minRangeFraction >= 1) errors.push('rep.minRangeFraction must be between 0 and 1');
  if (def.rep.minDurationSec >= def.rep.maxDurationSec) errors.push('rep.minDurationSec must be below maxDurationSec');
  if (def.tempo.toTargetSec <= 0 || def.tempo.returnSec <= 0) errors.push('tempo times must be positive');
  if (def.plan.reps < 1 || def.plan.sets < 1) errors.push('plan needs at least 1 set and 1 rep');
  if (errors.length) throw new Error(`Exercise "${def.id}": ${errors.join('; ')}`);
  return def;
}

export function plannedRange(ex: ExerciseDefinition): number {
  return Math.abs(ex.rep.targetDeg - ex.rep.startDeg);
}

/** +1 if the angle grows toward the target, -1 if it shrinks. */
export function direction(ex: ExerciseDefinition): 1 | -1 {
  return ex.rep.targetDeg > ex.rep.startDeg ? 1 : -1;
}

export function plannedDuration(ex: ExerciseDefinition): number {
  return ex.tempo.toTargetSec + ex.tempo.holdSec + ex.tempo.returnSec;
}

export function weightsFor(ex: ExerciseDefinition): ScoreWeights {
  const w = { ...DEFAULT_WEIGHTS, ...ex.weights };
  if (ex.primary.sides !== 'both') w.symmetry = 0;
  if (!ex.posture?.length) w.posture = 0;
  return w;
}

export function cueFor(ex: ExerciseDefinition, mistake: MistakeId): string {
  return ex.cues?.[mistake] ?? GENERIC_CUES[mistake];
}
