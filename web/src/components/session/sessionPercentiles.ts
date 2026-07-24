/**
 * Session-relative latency percentiles for the span rail's turn rows
 * (design handoff v3): each turn is ranked against the session's other
 * turns by REAL wall-clock latency and labelled `pNN`; turns at or above
 * the 90th percentile get the amber "slow" treatment.
 *
 * Midpoint rank formula from the handoff: p = (sortedIndex + 0.5) / n.
 * Turns without a latency datum get null (no label — never fabricated).
 */

export type TurnLatencyPercentile = {
  /** `p6` … `p94` — midpoint percentile of this turn's latency. */
  label: string;
  /** 0..1 fraction backing the label. */
  fraction: number;
  /** At or above the 90th percentile — the amber treatment. */
  isSlow: boolean;
};

export const SLOW_TURN_PERCENTILE_FRACTION = 0.9;

export const computeTurnLatencyPercentiles = (
  latencies: Array<number | null | undefined>,
): Array<TurnLatencyPercentile | null> => {
  const known = latencies
    .filter((value): value is number => value !== null && value !== undefined)
    .sort((a, b) => a - b);
  return latencies.map((latency) => {
    if (latency === null || latency === undefined || known.length === 0)
      return null;
    const fraction = (known.indexOf(latency) + 0.5) / known.length;
    return {
      label: `p${Math.round(fraction * 100)}`,
      fraction,
      isSlow: fraction >= SLOW_TURN_PERCENTILE_FRACTION,
    };
  });
};
