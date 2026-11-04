import { useCallback, useEffect, useState } from 'react';
import type { RecordedSet } from '../core/export';
import { applyFreezes, dateKey, emptyProgress, type ProgressState } from '../core/progress';
import { RuleScorer } from '../core/scoring/ruleScorer';
import { localStore } from './adapters/localStore';
import { loadScorer, type ScorerStatus } from './adapters/loadScorer';

export interface Settings {
  voice: boolean;
  /** Keep every rep's features so they can be exported for training. */
  dataCollection: boolean;
}

const KEYS = { progress: 'rehab.progress.v1', settings: 'rehab.settings.v1', recordings: 'rehab.recordings.v1' };
const DEFAULT_SETTINGS: Settings = { voice: true, dataCollection: false };
const MAX_RECORDED_SETS = 300;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await localStore.get(key);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export const today = () => dateKey(new Date());

export function useAppState() {
  const [progress, setProgressState] = useState<ProgressState>(emptyProgress());
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [recordings, setRecordings] = useState<RecordedSet[]>([]);
  const [scorer, setScorer] = useState<ScorerStatus>({ scorer: new RuleScorer(), label: 'Checking for a trained model…' });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const p = applyFreezes(await readJson(KEYS.progress, emptyProgress()), today());
      setProgressState(p);
      void localStore.set(KEYS.progress, JSON.stringify(p));
      setSettingsState(await readJson(KEYS.settings, DEFAULT_SETTINGS));
      const rec = await localStore.get(KEYS.recordings);
      if (rec) {
        try {
          setRecordings(JSON.parse(rec));
        } catch {
          /* ignore */
        }
      }
      setReady(true);
    })();
    loadScorer().then(setScorer);
  }, []);

  const setProgress = useCallback((p: ProgressState) => {
    setProgressState(p);
    void localStore.set(KEYS.progress, JSON.stringify(p));
  }, []);

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    void localStore.set(KEYS.settings, JSON.stringify(s));
  }, []);

  const addRecording = useCallback((r: RecordedSet) => {
    setRecordings((prev) => {
      const next = [...prev, r].slice(-MAX_RECORDED_SETS);
      void localStore.set(KEYS.recordings, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecordings = useCallback(() => {
    setRecordings([]);
    void localStore.set(KEYS.recordings, '[]');
  }, []);

  return { ready, progress, setProgress, settings, setSettings, recordings, addRecording, clearRecordings, scorer };
}

export type AppState = ReturnType<typeof useAppState>;

/** Saves text as a file (normal browsers; not available inside some embedded viewers). */
export function downloadText(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
