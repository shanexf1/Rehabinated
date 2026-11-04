import type { ExerciseDefinition } from '../exercise';
import { FEATURE_NAMES, type RepFeatures } from '../features';
import { MISTAKES, type MistakeId } from '../types';

/**
 * Describes a trained model you drop into public/models/. The app reads
 * public/models/manifest.json at startup. If it is missing or invalid, the
 * rule-based scorer is used. Full format: docs/MODEL.md.
 */
export interface ModelManifest {
  format: 'rehabinated-model@1';
  name: string;
  version: string;
  /** Exercise ids the model was trained on, or ["*"] for all. */
  exercises: string[];
  /**
   * Input columns, in order. Each is a feature name from FEATURE_NAMES, or
   * "exercise:<id>" for a one-hot exercise column (1 if this rep is that exercise).
   */
  inputs: string[];
  /** Optional standardization applied before the model: (x - mean) / std, per input. */
  normalize?: { mean: number[]; std: number[] };
  /** Regression model that outputs the rep score. */
  score?: {
    file: string;
    /** Model output name to read (first output if omitted). */
    output?: string;
    /** Range the model outputs, mapped linearly onto 0..100. Default [0, 100]. */
    outputRange?: [number, number];
  };
  /** Classifier that outputs the main mistake. */
  mistake?: {
    file: string;
    /** Output with one probability per class (preferred), shape [1, classes.length]. */
    probabilitiesOutput?: string;
    /** Or an output with the class index. */
    labelOutput?: string;
    /** Class order used in training; every entry must be a known mistake id. */
    classes: MistakeId[];
  };
}

export function validateManifest(raw: unknown): { manifest?: ModelManifest; errors: string[] } {
  const errors: string[] = [];
  const m = raw as Partial<ModelManifest> | null;
  if (!m || typeof m !== 'object') return { errors: ['manifest is not an object'] };
  if (m.format !== 'rehabinated-model@1') errors.push('format must be "rehabinated-model@1"');
  if (!m.name) errors.push('name is required');
  if (!Array.isArray(m.exercises) || m.exercises.length === 0) errors.push('exercises must list ids or ["*"]');
  if (!Array.isArray(m.inputs) || m.inputs.length === 0) errors.push('inputs must be a non-empty list');
  else {
    for (const name of m.inputs) {
      const ok = (FEATURE_NAMES as readonly string[]).includes(name) || /^exercise:[a-z0-9-]+$/.test(name);
      if (!ok) errors.push(`unknown input "${name}"`);
    }
  }
  if (m.normalize) {
    const n = m.inputs?.length ?? 0;
    if (m.normalize.mean?.length !== n || m.normalize.std?.length !== n) errors.push('normalize.mean and normalize.std must match inputs length');
  }
  if (!m.score && !m.mistake) errors.push('need at least one of score or mistake');
  if (m.score && !m.score.file) errors.push('score.file is required');
  if (m.mistake) {
    if (!m.mistake.file) errors.push('mistake.file is required');
    if (!m.mistake.probabilitiesOutput && !m.mistake.labelOutput) errors.push('mistake needs probabilitiesOutput or labelOutput');
    if (!Array.isArray(m.mistake.classes) || m.mistake.classes.length < 2) errors.push('mistake.classes needs at least 2 classes');
    else for (const c of m.mistake.classes) if (!(MISTAKES as readonly string[]).includes(c)) errors.push(`unknown mistake class "${c}"`);
  }
  return errors.length ? { errors } : { manifest: m as ModelManifest, errors };
}

export function manifestSupports(m: ModelManifest, ex: ExerciseDefinition): boolean {
  return m.exercises.includes('*') || m.exercises.includes(ex.id);
}

/** Builds the model input row for one rep, in the manifest's column order. */
export function buildInputVector(m: ModelManifest, ex: ExerciseDefinition, f: RepFeatures): Float32Array {
  const out = new Float32Array(m.inputs.length);
  m.inputs.forEach((name, i) => {
    let v: number;
    if (name.startsWith('exercise:')) v = name.slice(9) === ex.id ? 1 : 0;
    else v = f[name as keyof RepFeatures];
    if (!Number.isFinite(v)) v = 0;
    if (m.normalize) v = (v - m.normalize.mean[i]) / (m.normalize.std[i] || 1);
    out[i] = v;
  });
  return out;
}

export function mapScoreOutput(m: ModelManifest, raw: number): number {
  const [lo, hi] = m.score?.outputRange ?? [0, 100];
  const s = ((raw - lo) / (hi - lo || 1)) * 100;
  return Math.round(Math.min(100, Math.max(0, s)));
}

export function mapMistakeOutput(
  m: ModelManifest,
  out: { probabilities?: ArrayLike<number>; label?: number },
): { mistake: MistakeId; probs?: Record<string, number> } {
  const classes = m.mistake!.classes;
  if (out.probabilities) {
    let best = 0;
    const probs: Record<string, number> = {};
    for (let i = 0; i < classes.length; i++) {
      probs[classes[i]] = Number(out.probabilities[i]);
      if (out.probabilities[i] > out.probabilities[best]) best = i;
    }
    return { mistake: classes[best], probs };
  }
  const idx = Math.round(out.label ?? 0);
  return { mistake: classes[idx] ?? 'good' };
}
