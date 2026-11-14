// Fixed-timestep accumulator: turns variable frame times into a whole number
// of simulation steps, so the game plays the same at any display refresh rate.

export class FixedStepper {
  private acc = 0;

  /**
   * @param dt        simulation step, seconds
   * @param maxSteps  most steps to run in one frame; any larger backlog is dropped
   *                  (after a stall the game slows down instead of fast-forwarding)
   */
  constructor(readonly dt: number, readonly maxSteps: number) {}

  /** Forget leftover time, e.g. when a run starts. */
  reset(): void {
    this.acc = 0;
  }

  /** Add a frame's elapsed seconds; returns how many steps to simulate now. */
  advance(elapsed: number): number {
    this.acc += Math.max(0, elapsed);
    // Small epsilon so float drift (e.g. 1/60 accumulated) doesn't lose a step.
    let n = Math.floor(this.acc / this.dt + 1e-9);
    if (n > this.maxSteps) {
      n = this.maxSteps;
      this.acc = 0;
    } else {
      this.acc = Math.max(0, this.acc - n * this.dt);
    }
    return n;
  }
}
