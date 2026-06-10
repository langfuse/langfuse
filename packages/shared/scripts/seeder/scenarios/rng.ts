/**
 * Midnight UTC of the current day. Scenario timestamps anchor here (instead
 * of Date.now()) so same-day re-runs produce identical ORDER BY tuples and
 * ReplacingMergeTree overwrites instead of duplicating — events_full sorts
 * on microsecond start_time, v3 tables on toDate(timestamp). Data still
 * lands inside recent UI time windows; a re-run on a later day writes a
 * fresh dated copy.
 */
export const utcDayStartMs = (): number =>
  Math.floor(Date.now() / 86_400_000) * 86_400_000;

/**
 * Deterministic PRNG (mulberry32) so scenarios produce identical data for
 * identical --seed values. Never use Math.random in scenario code.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** float in [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }
}
