import {
  type ClickhouseFilter,
  type Filter,
  type FilterList,
  StringOptionsFilter,
} from "./clickhouse-filter";

export type ScoreDataRequirement = "filter-only" | "complete";

/**
 * A query may narrow the score source only when scores are used exclusively
 * for filtering. Selecting score arrays/ids or ordering by score aggregates
 * requires the complete source.
 */
export const resolveScoreDataRequirement = ({
  selectsScoreData = false,
  ordersByScoreData = false,
}: {
  selectsScoreData?: boolean;
  ordersByScoreData?: boolean;
}): ScoreDataRequirement =>
  selectsScoreData || ordersByScoreData ? "complete" : "filter-only";

const KEYED_SCORE_AGGREGATE_FIELDS = new Set([
  "scores_avg",
  "score_categories",
  "score_booleans",
]);

const scoreNameForSourcePushdown = (filter: Filter): string | undefined => {
  const field = filter.field.split(".").at(-1);
  if (!field || !KEYED_SCORE_AGGREGATE_FIELDS.has(field)) {
    return undefined;
  }

  const keyedFilter = filter as Filter & { key?: unknown };
  return typeof keyedFilter.key === "string" ? keyedFilter.key : undefined;
};

/**
 * Restricts raw score rows to the names referenced by post-aggregation score
 * filters. The optimization is all-or-nothing: complete-data consumers and
 * unsupported score filters keep the unmodified score source.
 */
export const planScoreFilterPushdown = ({
  filters,
  scoreDataRequirement,
}: {
  filters: FilterList;
  scoreDataRequirement: ScoreDataRequirement;
}): ClickhouseFilter | undefined => {
  if (scoreDataRequirement === "complete") {
    return undefined;
  }

  const scoreNames = new Set<string>();
  let hasUnsupportedScoreFilter = false;

  filters.forEach((filter) => {
    if (filter.clickhouseTable !== "scores") {
      return;
    }

    const scoreName = scoreNameForSourcePushdown(filter);
    if (scoreName === undefined) {
      hasUnsupportedScoreFilter = true;
      return;
    }

    scoreNames.add(scoreName);
  });

  if (hasUnsupportedScoreFilter || scoreNames.size === 0) {
    return undefined;
  }

  return new StringOptionsFilter({
    clickhouseTable: "scores",
    field: "name",
    operator: "any of",
    values: Array.from(scoreNames),
  }).apply();
};
