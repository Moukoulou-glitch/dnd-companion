/**
 * A hybrid logical clock: timestamps that sort the same way on every device
 * even when their clocks drift. Format: 13-digit milliseconds, 4-digit
 * counter, device id. Plain string comparison gives the order.
 */
export class HybridClock {
  private last = 0;
  private counter = 0;

  constructor(
    private readonly device: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** A new timestamp later than every one this clock has issued or seen. */
  tick(): string {
    const t = this.now();
    if (t > this.last) {
      this.last = t;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return HybridClock.format(this.last, this.counter, this.device);
  }

  /** Moves the clock past a timestamp received from another device. */
  observe(stamp: string): void {
    const { ms, counter } = HybridClock.parse(stamp);
    if (ms > this.last || (ms === this.last && counter > this.counter)) {
      this.last = ms;
      this.counter = counter;
    }
  }

  static format(ms: number, counter: number, device: string): string {
    return `${String(ms).padStart(13, "0")}-${String(counter).padStart(4, "0")}-${device}`;
  }

  static parse(stamp: string): { ms: number; counter: number; device: string } {
    const [ms, counter, ...device] = stamp.split("-");
    return { ms: Number(ms), counter: Number(counter), device: device.join("-") };
  }
}
