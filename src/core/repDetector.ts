import { direction, plannedRange, type ExerciseDefinition } from './exercise';

/** One processed frame, in seconds since the set started. */
export interface Sample {
  t: number;
  /** Primary angle in degrees (mean of both sides when sides = both). */
  angle: number;
  left?: number;
  right?: number;
  /** One value per exercise.posture entry, degrees. */
  posture: number[];
  confidence: number;
}

export type DetectorPhase = 'waiting' | 'rest' | 'moving';

export type DetectorEvent =
  | { type: 'started' }
  | { type: 'completed'; samples: Sample[]; baseline: number }
  | { type: 'rejected'; reason: 'too_small' | 'too_quick' | 'too_long' };

/**
 * Finds reps in a stream of joint angles.
 *
 * Progress is measured from the person's own resting angle (baseline), in
 * units of the planned range: 0 = at rest, 1 = reached the target angle.
 * A rep starts when progress rises past START, and ends when it falls back
 * below END. Small wobbles never reach START, so they are ignored.
 */
export class RepDetector {
  static readonly START = 0.15;
  static readonly END = 0.1;
  static readonly REST_BAND = 0.06;
  /** Baseline may drift this far (degrees) from the exercise's start angle. */
  static readonly BASELINE_CLAMP = 30;
  static readonly SETTLE_SEC = 0.4;

  phase: DetectorPhase = 'waiting';
  baseline: number;
  private readonly range: number;
  private readonly dir: 1 | -1;
  private settleSince: number | undefined;
  private recent: Sample[] = [];
  private current: Sample[] = [];
  private peak = 0;

  constructor(private readonly ex: ExerciseDefinition) {
    this.baseline = ex.rep.startDeg;
    this.range = plannedRange(ex);
    this.dir = direction(ex);
  }

  progressOf(angle: number): number {
    return (this.dir * (angle - this.baseline)) / this.range;
  }

  /** Samples of the rep in progress (empty when resting). */
  get currentRep(): readonly Sample[] {
    return this.current;
  }

  get repStartT(): number | undefined {
    return this.current[0]?.t;
  }

  push(s: Sample): { progress: number; event?: DetectorEvent } {
    const lo = this.ex.rep.startDeg - RepDetector.BASELINE_CLAMP;
    const hi = this.ex.rep.startDeg + RepDetector.BASELINE_CLAMP;

    if (this.phase === 'waiting') {
      // Wait until the person holds still near the start position.
      const nearStart = Math.abs(s.angle - this.ex.rep.startDeg) <= RepDetector.BASELINE_CLAMP;
      const stillEnough = this.recent.length === 0 || Math.abs(s.angle - this.recent[this.recent.length - 1].angle) < 3;
      if (nearStart && stillEnough) {
        this.settleSince ??= s.t;
        if (s.t - this.settleSince >= RepDetector.SETTLE_SEC) {
          this.baseline = Math.min(hi, Math.max(lo, s.angle));
          this.phase = 'rest';
        }
      } else {
        this.settleSince = undefined;
      }
      this.remember(s);
      return { progress: this.progressOf(s.angle) };
    }

    const p = this.progressOf(s.angle);

    if (this.phase === 'rest') {
      if (p > RepDetector.START) {
        this.phase = 'moving';
        this.peak = p;
        // Back-fill from the last moment the person was still at rest.
        let k = this.recent.length - 1;
        while (k > 0 && this.progressOf(this.recent[k].angle) > RepDetector.REST_BAND) k--;
        this.current = [...this.recent.slice(Math.max(0, k)), s];
        this.recent = [];
        return { progress: p, event: { type: 'started' } };
      }
      if (Math.abs(p) < RepDetector.REST_BAND * 2) {
        // Slowly follow the resting angle so posture changes between reps don't count.
        this.baseline = Math.min(hi, Math.max(lo, this.baseline + 0.05 * (s.angle - this.baseline)));
      }
      this.remember(s);
      return { progress: this.progressOf(s.angle) };
    }

    // moving
    this.current.push(s);
    this.peak = Math.max(this.peak, p);
    const duration = s.t - this.current[0].t;
    if (duration > this.ex.rep.maxDurationSec) {
      this.reset('waiting');
      return { progress: p, event: { type: 'rejected', reason: 'too_long' } };
    }
    if (p < RepDetector.END) {
      const samples = this.current;
      const peak = this.peak;
      this.reset('rest');
      this.remember(s);
      if (peak < this.ex.rep.minRangeFraction) return { progress: p, event: { type: 'rejected', reason: 'too_small' } };
      if (duration < this.ex.rep.minDurationSec) return { progress: p, event: { type: 'rejected', reason: 'too_quick' } };
      return { progress: p, event: { type: 'completed', samples, baseline: this.baseline } };
    }
    return { progress: p };
  }

  private reset(phase: DetectorPhase) {
    this.phase = phase;
    this.current = [];
    this.peak = 0;
    this.settleSince = undefined;
  }

  private remember(s: Sample) {
    this.recent.push(s);
    // Keep about 1.5 s of history for back-filling the start of a rep.
    while (this.recent.length > 2 && s.t - this.recent[0].t > 1.5) this.recent.shift();
  }
}
