import type { ExerciseDefinition } from '../exercise';
import type { RepFeatures } from '../features';
import type { MistakeId } from '../types';

export interface RepScoreInput {
  exercise: ExerciseDefinition;
  features: RepFeatures;
}

export interface RepScore {
  /** 0..100 */
  score: number;
  /** Main thing to fix on this rep, or 'good'. */
  mistake: MistakeId;
  /** Which scorer produced this, e.g. 'rules@1' or 'model:my-gbm@2'. */
  source: string;
  /** Optional per-part scores (rules) or class probabilities (model), for display and debugging. */
  breakdown?: Record<string, number>;
}

/**
 * Anything that turns rep features into a score. The rule-based scorer and
 * the trained-model scorer both implement this, so the rest of the app does
 * not care which one is active.
 */
export interface RepScorer {
  readonly id: string;
  /** Return false to let the next scorer handle this exercise. */
  supports(exercise: ExerciseDefinition): boolean;
  scoreRep(input: RepScoreInput): RepScore | Promise<RepScore>;
}
