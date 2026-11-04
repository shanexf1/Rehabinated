/**
 * Daily-habit layer: XP, a daily goal, streaks and streak freezes.
 * Pure functions over a plain object, so any storage can save it.
 */

export interface DayLog {
  /** Local date, YYYY-MM-DD. */
  date: string;
  xp: number;
  sets: number;
  /** True if a streak freeze or rest day covered this day. */
  frozen?: boolean;
  restDay?: boolean;
}

export interface SetLog {
  date: string;
  exerciseId: string;
  reps: number;
  score: number;
  xp: number;
  at: number;
}

export interface ProgressState {
  version: 1;
  dailyGoalXp: number;
  totalXp: number;
  days: DayLog[];
  history: SetLog[];
  freezes: number;
  /** Highest streak reached, for milestones. */
  bestStreak: number;
}

export const MAX_FREEZES = 2;
/** A freeze is earned every this many streak days. */
export const FREEZE_EVERY = 7;

export function emptyProgress(): ProgressState {
  return { version: 1, dailyGoalXp: 30, totalXp: 0, days: [], history: [], freezes: 1, bestStreak: 0 };
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

/** XP for one set: showing up counts most, quality adds a bonus. */
export function xpForSet(reps: number, score: number): number {
  if (reps === 0) return 0;
  return 5 + reps + Math.round(score / 10);
}

function day(state: ProgressState, key: string): DayLog | undefined {
  return state.days.find((d) => d.date === key);
}

/** A day counts toward the streak if the goal was met, or it was frozen / a rest day. */
export function dayCounts(state: ProgressState, key: string): boolean {
  const d = day(state, key);
  return !!d && (d.xp >= state.dailyGoalXp || !!d.frozen || !!d.restDay);
}

/**
 * Before showing the home screen: if exactly one day was missed and a freeze
 * is available, spend it so one bad day does not wipe out a long streak.
 */
export function applyFreezes(state: ProgressState, today: string): ProgressState {
  const yesterday = addDays(today, -1);
  const before = addDays(today, -2);
  if (!dayCounts(state, yesterday) && dayCounts(state, before) && state.freezes > 0) {
    const days = state.days.filter((d) => d.date !== yesterday);
    days.push({ ...(day(state, yesterday) ?? { date: yesterday, xp: 0, sets: 0 }), frozen: true });
    return { ...state, freezes: state.freezes - 1, days: sortDays(days) };
  }
  return state;
}

/** Current streak in days. Today counts once its goal is met; an unfinished today does not break it. */
export function streak(state: ProgressState, today: string): number {
  let n = 0;
  let key = dayCounts(state, today) ? today : addDays(today, -1);
  while (dayCounts(state, key)) {
    n++;
    key = addDays(key, -1);
  }
  return n;
}

export function todayXp(state: ProgressState, today: string): number {
  return day(state, today)?.xp ?? 0;
}

export interface RecordResult {
  state: ProgressState;
  xpGained: number;
  goalJustMet: boolean;
  freezeEarned: boolean;
  streak: number;
}

export function recordSet(
  state: ProgressState,
  log: Omit<SetLog, 'xp' | 'date'>,
  today: string,
): RecordResult {
  const xp = xpForSet(log.reps, log.score);
  const wasMet = dayCounts(state, today) && !day(state, today)?.restDay;
  const existing = day(state, today) ?? { date: today, xp: 0, sets: 0 };
  const updated: DayLog = { ...existing, xp: existing.xp + xp, sets: existing.sets + 1 };
  const days = sortDays([...state.days.filter((d) => d.date !== today), updated]);
  let next: ProgressState = {
    ...state,
    totalXp: state.totalXp + xp,
    days,
    history: [...state.history, { ...log, xp, date: today }].slice(-500),
  };
  const s = streak(next, today);
  const goalJustMet = !wasMet && updated.xp >= state.dailyGoalXp;
  let freezeEarned = false;
  if (goalJustMet && s > 0 && s % FREEZE_EVERY === 0 && next.freezes < MAX_FREEZES) {
    next = { ...next, freezes: next.freezes + 1 };
    freezeEarned = true;
  }
  next = { ...next, bestStreak: Math.max(next.bestStreak, s) };
  return { state: next, xpGained: xp, goalJustMet, freezeEarned, streak: s };
}

/** A planned rest or pain day keeps the streak without exercise. Uses a freeze. */
export function takeRestDay(state: ProgressState, today: string): ProgressState {
  if (state.freezes <= 0 || dayCounts(state, today)) return state;
  const existing = day(state, today) ?? { date: today, xp: 0, sets: 0 };
  return {
    ...state,
    freezes: state.freezes - 1,
    days: sortDays([...state.days.filter((d) => d.date !== today), { ...existing, restDay: true }]),
  };
}

export interface Milestone {
  id: string;
  label: string;
  reached: boolean;
}

export function milestones(state: ProgressState): Milestone[] {
  const sets = state.history.length;
  const best = state.history.reduce((a, h) => Math.max(a, h.score), 0);
  return [
    { id: 'first-set', label: 'First set done', reached: sets >= 1 },
    { id: 'streak-3', label: '3-day streak', reached: state.bestStreak >= 3 },
    { id: 'streak-7', label: '7-day streak', reached: state.bestStreak >= 7 },
    { id: 'score-90', label: 'A set scored 90+', reached: best >= 90 },
    { id: 'sets-25', label: '25 sets', reached: sets >= 25 },
    { id: 'streak-30', label: '30-day streak', reached: state.bestStreak >= 30 },
  ];
}

function sortDays(days: DayLog[]): DayLog[] {
  return days.sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
}
