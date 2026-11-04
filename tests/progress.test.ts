import { describe, expect, it } from 'vitest';
import { addDays, applyFreezes, emptyProgress, recordSet, streak, takeRestDay, type ProgressState } from '../src/core/progress';

const log = { exerciseId: 'mini-squat', reps: 10, score: 90, at: 0 };

function meetGoal(s: ProgressState, day: string): ProgressState {
  let st = s;
  while ((st.days.find((d) => d.date === day)?.xp ?? 0) < st.dailyGoalXp) st = recordSet(st, log, day).state;
  return st;
}

describe('progress', () => {
  it('counts consecutive goal days as a streak', () => {
    let s = emptyProgress();
    s = meetGoal(s, '2026-11-01');
    s = meetGoal(s, '2026-11-02');
    s = meetGoal(s, '2026-11-03');
    expect(streak(s, '2026-11-03')).toBe(3);
    // An unfinished today does not break it yet.
    expect(streak(s, '2026-11-04')).toBe(3);
  });

  it('spends a freeze to cover one missed day', () => {
    let s = { ...emptyProgress(), freezes: 1 };
    s = meetGoal(s, '2026-11-01');
    s = meetGoal(s, '2026-11-02');
    // 11-03 missed
    s = applyFreezes(s, '2026-11-04');
    expect(s.freezes).toBe(0);
    expect(streak(s, '2026-11-04')).toBe(3);
  });

  it('breaks the streak with no freezes left', () => {
    let s = { ...emptyProgress(), freezes: 0 };
    s = meetGoal(s, '2026-11-01');
    s = applyFreezes(s, '2026-11-03');
    expect(streak(s, '2026-11-03')).toBe(0);
  });

  it('earns a freeze every 7 days', () => {
    let s = { ...emptyProgress(), freezes: 0 };
    let day = '2026-10-01';
    let earned = false;
    for (let i = 0; i < 7; i++) {
      while ((s.days.find((d) => d.date === day)?.xp ?? 0) < s.dailyGoalXp) {
        const r = recordSet(s, log, day);
        s = r.state;
        earned ||= r.freezeEarned;
      }
      day = addDays(day, 1);
    }
    expect(earned).toBe(true);
    expect(s.freezes).toBe(1);
  });

  it('a rest day keeps the streak and uses a freeze', () => {
    let s = { ...emptyProgress(), freezes: 1 };
    s = meetGoal(s, '2026-11-01');
    s = takeRestDay(s, '2026-11-02');
    expect(s.freezes).toBe(0);
    expect(streak(s, '2026-11-02')).toBe(2);
  });

  it('handles month boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
