import type { ExerciseDefinition } from '../../core/exercise';
import { ExerciseSimulator, type SimRep } from '../../core/sim/simulator';
import type { PoseFrame } from '../../core/types';
import type { PoseSource } from '../../platform/pose';

/** A demo script with a few typical mistakes mixed in. */
export function demoScript(ex: ExerciseDefinition, reps: number): SimRep[] {
  const base: SimRep[] = ['good', 'good', 'shallow', 'good', 'fast', 'good', 'dropped', 'good', 'posture', 'good', 'jerky', 'good'];
  if (ex.primary.sides === 'both') base.splice(5, 0, 'uneven');
  return Array.from({ length: reps + 1 }, (_, i) => base[i % base.length]);
}

/** Plays the simulator in real time, so the whole app can be tried without a camera. */
export class DemoPoseSource implements PoseSource {
  private running = false;
  private stopped = false;
  constructor(private readonly ex: ExerciseDefinition, private readonly reps: number) {}

  async start(onFrame: (frame: PoseFrame) => void): Promise<void> {
    const sim = new ExerciseSimulator(this.ex, demoScript(this.ex, this.reps), { seed: Date.now() % 1000 });
    if (this.stopped) return;
    this.running = true;
    const t0 = performance.now();
    const loop = () => {
      if (!this.running) return;
      const t = (performance.now() - t0) / 1000;
      const f = sim.frameAt(Math.min(t, sim.totalSec));
      onFrame({ ...f, timestamp: performance.now() });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
  }
}
