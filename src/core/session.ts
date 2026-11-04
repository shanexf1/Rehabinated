import { cueFor, plannedDuration, type ExerciseDefinition } from './exercise';
import { computeFeatures, repShape, type RepFeatures } from './features';
import { bestSide, measure } from './geometry';
import { RepDetector, type DetectorPhase, type Sample } from './repDetector';
import type { RepScore, RepScorer } from './scoring/types';
import { Smoother } from './smoothing';
import { targetProgressAt } from './trajectory';
import type { MistakeId, PoseFrame, Side } from './types';

export interface RepResult {
  index: number;
  features: RepFeatures;
  /** Undefined until the scorer answers (models are async). */
  score?: RepScore;
  /** Normalized rep curve (progress units), for charts and data export. */
  curve: number[];
}

export interface SetResult {
  exerciseId: string;
  exerciseVersion: number;
  startedAt: number;
  endedAt: number;
  targetReps: number;
  reps: RepResult[];
  /** Average rep score, 0..100 (0 if no reps). */
  setScore: number;
  mainMistake: MistakeId;
  tips: string[];
  scorerId: string;
}

export type SessionEvent =
  | { type: 'rep_started' }
  | { type: 'rep_completed'; rep: RepResult }
  | { type: 'rep_scored'; rep: RepResult }
  | { type: 'rep_rejected'; reason: 'too_small' | 'too_quick' | 'too_long' }
  | { type: 'set_complete' };

export interface LiveState {
  phase: DetectorPhase;
  /** Seconds since the set started. */
  t: number;
  /** Smoothed primary angle (degrees). */
  angle: number;
  /** 0 = rest, 1 = at the target angle. */
  progress: number;
  /** Where the guide says you should be right now (only while moving). */
  guideProgress?: number;
  /** Current rep as (seconds since rep start, progress) pairs, for the live chart. */
  currentRep: Array<[number, number]>;
  repsDone: number;
  /** True when the camera cannot see the needed joints well. */
  lowConfidence: boolean;
  side?: Side;
}

export interface SetSessionOptions {
  targetReps: number;
  scorer: RepScorer;
  onEvent?: (e: SessionEvent) => void;
  now?: () => number;
}

const MIN_CONFIDENCE = 0.5;
const SIDE_LOCK_FRAMES = 15;

/**
 * Runs one set: feed it pose frames, it counts reps, scores each rep and
 * builds the summary. Platform-free, so it runs the same on web, native
 * and in tests.
 */
export class SetSession {
  private readonly detector: RepDetector;
  private readonly smoothPrimary = new Smoother();
  private readonly smoothLeft = new Smoother();
  private readonly smoothRight = new Smoother();
  private readonly smoothPosture: Smoother[];
  private readonly smoothConf = new Smoother(300);
  private readonly reps: RepResult[] = [];
  private readonly pending: Promise<void>[] = [];
  private readonly startedAt: number;
  private t0: number | undefined;
  private side: Side | undefined;
  private sideVotes: Record<Side, number> = { left: 0, right: 0 };
  private framesSeen = 0;
  private firstRangeDeg: number | undefined;
  private done = false;

  constructor(
    readonly exercise: ExerciseDefinition,
    private readonly opts: SetSessionOptions,
  ) {
    this.detector = new RepDetector(exercise);
    this.smoothPosture = (exercise.posture ?? []).map(() => new Smoother());
    this.startedAt = (opts.now ?? Date.now)();
  }

  get results(): readonly RepResult[] {
    return this.reps;
  }

  push(frame: PoseFrame): LiveState {
    this.t0 ??= frame.timestamp;
    const t = (frame.timestamp - this.t0) / 1000;
    const ex = this.exercise;

    // Pick which side to track: vote for a few frames, then lock.
    if (ex.primary.sides === 'auto' && !this.side) {
      this.sideVotes[bestSide(frame, ex.primary.angle)]++;
      if (++this.framesSeen >= SIDE_LOCK_FRAMES) this.side = this.sideVotes.right > this.sideVotes.left ? 'right' : 'left';
    }
    const side: Side = this.side ?? (this.sideVotes.right > this.sideVotes.left ? 'right' : 'left');

    let angle: number;
    let left: number | undefined;
    let right: number | undefined;
    let conf: number;
    if (ex.primary.sides === 'both') {
      const l = measure(frame, ex.primary.angle, 'left');
      const r = measure(frame, ex.primary.angle, 'right');
      left = this.smoothLeft.push(l.value, frame.timestamp);
      right = this.smoothRight.push(r.value, frame.timestamp);
      angle = this.smoothPrimary.push((l.value + r.value) / 2, frame.timestamp);
      conf = Math.min(l.confidence, r.confidence);
    } else {
      const m = measure(frame, ex.primary.angle, side);
      angle = this.smoothPrimary.push(m.value, frame.timestamp);
      conf = m.confidence;
    }
    const posture = (ex.posture ?? []).map((p, k) => {
      if (ex.primary.sides === 'both') {
        const a = measure(frame, p.angle, 'left').value;
        const b = measure(frame, p.angle, 'right').value;
        return this.smoothPosture[k].push(Math.max(a, b), frame.timestamp);
      }
      return this.smoothPosture[k].push(measure(frame, p.angle, side).value, frame.timestamp);
    });
    const confidence = this.smoothConf.push(conf, frame.timestamp);
    const lowConfidence = confidence < MIN_CONFIDENCE;

    let progress = this.detector.progressOf(angle);
    if (!this.done && !lowConfidence && Number.isFinite(angle)) {
      const sample: Sample = { t, angle, left, right, posture, confidence };
      const r = this.detector.push(sample);
      progress = r.progress;
      if (r.event) this.handle(r.event);
    }

    const repStart = this.detector.repStartT;
    const currentRep: Array<[number, number]> =
      repStart === undefined ? [] : this.detector.currentRep.map((s) => [s.t - repStart, this.detector.progressOf(s.angle)]);
    const guideProgress = repStart === undefined ? undefined : targetProgressAt(ex, t - repStart);

    return {
      phase: this.detector.phase,
      t,
      angle,
      progress,
      guideProgress,
      currentRep,
      repsDone: this.reps.length,
      lowConfidence,
      side: ex.primary.sides === 'both' ? undefined : side,
    };
  }

