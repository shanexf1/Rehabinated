import type { ExerciseDefinition } from '../exercise';
import type { InferenceRuntime, LoadedModel } from '../../platform/inference';
import {
  buildInputVector,
  manifestSupports,
  mapMistakeOutput,
  mapScoreOutput,
  type ModelManifest,
} from './modelManifest';
import type { RepScore, RepScoreInput, RepScorer } from './types';

/**
 * Scores reps with trained weights described by a manifest. If the manifest
 * only has one of the two models, the other half comes from `fallback`.
 */
export class ModelScorer implements RepScorer {
  readonly id: string;

  private constructor(
    private readonly manifest: ModelManifest,
    private readonly scoreModel: LoadedModel | undefined,
    private readonly mistakeModel: LoadedModel | undefined,
    private readonly fallback: RepScorer,
  ) {
    this.id = `model:${manifest.name}@${manifest.version}`;
  }

  static async create(manifest: ModelManifest, runtime: InferenceRuntime, fallback: RepScorer): Promise<ModelScorer> {
    const [scoreModel, mistakeModel] = await Promise.all([
      manifest.score ? runtime.load(manifest.score.file) : Promise.resolve(undefined),
      manifest.mistake ? runtime.load(manifest.mistake.file) : Promise.resolve(undefined),
    ]);
    return new ModelScorer(manifest, scoreModel, mistakeModel, fallback);
  }

  supports(exercise: ExerciseDefinition): boolean {
    return manifestSupports(this.manifest, exercise);
  }

  async scoreRep(input: RepScoreInput): Promise<RepScore> {
    const x = buildInputVector(this.manifest, input.exercise, input.features);
    const needFallback = !this.scoreModel || !this.mistakeModel;
    const base = needFallback ? await this.fallback.scoreRep(input) : undefined;

    let score = base?.score ?? 0;
    if (this.scoreModel) {
      const out = await this.scoreModel.run(x);
      const name = this.manifest.score?.output ?? this.scoreModel.outputNames[0];
      score = mapScoreOutput(this.manifest, Number(out[name][0]));
    }

    let mistake = base?.mistake ?? 'good';
    let probs: Record<string, number> | undefined;
    if (this.mistakeModel && this.manifest.mistake) {
      const out = await this.mistakeModel.run(x);
      const spec = this.manifest.mistake;
      const mapped = mapMistakeOutput(this.manifest, {
        probabilities: spec.probabilitiesOutput ? out[spec.probabilitiesOutput] : undefined,
        label: spec.labelOutput ? Number(out[spec.labelOutput][0]) : undefined,
      });
      mistake = mapped.mistake;
      probs = mapped.probs;
    }

    return { score, mistake, source: this.id, breakdown: probs ?? base?.breakdown };
  }
}

/** Tries each scorer in order and uses the first that supports the exercise. */
export class ScorerChain implements RepScorer {
  readonly id: string;
  constructor(private readonly scorers: RepScorer[]) {
    this.id = scorers.map((s) => s.id).join(' > ');
  }
  supports(exercise: ExerciseDefinition): boolean {
    return this.scorers.some((s) => s.supports(exercise));
  }
  pick(exercise: ExerciseDefinition): RepScorer {
    const s = this.scorers.find((x) => x.supports(exercise));
    if (!s) throw new Error(`No scorer supports ${exercise.id}`);
    return s;
  }
  async scoreRep(input: RepScoreInput): Promise<RepScore> {
    const chosen = this.pick(input.exercise);
    try {
      return await chosen.scoreRep(input);
    } catch (err) {
      // A broken model must never break a workout: fall back to the last scorer (rules).
      const last = this.scorers[this.scorers.length - 1];
      if (chosen === last) throw err;
      return last.scoreRep(input);
    }
  }
}
