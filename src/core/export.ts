import { FEATURE_NAMES } from './features';
import type { SetResult } from './session';

/**
 * One row per rep, for building a training set. The label_* columns are left
 * blank for raters to fill in. Column order is stable; see docs/MODEL.md.
 */
export const EXPORT_COLUMNS = [
  'set_id',
  'exercise_id',
  'exercise_version',
  'rep_index',
  'source',
  ...FEATURE_NAMES,
  'app_score',
  'app_mistake',
  'label_score',
  'label_mistake',
  'curve',
] as const;

export interface RecordedSet {
  setId: string;
  source: 'camera' | 'demo' | 'synthetic';
  result: SetResult;
  /** Optional known labels per rep (synthetic data, or labels added in-app later). */
  labels?: Array<{ score?: number; mistake?: string }>;
}

function cell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(sets: RecordedSet[]): string {
  const lines = [EXPORT_COLUMNS.join(',')];
  for (const { setId, source, result, labels } of sets) {
    for (const rep of result.reps) {
      const row = [
        setId,
        result.exerciseId,
        result.exerciseVersion,
        rep.index,
        source,
        ...FEATURE_NAMES.map((n) => +rep.features[n].toFixed(4)),
        rep.score?.score ?? '',
        rep.score?.mistake ?? '',
        labels?.[rep.index]?.score ?? '',
        labels?.[rep.index]?.mistake ?? '',
        rep.curve.map((v) => v.toFixed(3)).join(';'),
      ];
      lines.push(row.map(cell).join(','));
    }
  }
  return lines.join('\n') + '\n';
}
