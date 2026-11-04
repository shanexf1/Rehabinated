import { addDays, dayCounts, streak, takeRestDay, todayXp } from '../../core/progress';
import { EXERCISES } from '../../exercises';
import { AreaIcon, Flame, Snow } from '../components/Icons';
import { Ring } from '../components/Ring';
import { today, type AppState } from '../state';

export function setsDoneToday(app: AppState, exerciseId: string): number {
  const d = today();
  return app.progress.history.filter((h) => h.date === d && h.exerciseId === exerciseId).length;
}

export function Home({ app, onPick }: { app: AppState; onPick: (exerciseId: string) => void }) {
  const d = today();
  const p = app.progress;
  const s = streak(p, d);
  const xp = todayXp(p, d);
  const goalMet = xp >= p.dailyGoalXp;
  const restToday = p.days.find((x) => x.date === d)?.restDay;
  const next = EXERCISES.find((e) => setsDoneToday(app, e.id) < e.plan.sets);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const week = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6));

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="var(--accent)" /><path d="M120 360 C180 360 200 150 256 150 C312 150 332 360 392 360" fill="none" stroke="var(--gold)" strokeWidth="40" strokeLinecap="round" /><circle cx="256" cy="150" r="34" fill="#fff" /></svg>
          Rehabinated
        </div>
        <span className="streak-pill num" aria-label={`${s} day streak`}>
          <Flame /> {s}
        </span>
      </header>

      <section className="card hero" aria-label="Today's goal">
        <Ring value={xp} max={p.dailyGoalXp}>
          <b className="num">{xp}</b>
          <span className="small muted num">of {p.dailyGoalXp} XP</span>
        </Ring>
        <div className="stack">
          <h1>{greet}</h1>
          <p className="muted">
            {restToday
              ? 'Rest day. Your streak is safe.'
              : goalMet
                ? "Today's goal is done. Anything extra is a bonus."
                : s > 0
                  ? `Keep your ${s}-day streak going.`
                  : 'Complete today’s goal to start a streak.'}
          </p>
          <p className="small muted row">
            <Snow /> {p.freezes} streak {p.freezes === 1 ? 'freeze' : 'freezes'}
          </p>
        </div>
      </section>

      <section className="card stack" aria-label="This week">
        <h3>This week</h3>
        <div className="week">
          {week.map((k) => {
            const day = p.days.find((x) => x.date === k);
            const met = dayCounts(p, k) && !day?.frozen && !day?.restDay;
            const frozen = !!(day?.frozen || day?.restDay);
            const label = new Date(k + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'narrow' });
            return (
              <div className="d" key={k}>
                <span className={`dot${met ? ' met' : ''}${frozen ? ' frozen' : ''}${k === d ? ' today' : ''}`}>
                  {met ? <Flame /> : frozen ? <Snow /> : null}
                </span>
                {label}
              </div>
            );
          })}
        </div>
      </section>

      <section className="stack" aria-label="Today's exercises">
        <h2>Today’s plan</h2>
        {EXERCISES.map((e) => {
          const done = setsDoneToday(app, e.id);
          return (
            <button key={e.id} className="card ex-item" onClick={() => onPick(e.id)}>
              <span className="ex-icon"><AreaIcon id={e.id} /></span>
              <span className="stack" style={{ gap: 4 }}>
                <b>{e.name}</b>
                <span className="small muted">{e.plan.sets} sets of {e.plan.reps} · {e.bodyArea}</span>
              </span>
              <span className="sets" aria-label={`${done} of ${e.plan.sets} sets done`}>
                {Array.from({ length: e.plan.sets }, (_, i) => <i key={i} className={i < done ? 'done' : ''} />)}
              </span>
            </button>
          );
        })}
      </section>

      {next ? (
        <button className="btn primary big" onClick={() => onPick(next.id)}>Start: {next.name}</button>
      ) : (
        <div className="callout"><Flame /><p>All of today’s sets are done. Well done.</p></div>
      )}

      {!goalMet && !restToday && p.freezes > 0 && (
        <button className="link" onClick={() => app.setProgress(takeRestDay(p, d))}>
          In pain or unwell today? Take a rest day (uses a streak freeze)
        </button>
      )}
    </main>
  );
}
