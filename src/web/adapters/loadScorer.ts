import { validateManifest } from '../../core/scoring/modelManifest';
import { ModelScorer, ScorerChain } from '../../core/scoring/modelScorer';
import { RuleScorer } from '../../core/scoring/ruleScorer';
import type { RepScorer } from '../../core/scoring/types';
import { createOnnxRuntime } from './onnxRuntime';

export interface ScorerStatus {
  scorer: RepScorer;
  /** Shown in Settings so you can confirm which model is live. */
  label: string;
  detail?: string;
}

/**
 * Looks for public/models/manifest.json. If found and valid, the trained
 * model scores reps; otherwise (or for exercises it doesn't cover) the
 * rule-based scorer does.
 */
export async function loadScorer(): Promise<ScorerStatus> {
  const rules = new RuleScorer();
  const base = new URL('models/', document.baseURI).href;
  let raw: unknown;
  try {
    const res = await fetch(new URL('manifest.json', base), { cache: 'no-cache' });
    if (!res.ok) return { scorer: rules, label: 'Built-in rules', detail: 'No model in models/manifest.json.' };
    raw = await res.json();
  } catch {
    return { scorer: rules, label: 'Built-in rules', detail: 'No model in models/manifest.json.' };
  }
  const { manifest, errors } = validateManifest(raw);
  if (!manifest) {
    console.warn('[rehabinated] models/manifest.json is invalid:', errors);
    return { scorer: rules, label: 'Built-in rules', detail: `Model manifest is invalid: ${errors.join('; ')}` };
  }
  try {
    const model = await ModelScorer.create(manifest, createOnnxRuntime(base), rules);
    return {
      scorer: new ScorerChain([model, rules]),
      label: `Trained model: ${manifest.name} v${manifest.version}`,
      detail: `Covers ${manifest.exercises.join(', ')}. Other exercises use the built-in rules.`,
    };
  } catch (err) {
    console.warn('[rehabinated] could not load model:', err);
    return { scorer: rules, label: 'Built-in rules', detail: `Model files failed to load: ${String(err)}` };
  }
}
