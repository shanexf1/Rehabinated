import { describe, expect, it } from 'vitest';
import { angleAt, tiltFromVertical } from '../src/core/geometry';
import { RuleScorer } from '../src/core/scoring/ruleScorer';
import { SetSession, type SetResult } from '../src/core/session';
import { ExerciseSimulator, type SimRep } from '../src/core/sim/simulator';
import { dtwMeanAbs, targetCurve } from '../src/core/trajectory';
import { EXERCISES, getExercise } from '../src/exercises';

const pt = (x: number, y: number) => ({ x, y, z: 0, visibility: 1 });

async function runSet(id: string, script: SimRep[], seed = 3, noiseDeg = 0.6): Promise<SetResult> {
  const ex = getExercise(id)!;
  const sim = new ExerciseSimulator(ex, script, { seed, noiseDeg });
  const session = new SetSession(ex, { targetReps: 99, scorer: new RuleScorer() });
  for (const f of sim.frames()) session.push(f);
  return session.finish();
}

describe('geometry', () => {
  it('measures a right angle', () => {
    expect(angleAt(pt(0, 0), pt(1, 0), pt(1, 1))).toBeCloseTo(90);
  });
  it('measures a straight line as 180', () => {
    expect(angleAt(pt(0, 0), pt(1, 0), pt(2, 0))).toBeCloseTo(180);
  });
  it('measures tilt from vertical (image y down)', () => {
    expect(tiltFromVertical(pt(0, 1), pt(0, 0))).toBeCloseTo(0);
    expect(tiltFromVertical(pt(0, 1), pt(1, 1))).toBeCloseTo(90);
  });
});

describe('trajectory', () => {
  it('identical curves have zero DTW distance', () => {
    const c = targetCurve(EXERCISES[0], 50);
    expect(dtwMeanAbs(c, c)).toBeCloseTo(0);
  });
});

describe.each(EXERCISES.map((e) => e.id))('%s', (id) => {
  it('counts every good rep exactly once', async () => {
    const r = await runSet(id, ['good', 'good', 'good', 'good', 'good']);
    expect(r.reps.length).toBe(5);
  });

  it.each([1, 2, 3, 4, 5])('scores good reps highly and calls them good (seed %i)', async (seed) => {
    const r = await runSet(id, ['good', 'good', 'good', 'good'], seed);
    expect(r.reps.length).toBe(4);
    for (const rep of r.reps) {
      expect(rep.score!.score).toBeGreaterThanOrEqual(80);
      expect(rep.score!.mistake).toBe('good');
    }
  });

  it('copes with noisier tracking', async () => {
    const r = await runSet(id, ['good', 'good', 'good', 'good'], 9, 1.5);
    expect(r.reps.length).toBe(4);
    for (const rep of r.reps) expect(rep.score!.score).toBeGreaterThanOrEqual(70);
  });

  it('flags shallow reps', async () => {
    const r = await runSet(id, ['shallow', 'shallow', 'shallow']);
    expect(r.reps.length).toBe(3);
    for (const rep of r.reps) expect(rep.score!.mistake).toBe('too_shallow');
    expect(r.mainMistake).toBe('too_shallow');
  });

  it('flags fast reps', async () => {
    const r = await runSet(id, ['fast', 'fast', 'fast']);
    expect(r.reps.length).toBe(3);
    for (const rep of r.reps) expect(rep.score!.mistake).toBe('too_fast');
  });

  it('flags dropping on the way back', async () => {
    const r = await runSet(id, ['dropped', 'dropped', 'dropped']);
    for (const rep of r.reps) expect(rep.score!.mistake).toBe('dropped');
  });

  it('flags poor posture', async () => {
    const r = await runSet(id, ['posture', 'posture', 'posture']);
    for (const rep of r.reps) expect(rep.score!.mistake).toBe('posture');
  });
});

describe('shoulder-abduction symmetry', () => {
  it('flags uneven arms', async () => {
    const r = await runSet('shoulder-abduction', ['uneven', 'uneven', 'uneven']);
    for (const rep of r.reps) expect(rep.score!.mistake).toBe('uneven');
  });
});

describe('set summary', () => {
  it('stops counting at the target and gives tips', async () => {
    const ex = getExercise('mini-squat')!;
    const sim = new ExerciseSimulator(ex, ['good', 'good', 'good', 'good'], { seed: 1 });
    const session = new SetSession(ex, { targetReps: 2, scorer: new RuleScorer() });
    for (const f of sim.frames()) session.push(f);
    const r = await session.finish();
    expect(r.reps.length).toBe(2);
    expect(r.tips.length).toBeGreaterThan(0);
    expect(r.setScore).toBeGreaterThan(70);
  });

  it('reports no reps when nothing happens', async () => {
    const r = await runSet('sit-to-stand', []);
    expect(r.reps.length).toBe(0);
    expect(r.tips[0]).toMatch(/No reps/);
  });
});

describe.each(EXERCISES.map((e) => e.id))('%s wobble', (id) => {
  it('flags jerky reps', async () => {
    const r = await runSet(id, ['jerky', 'jerky', 'jerky']);
    expect(r.reps.length).toBe(3);
    for (const rep of r.reps) expect(rep.score!.mistake).toBe('jerky');
  });
});
