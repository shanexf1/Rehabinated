import { weightsFor, type ScoreWeights } from '../exercise';
import type { MistakeId } from '../types';
import type { RepScore, RepScoreInput, RepScorer } from './types';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Transparent hand-written scoring. Used until a trained model is dropped in, and as its fallback. */
export class RuleScorer implements RepScorer {
  readonly id = 'rules@1';

  supports(): boolean {
    return true;
  }

  scoreRep({ exercise, features: f }: RepScoreInput): RepScore {
    const parts: Record<keyof ScoreWeights, number> = {
      range: clamp01((f.range_frac - 0.5) / 0.4) * 100,
      path: clamp01(1 - (f.path_error - 0.05) / 0.25) * 100,
      tempo:
        f.duration_ratio < 0.7
          ? clamp01((f.duration_ratio - 0.35) / 0.35) * 100
          : f.duration_ratio > 1.8
            ? clamp01(1 - (f.duration_ratio - 1.8) / 1.5) * 100
            : 100,
      control: Math.min(
        clamp01((f.return_ratio - 0.25) / 0.35) * 100,
        clamp01(1 - (f.jerk_index - 1.6) / 1.6) * 100,
      ),
      symmetry: clamp01(1 - (f.side_diff_deg - 8) / 20) * 100,
      posture: clamp01(1 - f.posture_excess_deg / 20) * 100,
    };

    const w = weightsFor(exercise);
    const totalW = Object.values(w).reduce((a, b) => a + b, 0);
    let score = 0;
    for (const k of Object.keys(parts) as (keyof ScoreWeights)[]) score += (w[k] / totalW) * parts[k];

    // Main mistake = the weakest part that counts, if it is clearly weak.
    let worst: keyof ScoreWeights | undefined;
    for (const k of Object.keys(parts) as (keyof ScoreWeights)[]) {
      if (w[k] === 0) continue;
      if (parts[k] < 70 && (worst === undefined || parts[k] < parts[worst])) worst = k;
    }
    let mistake: MistakeId = 'good';
    switch (worst) {
      case 'range':
        mistake = 'too_shallow';
        break;
      case 'path':
        mistake = 'off_path';
        break;
      case 'tempo':
        mistake = f.duration_ratio < 1 ? 'too_fast' : 'too_slow';
        break;
      case 'control':
        mistake = f.return_ratio < 0.6 ? 'dropped' : 'jerky';
        break;
      case 'symmetry':
        mistake = 'uneven';
        break;
      case 'posture':
        mistake = 'posture';
        break;
    }

    return { score: Math.round(score), mistake, source: this.id, breakdown: parts };
  }
}
