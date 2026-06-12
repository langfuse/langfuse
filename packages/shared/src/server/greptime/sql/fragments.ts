/**
 * GreptimeDB rollup SQL fragments (04-read-path.md, P2).
 *
 * The ClickHouse rollup CTEs lean on `sumMap`/`countIf`/`multiIf`/`groupArrayIf`, none of which
 * GreptimeDB has. These builders emit the parts GreptimeDB CAN do natively; the dynamic-key map
 * summation (`sumMap`) is deliberately NOT here — it is done app-side in `repositories/greptime/rollup.ts`
 * over per-row JSON, because GreptimeDB cannot enumerate dynamic JSON keys in SQL.
 *
 * All builders take a table alias prefix and emit unquoted GreptimeDB SQL fragments (the columns
 * involved — level/start_time/end_time/total_cost — are not reserved-word-quoted in the existing
 * read paths; callers compose these into a larger SELECT).
 */

/** Standard usage/cost keys broken out on dashboard time-series (dynamic keys are not enumerable in SQL). */
export const USAGE_COST_KNOWN_KEYS = ["input", "output", "total"] as const;

// Numeric scores encode as `name::value` in the scores-agg array; the value is always numeric, so the
// converter splits on the LAST `::` to recover the name (which may itself contain `:`). Categorical
// scores keep the existing ClickHouse `name:value` convention (split on the first `:`).
export const SCORES_AGG_NUMERIC_SEP = "::";

const ref = (prefix: string | undefined, col: string): string =>
  prefix ? `${prefix}.${col}` : col;

/**
 * Observation trace latency in milliseconds: span from the earliest start to the latest end across
 * the grouped observations. Mirrors CH `date_diff('millisecond', least(min(start),min(end)), greatest(max(start),max(end)))`.
 */
export const greptimeLatencyMs = (prefix?: string): string => {
  const start = ref(prefix, "start_time");
  const end = ref(prefix, "end_time");
  return (
    `CAST((to_unixtime(greatest(max(${end}), max(${start}))) - ` +
    `to_unixtime(least(min(${start}), min(${end})))) * 1000 AS BIGINT)`
  );
};

/** countIf(level = X) per level -> sum(CASE ...). Returns the four aliased aggregates. */
export const greptimeLevelCounts = (prefix?: string): string => {
  const level = ref(prefix, "level");
  const countOf = (lvl: string, alias: string) =>
    `sum(CASE WHEN ${level} = '${lvl}' THEN 1 ELSE 0 END) AS ${alias}`;
  return [
    countOf("ERROR", "error_count"),
    countOf("WARNING", "warning_count"),
    countOf("DEFAULT", "default_count"),
    countOf("DEBUG", "debug_count"),
  ].join(",\n");
};

/**
 * Highest-severity level across the grouped observations, as an integer rank (ERROR=3 .. DEBUG=0).
 * Replaces CH `multiIf(arrayExists(groupArray(level)...))`. Map the rank back to a string app-side
 * via `mapAggregatedLevelRank`.
 */
export const greptimeAggregatedLevelRank = (
  prefix?: string,
  alias = "aggregated_level_rank",
): string => {
  const level = ref(prefix, "level");
  return (
    `max(CASE ${level} ` +
    `WHEN 'ERROR' THEN 3 WHEN 'WARNING' THEN 2 WHEN 'DEFAULT' THEN 1 ELSE 0 END) AS ${alias}`
  );
};

/**
 * SUM of a single known JSON-map key across the group, e.g. `sum(json_get_float(cost_details,'input'))`.
 * Used only on the dashboard time-series path (known-key allowlist); dynamic keys go app-side.
 * GreptimeDB's float JSON accessor is `json_get_float` (there is no `json_get_double`).
 */
export const greptimeKnownKeySum = (
  jsonCol: string,
  key: string,
  prefix: string | undefined,
  alias: string,
): string =>
  `sum(json_get_float(${ref(prefix, jsonCol)}, '${key}')) AS ${alias}`;

/**
 * Scores aggregation CTE body grouped by an entity grain (`trace_id` / `session_id` / `observation_id`).
 *
 * Two-stage: inner averages value per (entity, name, data_type, string_value); outer `array_agg(CASE)`
 * collects NUMERIC/BOOLEAN scores as `name::value` strings (parsed back to {name, avgValue}) and
 * CATEGORICAL scores as `name:string_value` strings. Replaces CH `groupArrayIf(tuple(...))` — strings
 * avoid relying on SQL tuple/struct round-tripping over the MySQL wire. `array_agg(CASE ... END)` yields
 * NULLs for the non-matching branch; the converter (`parseScoresAgg`) drops them.
 *
 * `grainColumn` is the scores column correlating to the entity (verbatim, not user input). `filterSql`
 * (already-compiled, with its binds) and `projectIdParam` scope the inner scan; the inner always adds
 * `is_deleted = false`.
 */
export const greptimeScoresAggCte = (opts: {
  cteName: string;
  grainColumn: "trace_id" | "session_id" | "observation_id";
  projectIdParam: string;
  filterSql?: string;
  timestampFilterSql?: string;
}): string => {
  const {
    cteName,
    grainColumn,
    projectIdParam,
    filterSql,
    timestampFilterSql,
  } = opts;
  const where = [
    `project_id = :${projectIdParam}`,
    "is_deleted = false",
    filterSql,
    timestampFilterSql,
  ]
    .filter(Boolean)
    .join(" AND ");
  return `${cteName} AS (
    SELECT
      project_id,
      ${grainColumn} AS grain_id,
      array_agg(CASE WHEN data_type IN ('NUMERIC', 'BOOLEAN')
        THEN concat(name, '${SCORES_AGG_NUMERIC_SEP}', CAST(avg_value AS STRING)) END) AS scores_avg_raw,
      array_agg(CASE WHEN data_type = 'CATEGORICAL' AND string_value != ''
        THEN concat(name, ':', string_value) END) AS score_categories_raw
    FROM (
      SELECT project_id, ${grainColumn}, name, data_type, string_value, avg(value) AS avg_value
      FROM scores
      WHERE ${where}
      GROUP BY project_id, ${grainColumn}, name, data_type, string_value
    ) inner_scores
    GROUP BY project_id, grain_id
  )`;
};
