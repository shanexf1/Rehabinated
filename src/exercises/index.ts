import type { ExerciseDefinition } from '../core/exercise';
import miniSquat from './mini-squat';
import shoulderAbduction from './shoulder-abduction';
import sitToStand from './sit-to-stand';

/**
 * All exercises the app knows about. To add one: create a file next to these
 * and add it to this list. See docs/ADDING_AN_EXERCISE.md.
 */
export const EXERCISES: ExerciseDefinition[] = [sitToStand, miniSquat, shoulderAbduction];

const ids = new Set<string>();
for (const ex of EXERCISES) {
  if (ids.has(ex.id)) throw new Error(`Duplicate exercise id "${ex.id}"`);
  ids.add(ex.id);
}

export function getExercise(id: string): ExerciseDefinition | undefined {
  return EXERCISES.find((e) => e.id === id);
}
