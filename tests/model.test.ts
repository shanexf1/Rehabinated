import { describe, expect, it } from 'vitest';
import { FEATURE_NAMES } from '../src/core/features';
import { buildInputVector, mapMistakeOutput, mapScoreOutput, validateManifest, type ModelManifest } from '../src/core/scoring/modelManifest';
import { ModelScorer, ScorerChain } from '../src/core/scoring/modelScorer';
import { RuleScorer } from '../src/core/scoring/ruleScorer';
import { getExercise } from '../src/exercises';
import type { InferenceRuntime, LoadedModel } from '../src/platform/inference';

const manifest: ModelManifest = {
  format: 'rehabinated-model@1',
  name: 'test',
  version: '1',
  exercises: ['mini-squat'],
  inputs: ['range_frac', 'duration_ratio', 'exercise:mini-squat', 'exercise:sit-to-stand'],
  score: { file: 'score.onnx', output: 'variable' },
  mistake: { file: 'mistake.onnx', probabilitiesOutput: 'probabilities', classes: ['good', 'too_shallow', 'too_fast'] },
};

const features = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as Record<(typeof FEATURE_NAMES)[number], number>;
features.range_frac = 0.6;
features.duration_ratio = 1;

/** A fake runtime standing in for onnxruntime, so tests need no model files. */
const fakeRuntime: InferenceRuntime = {
  async load(file): Promise<LoadedModel> {
    return {
      outputNames: file === 'score.onnx' ? ['variable'] : ['label', 'probabilities'],
      async run(x): Promise<Record<string, ArrayLike<number>>> {
        if (file === 'score.onnx') return { variable: [x[0] * 100] };
        return { label: [1], probabilities: [0.1, 0.8, 0.1] };
      },
    };
  },
};

describe('model manifest', () => {
  it('accepts a valid manifest', () => {
    expect(validateManifest(manifest).errors).toEqual([]);
  });

  it('rejects unknown inputs and classes', () => {
    const bad = { ...manifest, inputs: ['nope'], mistake: { ...manifest.mistake!, classes: ['good', 'wrong'] } };
    const { errors } = validateManifest(bad);
    expect(errors.join(' ')).toMatch(/unknown input "nope"/);
    expect(errors.join(' ')).toMatch(/unknown mistake class "wrong"/);
  });

  it('builds inputs in manifest order with exercise one-hot', () => {
    const v = buildInputVector(manifest, getExercise('mini-squat')!, features);
    expect(Array.from(v)).toEqual([expect.closeTo(0.6), 1, 1, 0]);
  });

  it('maps outputs', () => {
    expect(mapScoreOutput({ ...manifest, score: { file: 'x', outputRange: [0, 1] } }, 0.75)).toBe(75);
    expect(mapMistakeOutput(manifest, { probabilities: [0.2, 0.1, 0.7] }).mistake).toBe('too_fast');
    expect(mapMistakeOutput(manifest, { label: 1 }).mistake).toBe('too_shallow');
  });
});

describe('ModelScorer', () => {
  it('uses the model for supported exercises and rules for others', async () => {
    const model = await ModelScorer.create(manifest, fakeRuntime, new RuleScorer());
    const chain = new ScorerChain([model, new RuleScorer()]);
    const a = await chain.scoreRep({ exercise: getExercise('mini-squat')!, features });
    expect(a.source).toBe('model:test@1');
    expect(a.score).toBe(60);
    expect(a.mistake).toBe('too_shallow');
    const b = await chain.scoreRep({ exercise: getExercise('sit-to-stand')!, features });
    expect(b.source).toBe('rules@1');
  });

  it('falls back to rules if the model throws', async () => {
    const broken: InferenceRuntime = {
      async load() {
        return { outputNames: ['x'], run: async () => { throw new Error('boom'); } };
      },
    };
    const model = await ModelScorer.create(manifest, broken, new RuleScorer());
    const chain = new ScorerChain([model, new RuleScorer()]);
    const r = await chain.scoreRep({ exercise: getExercise('mini-squat')!, features });
    expect(r.source).toBe('rules@1');
  });
});