  private handle(e: ReturnType<RepDetector['push']>['event']) {
    if (!e) return;
    const emit = this.opts.onEvent ?? (() => {});
    if (e.type === 'started') return emit({ type: 'rep_started' });
    if (e.type === 'rejected') return emit({ type: 'rep_rejected', reason: e.reason });

    const shape = repShape(this.exercise, e.samples, e.baseline);
    this.firstRangeDeg ??= shape.rangeDeg;
    const features = computeFeatures(this.exercise, e.samples, e.baseline, { firstRangeDeg: this.firstRangeDeg });
    const rep: RepResult = { index: this.reps.length, features, curve: shape.curve };
    this.reps.push(rep);
    emit({ type: 'rep_completed', rep });

    const p = Promise.resolve(this.opts.scorer.scoreRep({ exercise: this.exercise, features }))
      .then((score) => {
        rep.score = score;
        emit({ type: 'rep_scored', rep });
      })
      .catch(() => {
        // Leave unscored; finish() will report it without a score.
      });
    this.pending.push(p);

    if (this.reps.length >= this.opts.targetReps) {
      this.done = true;
      emit({ type: 'set_complete' });
    }
  }

  /** Waits for any scoring still running and builds the set summary. */
  async finish(): Promise<SetResult> {
    this.done = true;
    await Promise.all(this.pending);
    const scored = this.reps.filter((r) => r.score);
    const setScore = scored.length ? Math.round(scored.reduce((a, r) => a + r.score!.score, 0) / scored.length) : 0;
    const { main, tips } = buildTips(this.exercise, this.reps);
    return {
      exerciseId: this.exercise.id,
      exerciseVersion: this.exercise.version,
      startedAt: this.startedAt,
      endedAt: (this.opts.now ?? Date.now)(),
      targetReps: this.opts.targetReps,
      reps: this.reps,
      setScore,
      mainMistake: main,
      tips,
      scorerId: scored[0]?.score?.source ?? this.opts.scorer.id,
    };
  }
}

/** Turns per-rep mistakes into at most three plain-language tips. */
export function buildTips(ex: ExerciseDefinition, reps: RepResult[]): { main: MistakeId; tips: string[] } {
  if (reps.length === 0) {
    return {
      main: 'good',
      tips: ['No reps were counted. Check that the camera can see your whole body, then try again.'],
    };
  }
  const counts = new Map<MistakeId, number>();
  for (const r of reps) {
    const m = r.score?.mistake;
    if (m && m !== 'good') counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const tips: string[] = [];
  const main: MistakeId = ranked[0] && ranked[0][1] >= Math.max(1, reps.length * 0.25) ? ranked[0][0] : 'good';

  if (main === 'good') tips.push(cueFor(ex, 'good'));
  else tips.push(cueFor(ex, main));
  if (ranked[1] && ranked[1][1] >= 2) tips.push(cueFor(ex, ranked[1][0]));

  if (reps.length >= 6) {
    const avg = (rs: RepResult[]) => rs.reduce((a, r) => a + r.features.range_frac, 0) / rs.length;
    if (avg(reps.slice(-3)) < 0.85 * avg(reps.slice(0, 3))) {
      tips.push('Your last few reps got smaller. Take a short rest before the next set.');
    }
  }
  const conf = reps.reduce((a, r) => a + r.features.confidence, 0) / reps.length;
  if (conf < 0.65) tips.push('The camera was unsure at times. More light or a plainer background helps.');
  return { main, tips: tips.slice(0, 3) };
}

/** Rough expected time for a set, for the plan screen. */
export function estimatedSetSeconds(ex: ExerciseDefinition, reps: number): number {
  return Math.round(reps * (plannedDuration(ex) + 1));
}
