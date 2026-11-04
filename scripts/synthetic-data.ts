/**
 * Makes a synthetic training CSV from the demo simulator, with known labels.
 * ONLY for checking that the training + drop-in pipeline works end to end.
 * Never ship a model trained on this: it learns the simulator, not people.
 *
 *   npm run synthetic -- training/data/synthetic.csv
 */
import { writeFileSync } from 'node:fs';
import { toCsv, type RecordedSet } from '../src/core/export';
import { RuleScorer } from '../src/core/scoring/ruleScorer';
import { SetSession } from '../src/core/session';
import { ExerciseSimulator, simulatorSupports, type SimRep } from '../src/core/sim/simulator';
import type { MistakeId } from '../src/core/types';
import { EXERCISES } from '../src/exercises';

const out = process.argv[2] ?? 'training/data/synthetic.csv';
const KIND_TO_MISTAKE: Record<SimRep, MistakeId> = {
  good: 'good', shallow: 'too_shallow', fast: 'too_fast', slow: 'too_slow', dropped: 'dropped',
  posture: 'posture', uneven: 'uneven', jerky: 'jerky',
};
const KIND_SCORE: Record<SimRep, number> = {
  good: 95, shallow: 55, fast: 65, slow: 75, dropped: 60, posture: 62, uneven: 66, jerky: 64,
};

let seed = 1;
const sets: RecordedSet[] = [];
for (const ex of EXERCISES.filter(simulatorSupports)) {
  const kinds: SimRep[] = ['good', 'good', 'shallow', 'fast', 'dropped', 'posture', 'jerky'];
  if (ex.primary.sides === 'both') kinds.push('uneven');
  for (let s = 0; s < 40; s++) {
    const script: SimRep[] = Array.from({ length: 6 }, (_, i) => kinds[(s * 7 + i * 3 + s) % kinds.length]);
    const sim = new ExerciseSimulator(ex, script, { seed: seed++, noiseDeg: 0.4 + (s % 5) * 0.3 });
    const session = new SetSession(ex, { targetReps: 99, scorer: new RuleScorer() });
    for (const f of sim.frames()) session.push(f);
    const result = await session.finish();
    if (result.reps.length !== script.length) continue; // keep only sets where every rep was found
    sets.push({
      setId: `${ex.id}-syn-${s}`,
      source: 'synthetic',
      result,
      labels: script.map((k) => ({ score: KIND_SCORE[k] + ((seed * 13) % 7) - 3, mistake: KIND_TO_MISTAKE[k] })),
    });
  }
}
writeFileSync(out, toCsv(sets));
console.log(`Wrote ${sets.reduce((a, s) => a + s.result.reps.length, 0)} reps from ${sets.length} sets to ${out}`);
