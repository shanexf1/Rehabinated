import { milestones, streak } from '../../core/progress';
import { getExercise } from '../../exercises';
import { Medal } from '../components/Icons';
import { today, type AppState } from '../state';

export function Progress({ app }: { app: AppState }) {
  const p = app.progress;
  const recent = [...p.history].reverse().slice(0, 20);
  const avg = p.history.length ? Math.round(p.history.slice(-10).reduce((a, h) => a + h.score, 0) / Math.min(10, p.history.length)) : 0;
  return (
    <main className="page">
      <h1>Your progress</h1>
      <div className="stats">
        <div className="stat"><b className="num">{streak(p, today())}</b><span>day streak</span></div>
        <div className="stat"><b className="num">{p.totalXp}</b><span>total XP</span></div>
        <div className="stat"><b className="num">{avg || '–'}</b><span>recent score</span></div>
      </div>

      <section className="stack">
        <h2>Milestones</h2>
        <div className="miles">
          {milestones(p).map((m) => (
            <div key={m.id} className={`mile${m.reached ? ' on' : ''}`}><Medal />{m.label}</div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Recent sets</h2>
        {recent.length === 0 ? (
          <p className="muted">Your finished sets will show here, with their scores.</p>
        ) : (
          <div className="hist">
            {recent.map((h) => (
              <div className="row" key={h.at}>
                <div className="grow">
                  <b>{getExercise(h.exerciseId)?.name ?? h.exerciseId}</b>
                  <p className="small muted num">
                    {new Date(h.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {h.reps} reps · +{h.xp} XP
                  </p>
                </div>
                <span className={`badge num ${h.score >= 80 ? 'good' : h.score >= 60 ? 'warn' : 'bad'}`}>{h.score}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
