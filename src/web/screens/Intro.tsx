import { estimatedSetSeconds } from '../../core/session';
import { simulatorSupports } from '../../core/sim/simulator';
import { getExercise } from '../../exercises';
import { Alert, AreaIcon, Back, Camera, Info, Play } from '../components/Icons';
import type { AppState } from '../state';
import { setsDoneToday } from './Home';

export function Intro({ app, exerciseId, onBack, onStart }: {
  app: AppState;
  exerciseId: string;
  onBack: () => void;
  onStart: (mode: 'camera' | 'demo') => void;
}) {
  const ex = getExercise(exerciseId)!;
  const done = setsDoneToday(app, ex.id);
  const canCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  return (
    <main className="page no-tabs">
      <div className="topbar">
        <button className="back" onClick={onBack}><Back /> Back</button>
        <span className="badge num">Set {Math.min(done + 1, ex.plan.sets)} of {ex.plan.sets}</span>
      </div>
      <div className="row">
        <span className="ex-icon"><AreaIcon id={ex.id} /></span>
        <div className="grow">
          <h1>{ex.name}</h1>
          <p className="muted">{ex.plan.reps} reps · about {Math.ceil(estimatedSetSeconds(ex, ex.plan.reps) / 60)} min</p>
        </div>
      </div>
      <p>{ex.summary}</p>

      <section className="card stack">
        <h3>How to do it</h3>
        <ol className="steps">{ex.instructions.map((s) => <li key={s}>{s}</li>)}</ol>
      </section>

      <div className="callout"><Info /><p><b>Phone setup.</b> {ex.camera.tip}</p></div>
      <div className="callout warn"><Alert /><div className="stack" style={{ gap: 4 }}>{ex.safety.map((s) => <p key={s}>{s}</p>)}</div></div>

      <p className="small muted">The guide line on screen shows the pace to follow. Video stays on this phone and is never uploaded.</p>

      <div className="stack">
        <button className="btn primary big" onClick={() => onStart('camera')} disabled={!canCamera}><Camera /> Start with camera</button>
        {simulatorSupports(ex) && (
          <button className="btn ghost big" onClick={() => onStart('demo')}><Play /> Watch a demo set</button>
        )}
      </div>
    </main>
  );
}
