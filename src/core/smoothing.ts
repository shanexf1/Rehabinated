/**
 * Exponential smoothing that adapts to frame timing, so results match at
 * 15 fps on an old phone and 60 fps on a new one.
 */
export class Smoother {
  private value: number | undefined;
  private lastT: number | undefined;

  /** @param timeConstantMs larger = smoother but more lag. */
  constructor(private readonly timeConstantMs = 90) {}

  push(v: number, t: number): number {
    if (!Number.isFinite(v)) return this.value ?? v;
    if (this.value === undefined || this.lastT === undefined) {
      this.value = v;
    } else {
      const dt = Math.max(0, t - this.lastT);
      const alpha = 1 - Math.exp(-dt / this.timeConstantMs);
      this.value += alpha * (v - this.value);
    }
    this.lastT = t;
    return this.value;
  }

  reset(): void {
    this.value = undefined;
    this.lastT = undefined;
  }
}
