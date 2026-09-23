import {
  type Filter,
  type FilterList,
  StringFilter,
  StringOptionsFilter,
} from "./clickhouse-filter";

// Score columns whose equality / IN predicate an index can prune, letting the
// selective-seek path collect candidate dedup keys without a full-project scan:
//   - id                        → idx_id (bloom_filter)
//   - trace_id / observation_id → idx_project_trace_observation (bloom_filter)
//   - name                      → PRIMARY KEY / ORDER BY (project_id, toDate(timestamp), name)
const SEEK_ELIGIBLE_FIELDS = new Set([
  "id",
  "trace_id",
  "observation_id",
  "name",
]);

/**
 * Is this single top-level AND-conjunct index-prunable for the seek phase?
 *
 * Eligible only for a clean `=` (StringFilter) or `IN` (StringOptionsFilter
 * "any of") on an index-backed column. The `emptyEqualsNull` degradation is
 * rejected: `observation_id = ''` / `IN ('', …)` compiles to
 * `(… OR observation_id IS NULL)` (see StringFilter / StringOptionsFilter
 * apply()), and a bloom filter cannot skip granules across an `OR … IS NULL`.
 *
 * Conjuncts are judged individually, so a non-prunable sibling (e.g.
 * `observation_id IN (…) OR observation_id IS NULL`) does not disqualify a query
 * that also carries a prunable `trace_id = …`.
 */
export const isSeekEligibleFilter = (filter: Filter): boolean => {
  if (filter.clickhouseTable !== "scores") return false;
  if (!SEEK_ELIGIBLE_FIELDS.has(filter.field)) return false;

  if (filter instanceof StringFilter && filter.operator === "=") {
    return !(filter.emptyEqualsNull && filter.value === "");
  }

  if (filter instanceof StringOptionsFilter && filter.operator === "any of") {
    if (filter.values.length === 0) return false;
    return !(filter.emptyEqualsNull && filter.values.includes(""));
  }

  return false;
};

/**
 * The seek path is worthwhile when at least one score-only conjunct is
 * index-prunable. The seek still carries the *entire* score-only predicate
 * (a superset collection); this only decides whether to take the seek path at
 * all versus the single-pass fallback.
 */
export const scoreOnlyFiltersAreSeekEligible = (filters: FilterList): boolean =>
  filters.some(isSeekEligibleFilter);
