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
 * Stateless per-index jitter for values that land in ClickHouse ORDER BY
 * keys (e.g. event start_time). Unlike Rng, the result depends only on
 * (seed, index) — not on how much of the rng stream earlier code consumed —
 * so changing unrelated flags (payload size, observation count) does not
 * re-key existing rows on re-run.
 */
export const jitter = (seed: number, index: number, max: number): number => {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x % (max + 1);
};

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

  /** integer in [min, max] inclusive; callers must ensure min <= max —
   * an inverted range would yield values ABOVE max */
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
