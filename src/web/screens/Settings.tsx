import { useState } from 'react';
import { toCsv } from '../../core/export';
import { emptyProgress } from '../../core/progress';
import { downloadText, type AppState } from '../state';

export function Settings({ app }: { app: AppState }) {
  const s = app.settings;
  const [confirmReset, setConfirmReset] = useState(false);
  const reps = app.recordings.reduce((a, r) => a + r.result.reps.length, 0);
  return (
    <main className="page">
      <h1>Settings</h1>

      <section className="card">
        <div className="setting">
          <div><b>Spoken coaching</b><p className="small muted">Counts reps and reads tips aloud.</p></div>
          <label className="switch"><input id="voice" type="checkbox" checked={s.voice} onChange={(e) => app.setSettings({ ...s, voice: e.target.checked })} aria-label="Spoken coaching" /><span /></label>
        </div>
        <div className="setting">
          <div><b>Daily goal</b><p className="small muted">XP needed to keep your streak.</p></div>
          <div className="seg" role="group" aria-label="Daily goal">
            {[20, 30, 50].map((g) => (
              <button key={g} aria-pressed={app.progress.dailyGoalXp === g} onClick={() => app.setProgress({ ...app.progress, dailyGoalXp: g })}>{g}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="card stack">
        <h2>Scoring</h2>
        <p><b>{app.scorer.label}</b></p>
        {app.scorer.detail && <p className="small muted">{app.scorer.detail}</p>}
        <p className="small muted">To use a trained model, add manifest.json and .onnx files to the models folder. See docs/MODEL.md.</p>
      </section>

      <section className="card">
        <div className="setting">
          <div><b>Data collection mode</b><p className="small muted">Saves every rep’s measurements on this phone for building a training set. No video is saved.</p></div>
          <label className="switch"><input id="collect" type="checkbox" checked={s.dataCollection} onChange={(e) => app.setSettings({ ...s, dataCollection: e.target.checked })} aria-label="Data collection mode" /><span /></label>
        </div>
        {(s.dataCollection || app.recordings.length > 0) && (
          <div className="stack" style={{ paddingTop: 12 }}>
            <p className="small muted num">{app.recordings.length} sets, {reps} reps saved.</p>
            <div className="row wrap">
              <button className="btn" disabled={!reps} onClick={() => downloadText('rehabinated-reps.csv', toCsv(app.recordings))}>Export CSV</button>
              <button className="btn ghost" disabled={!app.recordings.length} onClick={app.clearRecordings}>Clear saved reps</button>
            </div>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Reset</h2>
        {confirmReset ? (
          <div className="stack">
            <p>This deletes your streak, XP and history on this phone. It can’t be undone.</p>
            <div className="row wrap">
              <button className="btn danger" onClick={() => { app.setProgress(emptyProgress()); setConfirmReset(false); }}>Delete progress</button>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>Keep it</button>
            </div>
          </div>
        ) : (
          <button className="btn ghost" onClick={() => setConfirmReset(true)}>Reset progress…</button>
        )}
      </section>

      <p className="small muted">Rehabinated is a practice aid, not a medical device. Follow your clinician’s advice.</p>
    </main>
  );
}
