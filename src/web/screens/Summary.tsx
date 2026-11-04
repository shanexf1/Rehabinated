import { toCsv, type RecordedSet } from '../../core/export';
import type { RecordResult } from '../../core/progress';
import type { SetResult } from '../../core/session';
import type { MistakeId } from '../../core/types';
import { getExercise } from '../../exercises';
import { Bulb, Flame, Snow } from '../components/Icons';
import { Ring } from '../components/Ring';
import { downloadText } from '../state';

const MISTAKE_LABEL: Record<MistakeId, string> = {
  good: 'Good',
  too_shallow: 'Too small',
  too_fast: 'Too fast',
  too_slow: 'Too slow',
  dropped: 'Dropped',
  jerky: 'Wobbly',
  off_path: 'Off path',
  uneven: 'Uneven',
  posture: 'Posture',
};

const scoreColor = (s: number) => (s >= 80 ? 'var(--good)' : s >= 60 ? 'var(--warn)' : 'var(--bad)');
const verdict = (s: number) => (s >= 90 ? 'Excellent set' : s >= 80 ? 'Great set' : s >= 65 ? 'Good effort' : s > 0 ? 'Keep practising' : 'No reps counted');

export function Summary({ result, record, setIndex, recorded, onNext, onDone }: {
  result: SetResult;
  record: RecordResult;
  setIndex: number;
  recorded?: RecordedSet;
  onNext?: () => void;
  onDone: () => void;
}) {
  const ex = getExercise(result.exerciseId)!;
  const goal = record.state.dailyGoalXp;
  const xpToday = record.state.days.find((d) => d.date === record.state.days[record.state.days.length - 1]?.date)?.xp ?? 0;
  return (
    <main className="page no-tabs">
      <section className="score-hero">
        <p className="muted">{ex.name} · set {setIndex + 1}</p>
        <Ring value={result.setScore} max={100} color={scoreColor(result.setScore)} size={150} stroke={14}>
          <b className="num" style={{ fontSize: '2.6rem' }}>{result.setScore}</b>
          <span className="small muted">score</span>
        </Ring>
        <h1>{verdict(result.setScore)}</h1>
        <p className="muted num">{result.reps.length} of {result.targetReps} reps</p>
      </section>

      {result.reps.length > 0 && (
        <section className="card stack" aria-label="Score for each rep">
          <h3>Each rep</h3>
          <div className="bars">
            {result.reps.map((r) => {
              const s = r.score?.score ?? 0;
              return (
                <div className="bar" key={r.index} title={`Rep ${r.index + 1}: ${s} (${MISTAKE_LABEL[r.score?.mistake ?? 'good']})`}>
                  <small className="num">{s}</small>
                  <span style={{ height: `${Math.max(6, s)}%`, background: scoreColor(s) }} />
                  <small className="num">{r.index + 1}</small>
                </div>
              );
            })}
          </div>
          <div className="row wrap">
            {Object.entries(
              result.reps.reduce<Record<string, number>>((a, r) => {
                const m = r.score?.mistake ?? 'good';
                a[m] = (a[m] ?? 0) + 1;
                return a;
              }, {}),
            ).map(([m, n]) => (
              <span key={m} className={`badge ${m === 'good' ? 'good' : 'warn'}`}>{MISTAKE_LABEL[m as MistakeId]} × {n}</span>
            ))}
          </div>
        </section>
      )}

      <section className="card stack" aria-label="Tips">
        <h3>Coach’s tips</h3>
        {result.tips.map((t) => (
          <div className="tip" key={t}><Bulb /><p>{t}</p></div>
        ))}
      </section>

      <section className="card stack" aria-label="XP">
        <div className="xp-line">
          <span>+{record.xpGained} XP</span>
          {record.streak > 0 && <span className="streak-pill num"><Flame /> {record.streak} day{record.streak === 1 ? '' : 's'}</span>}
        </div>
        <div className="meter" aria-label={`${xpToday} of ${goal} XP today`}><span style={{ width: `${Math.min(100, (xpToday / goal) * 100)}%` }} /></div>
        <p className="small muted num">{xpToday >= goal ? 'Daily goal reached.' : `${goal - xpToday} XP to today’s goal.`}</p>
        {record.goalJustMet && <p><b>Daily goal done!</b> Your streak is now {record.streak} {record.streak === 1 ? 'day' : 'days'}.</p>}
        {record.freezeEarned && <p className="row"><Snow /> You earned a streak freeze.</p>}
      </section>

      <div className="stack">
        {onNext && <button className="btn primary big" onClick={onNext}>Next set</button>}
        <button className={`btn big ${onNext ? 'ghost' : 'primary'}`} onClick={onDone}>Done</button>
        {recorded && (
          <button className="link" onClick={() => downloadText(`rehabinated-${recorded.setId}.csv`, toCsv([recorded]))}>
            Download this set’s rep data (CSV)
          </button>
        )}
        <p className="small muted">Scored by: {result.scorerId}</p>
      </div>
    </main>
  );
}
