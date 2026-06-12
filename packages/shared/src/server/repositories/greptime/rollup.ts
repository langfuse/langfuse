import { ObservationLevel, type ObservationLevelType } from "../../../domain";
import { SCORES_AGG_NUMERIC_SEP } from "../../greptime/sql/fragments";

/**
 * App-side rollup reducers for the GreptimeDB read path (04-read-path.md, P2).
 *
 * GreptimeDB cannot enumerate dynamic JSON map keys in SQL, so `sumMap(usage_details)` /
 * `sumMap(cost_details)` are summed here over the per-row JSON the rollup query `array_agg`s for the
 * paginated page. These helpers are pure and unit-tested.
 */

/**
 * Sum a list of usage/cost JSON maps key-by-key, preserving EVERY key (dynamic/custom keys included).
 * This is the faithful `sumMap` replacement — distinct from `reduceUsageOrCostDetails`, which only
 * derives `{input, output, total}` and would drop custom keys.
 */
export const mergeUsageOrCostMaps = (
  maps: Array<Record<string, number> | null | undefined>,
): Record<string, number> => {
  const merged: Record<string, number> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [key, value] of Object.entries(map)) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      merged[key] = (merged[key] ?? 0) + n;
    }
  }
  return merged;
};

const RANK_TO_LEVEL: Record<number, ObservationLevelType> = {
  3: ObservationLevel.ERROR,
  2: ObservationLevel.WARNING,
  1: ObservationLevel.DEFAULT,
  0: ObservationLevel.DEBUG,
};

/** Map the integer severity rank from `greptimeAggregatedLevelRank` back to the level string. */
export const mapAggregatedLevelRank = (
  rank: number | null | undefined,
): ObservationLevelType =>
  RANK_TO_LEVEL[Number(rank ?? 0)] ?? ObservationLevel.DEBUG;

/**
 * Parse the scores-agg arrays emitted by `greptimeScoresAggCte`:
 *   - `scoresAvgRaw`: `name::value` strings (NUMERIC/BOOLEAN) -> `{ name, avg_value }` (split on the LAST `::`).
 *   - `scoreCategoriesRaw`: `name:string_value` strings (CATEGORICAL) -> passed through.
 * `array_agg(CASE ... END)` yields NULLs for the non-matching branch; both are dropped here.
 */
export const parseScoresAgg = (
  scoresAvgRaw: Array<string | null> | null | undefined,
  scoreCategoriesRaw: Array<string | null> | null | undefined,
): {
  scores_avg: Array<{ name: string; avg_value: number }>;
  score_categories: string[];
} => {
  const scores_avg: Array<{ name: string; avg_value: number }> = [];
  for (const entry of scoresAvgRaw ?? []) {
    if (entry == null) continue;
    const sep = entry.lastIndexOf(SCORES_AGG_NUMERIC_SEP);
    if (sep < 0) continue;
    const name = entry.slice(0, sep);
    const avg_value = Number(entry.slice(sep + SCORES_AGG_NUMERIC_SEP.length));
    if (!Number.isFinite(avg_value)) continue;
    scores_avg.push({ name, avg_value });
  }

  const score_categories = (scoreCategoriesRaw ?? []).filter(
    (entry): entry is string => entry != null,
  );

  return { scores_avg, score_categories };
};
