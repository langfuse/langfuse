import { useCallback, useMemo } from "react";
import { ArrayParam, useQueryParams, withDefault } from "use-query-params";
import {
  decodeScoreComparisonFilter,
  encodeScoreComparisonFilter,
  isSameScoreComparisonTarget,
  type ScoreComparisonFilter,
} from "@/src/features/experiments/fns/scoreComparisonFilter";

/**
 * "Show only the items this run scored worse on than <comparison>" — Annabell's
 * top ask, as a filter rather than a report. (LFE-15711 C7)
 *
 * The predicate is about a *pair* of experiments, which the items query cannot
 * express: `compileExperimentFilter` translates each condition into a
 * `column op literal` WHERE clause on a single experiment's rows, so comparing
 * one experiment's score against another's for the same item would need a new
 * HAVING path over the `experiment_item_id` group — new query machinery we are
 * explicitly not building. So the comparison is evaluated in the client over the
 * items already fetched for the current page, and the UI says so. Everything
 * else about it behaves like a filter: it lives in the URL, it is shareable, it
 * survives a reload, and it shows as a removable chip.
 *
 * One filter per score column: picking an operator on a column replaces that
 * column's filter instead of stacking a second one.
 */
export const useScoreComparisonFilters = () => {
  const [state, setState] = useQueryParams({
    scoreCompare: withDefault(ArrayParam, []),
  });

  const filters = useMemo(
    () =>
      ((state.scoreCompare as (string | null)[] | undefined) ?? [])
        .map(decodeScoreComparisonFilter)
        .filter(Boolean) as ScoreComparisonFilter[],
    [state.scoreCompare],
  );

  const write = useCallback(
    (next: ScoreComparisonFilter[]) =>
      setState({
        scoreCompare: next.length
          ? next.map(encodeScoreComparisonFilter)
          : undefined,
      }),
    [setState],
  );

  const setFilter = useCallback(
    (filter: ScoreComparisonFilter) =>
      write([
        ...filters.filter(
          (existing) => !isSameScoreComparisonTarget(existing, filter),
        ),
        filter,
      ]),
    [filters, write],
  );

  const removeFilter = useCallback(
    (filter: ScoreComparisonFilter) =>
      write(
        filters.filter(
          (existing) => !isSameScoreComparisonTarget(existing, filter),
        ),
      ),
    [filters, write],
  );

  const clearFilters = useCallback(() => write([]), [write]);

  return { filters, setFilter, removeFilter, clearFilters };
};
