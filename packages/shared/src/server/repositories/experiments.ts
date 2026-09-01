import { matchesUiColumnMapping } from "../../tableDefinitions";
import { env } from "../../env";
import { type ScoreSourceType } from "../../domain";
import { type OrderByState } from "../../interfaces/orderBy";
import { type FilterState } from "../../types";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  FilterList,
  StringOptionsFilter,
  orderByToClickhouseSql,
  CTEQueryBuilder,
  CTEWithSchema,
  EventsAggQueryBuilder,
  StringFilter,
  extractTimeFilter,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  buildScoreRowsCTE,
  buildScoresCTE,
  eventsExperimentsRootSpans,
  eventsExperimentsForItems,
  eventsExperiments,
  eventsExperimentsAggregation,
  eventsTracesScoresAggregation,
  scoreBooleansAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "../repositories/clickhouse";
import { experimentItemsTableNativeUiColumnDefinitions } from "../tableMappings/mapExperimentItemsTable";
import {
  experimentPreAggCols,
  experimentScoreAggCols,
  experimentOrderByCols,
} from "../tableMappings/mapExperimentTable";

import {
  toAgnosticScoreFilterOptions,
  type AgnosticScoreFilterOptions,
  type ProcessedScoreFilterOptions,
  type ScoreColumnDefinition,
} from "./experimentScoreOptions";

export {
  toAgnosticScoreFilterOptions,
  type AgnosticScoreFilterOptions,
  type ScoreColumnDefinition,
  type ScoreNameLevels,
} from "./experimentScoreOptions";

export type ExperimentEventsDataReturnType = {
  experiment_id: string;
  experiment_name: string;
  experiment_description: string | null;
  experiment_dataset_id: string;
  start_time: string;
  item_count: number;
  error_count: number;
  prompts: Array<[string, number | null]>; // List of unique (prompt_name, prompt_version) tuples
  experiment_metadata: Record<string, string>; // Experiment metadata as key-value map
};

export type ExperimentMetricsReturnType = {
  experiment_id: string;
  total_cost: number | null;
  latency_avg: number | null;
};

type DatasetExperimentMetricsReturnType = {
  experiment_dataset_id: string;
  count_dataset_runs: string;
  last_run_at: string;
};

export const getDatasetExperimentMetricsFromEvents = async (props: {
  projectId: string;
  datasetIds: string[];
}) => {
  if (props.datasetIds.length === 0) {
    return [];
  }

  const experimentsQuery = eventsExperimentsAggregation({
    projectId: props.projectId,
    fieldSet: "count",
  })
    .selectRaw(
      "nullIf(any(e.experiment_dataset_id), '') AS experiment_dataset_id",
      "min(e.start_time) AS start_time",
    )
    .whereRaw("e.experiment_dataset_id IN ({datasetIds: Array(String)})", {
      datasetIds: props.datasetIds,
    })
    .buildWithParams();

  const rows = await queryClickhouse<DatasetExperimentMetricsReturnType>({
    query: `
      SELECT
        experiment_dataset_id,
        count() AS count_dataset_runs,
        max(start_time) AS last_run_at
      FROM (${experimentsQuery.query}) experiments
      GROUP BY experiment_dataset_id
    `,
    params: experimentsQuery.params,
    tags: { projectId: props.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  return rows.map((row) => ({
    datasetId: row.experiment_dataset_id,
    countDatasetRuns: Number(row.count_dataset_runs),
    lastRunAt: parseClickhouseUTCDateTimeFormat(row.last_run_at),
  }));
};

/**
 * One experiment-score CTE, aggregated into the arrays the score filters read
 * as a HAVING.
 *
 * `level: "any"` is the level-agnostic mode: a score matches whether it was
 * recorded on an observation or on the trace, which is what users mean by
 * "groundedness is low" — they neither know nor care which level carried it.
 *
 * The level stays in the inner GROUP BY so the arrays hold ONE ENTRY PER
 * (name, level). That is load-bearing twice over, because the filters compile
 * to array-existence checks:
 *   - a comparison matches if EITHER level satisfies it (the OR semantics),
 *     where a merged average would instead test the mean of two different
 *     measurements;
 *   - an exclusion matches only when NO entry does, which is "at neither
 *     level" — De Morgan, without composing two predicates.
 */
const experimentScoreCTE = (params: {
  projectId: string;
  startTimeFrom?: string | null;
  level: "observation" | "trace" | "any";
  eventKeysCTE: CTEWithSchema;
  filters: FilterList;
}) => {
  // The agnostic arrays carry the canonical column names the level-agnostic
  // filters target; the trace-only mode keeps its prefix so legacy
  // `trace_*` filters still resolve against a trace-only aggregate.
  const prefix =
    params.level === "any"
      ? ""
      : params.level === "observation"
        ? "obs_"
        : "trace_";

  const joinedEventScores = new CTEQueryBuilder()
    .withCTE("event_keys", {
      ...params.eventKeysCTE,
    })
    .withCTE("unit_scores", {
      ...buildScoresCTE({
        projectId: params.projectId,
        startTimeFrom: params.startTimeFrom,
        level: params.level,
      }),
    })
    .from("event_keys", "ek")
    .innerJoin(
      "unit_scores",
      "us",
      "ON us.project_id = ek.project_id AND us.trace_id = ek.trace_id",
    )
    .select(
      "ek.project_id AS project_id",
      "ek.experiment_id AS experiment_id",
      "us.name AS name",
      "us.data_type AS data_type",
      "us.string_value AS string_value",
      "avg(us.avg_value) AS exp_avg",
    )
    .groupBy(
      "ek.project_id",
      "ek.experiment_id",
      "us.name",
      "us.data_type",
      "us.string_value",
      // The level discriminator — see the header. Grouped but not selected: the
      // tuples only need to be distinct per level, not to name it.
      "us.observation_id IS NULL",
    )
    .buildWithParams();

  return new CTEQueryBuilder()
    .withCTE("exp_scores", {
      ...joinedEventScores,
      schema: [
        "project_id",
        "experiment_id",
        "name",
        "data_type",
        "string_value",
        "exp_avg",
      ],
    })
    .from("exp_scores", "s")
    .select(
      "s.project_id AS project_id",
      "s.experiment_id AS experiment_id",
      `groupArrayIf(tuple(s.name, s.exp_avg, s.data_type, s.string_value), s.data_type IN ('NUMERIC', 'BOOLEAN')) AS ${prefix}scores_avg`,
      `groupArrayIf(concat(s.name, ':', s.string_value), s.data_type = 'CATEGORICAL' AND notEmpty(s.string_value)) AS ${prefix}score_categories`,
      `${scoreBooleansAggregation("s.")} AS ${prefix}score_booleans`,
    )
    .groupBy("s.project_id", "s.experiment_id")
    .having(params.filters.apply())
    .buildWithParams();
};

/**
 * Per-item score arrays that span BOTH levels: scores recorded on the item's
 * root span and scores recorded on its trace. Keyed by the root span id, which
 * is unique per (experiment, item) - so a join on it scopes to one experiment's
 * run of that item without any experiment predicate of its own.
 *
 * The level is kept in the inner GROUP BY, giving one array entry per
 * (name, level). Score filters compile to array-existence checks, so a positive
 * filter then matches at either level and its negation means "at neither" - the
 * same trick the runs aggregate uses.
 */
const experimentItemScoreCTE = (params: {
  projectId: string;
  startTimeFrom?: string | null;
  itemRootsCTE: CTEWithSchema;
}) => {
  const joinedItemScores = new CTEQueryBuilder()
    .withCTE("item_roots", {
      ...params.itemRootsCTE,
    })
    .withCTE("unit_scores", {
      ...buildScoresCTE({
        projectId: params.projectId,
        startTimeFrom: params.startTimeFrom,
        level: "any",
      }),
    })
    .from("item_roots", "ir")
    .innerJoin(
      "unit_scores",
      "us",
      // Observation-level scores count only when they sit on the item's ROOT
      // span (the pre-existing scope); trace-level ones carry no observation.
      "ON us.project_id = ir.project_id AND us.trace_id = ir.trace_id AND (us.observation_id = ir.root_span_id OR us.observation_id IS NULL)",
    )
    .select(
      "ir.project_id AS project_id",
      "ir.root_span_id AS root_span_id",
      "us.name AS name",
      "us.data_type AS data_type",
      "us.string_value AS string_value",
      "avg(us.avg_value) AS item_avg",
    )
    .groupBy(
      "ir.project_id",
      "ir.root_span_id",
      "us.name",
      "us.data_type",
      "us.string_value",
      // The level discriminator - see the header. Grouped but not selected: the
      // tuples only need to be distinct per level, not to name it.
      "us.observation_id IS NULL",
    )
    .buildWithParams();

  return new CTEQueryBuilder()
    .withCTE("item_scores", {
      ...joinedItemScores,
      schema: [
        "project_id",
        "root_span_id",
        "name",
        "data_type",
        "string_value",
        "item_avg",
      ],
    })
    .from("item_scores", "sc")
    .select(
      "sc.project_id AS project_id",
      "sc.root_span_id AS root_span_id",
      "groupArrayIf(tuple(sc.name, sc.item_avg, sc.data_type, sc.string_value), sc.data_type IN ('NUMERIC', 'BOOLEAN')) AS scores_avg",
      "groupArrayIf(concat(sc.name, ':', sc.string_value), sc.data_type = 'CATEGORICAL' AND notEmpty(sc.string_value)) AS score_categories",
      `${scoreBooleansAggregation("sc.")} AS score_booleans`,
    )
    .groupBy("sc.project_id", "sc.root_span_id")
    .buildWithParams();
};

export const getExperimentsCountFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows = await getExperimentsFromEventsGeneric<{ count: string }>({
    select: "count",
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    page: props.page,
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

export const getExperimentsFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows =
    await getExperimentsFromEventsGeneric<ExperimentEventsDataReturnType>({
      select: "rows",
      projectId: props.projectId,
      filter: props.filter,
      orderBy: props.orderBy,
      limit: props.limit,
      page: props.page,
    });

  return rows.map((row) => ({
    id: row.experiment_id,
    name: row.experiment_name,
    description: row.experiment_description,
    datasetId: row.experiment_dataset_id,
    itemCount: Number(row.item_count),
    errorCount: Number(row.error_count),
    prompts: row.prompts || [],
    metadata: row.experiment_metadata || {},
    startTime: parseClickhouseUTCDateTimeFormat(row.start_time),
  }));
};

export const getExperimentMetricsFromEvents = async (props: {
  projectId: string;
  experimentIds: string[];
}) => {
  if (props.experimentIds.length === 0) {
    return [];
  }

  // Use eventsExperimentsAggregation with "metrics" field set for simplified aggregation
  const queryBuilder = eventsExperimentsAggregation({
    projectId: props.projectId,
    fieldSet: "metrics",
    experimentIds: props.experimentIds,
  });

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<ExperimentMetricsReturnType>({
    query,
    params,
    tags: { projectId: props.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  return res.map((row) => ({
    id: row.experiment_id,
    totalCost: row.total_cost !== null ? Number(row.total_cost) : null,
    latencyAvg: row.latency_avg !== null ? Number(row.latency_avg) : null,
  }));
};

export type FetchExperimentsFromEventsProps = {
  select: "count" | "rows";
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  tags?: Record<string, string>;
};

const getExperimentsFromEventsGeneric = async <T>(
  props: FetchExperimentsFromEventsProps,
) => {
  const { select, projectId, filter, orderBy, limit, page } = props;

  // Split filters into pre-aggregation and post-aggregation
  const preAggFilterState = filter.filter((f) =>
    experimentPreAggCols.some((col) => col.uiTableId === f.column),
  );
  // Alias-aware: the legacy `obs_*` ids reach the agnostic columns as aliases,
  // and matching only on uiTableId would drop them on the floor (this partition
  // silently discards anything it does not recognise).
  const scoreAggFilterState = filter.filter((f) =>
    experimentScoreAggCols.some((col) => matchesUiColumnMapping(col, f.column)),
  );

  const preAggFilters = new FilterList(
    createFilterFromFilterState(preAggFilterState, experimentPreAggCols),
  );
  const scoreAggFilters = new FilterList(
    createFilterFromFilterState(scoreAggFilterState, experimentScoreAggCols),
  );

  // Extract experiment IDs for optimization
  const experimentIdFilter = preAggFilters.find(
    (f) => f instanceof StringOptionsFilter && f.field === "e.experiment_id",
  ) as StringOptionsFilter | undefined;

  // Extract time filter for score CTEs
  const startTimeFrom = extractTimeFilter(
    preAggFilters,
    "events_proto",
    "start_time",
    "e",
  );

  // Detect score filter presence to conditionally include score CTEs
  const hasTraceScoreFilter = scoreAggFilters.some((f) =>
    [
      "trace_scores_avg",
      "trace_score_categories",
      "trace_score_booleans",
    ].includes(f.field),
  );
  const hasAgnosticScoreFilter = scoreAggFilters.some((f) =>
    ["scores_avg", "score_categories", "score_booleans"].includes(f.field),
  );

  const experimentIds = experimentIdFilter?.values;

  const eventKeys = eventsExperiments({ projectId })
    .applyFilters(preAggFilters)
    .selectRaw("e.project_id", "e.experiment_id", "e.trace_id")
    .limitBy("e.project_id", "e.experiment_id", "e.trace_id")
    .buildWithParams();

  const queryBuilder = eventsExperimentsAggregation({
    projectId,
    fieldSet: select === "count" ? "count" : "base",
    startTimeFrom,
    experimentIds,
  })
    .applyFilters(preAggFilters)
    .when(hasAgnosticScoreFilter, (b) => {
      return b
        .withCTE(
          "matching_agnostic_experiments",
          experimentScoreCTE({
            projectId,
            startTimeFrom,
            eventKeysCTE: {
              ...eventKeys,
              schema: ["project_id", "experiment_id", "trace_id"],
            },
            filters: scoreAggFilters.filter((f) =>
              ["scores_avg", "score_categories", "score_booleans"].includes(
                f.field,
              ),
            ),
            level: "any",
          }),
        )
        .innerJoin(
          "matching_agnostic_experiments AS mae",
          "ON mae.project_id = e.project_id AND mae.experiment_id = e.experiment_id",
        );
    })
    .when(hasTraceScoreFilter, (b) => {
      return b
        .withCTE(
          "matching_ts_experiments",
          experimentScoreCTE({
            projectId,
            startTimeFrom,
            eventKeysCTE: {
              ...eventKeys,
              schema: ["project_id", "experiment_id", "trace_id"],
            },
            filters: scoreAggFilters.filter((f) =>
              [
                "trace_scores_avg",
                "trace_score_categories",
                "trace_score_booleans",
              ].includes(f.field),
            ),
            level: "trace",
          }),
        )
        .innerJoin(
          "matching_ts_experiments AS mte",
          "ON mte.project_id = e.project_id AND mte.experiment_id = e.experiment_id",
        );
    });

  // Apply ordering
  const orderBySql = orderByToClickhouseSql(
    orderBy ?? null,
    experimentOrderByCols,
  );
  if (orderBySql) {
    queryBuilder.orderBy(orderBySql);
  }

  // Apply pagination
  if (limit !== undefined && page !== undefined) {
    queryBuilder.limit(limit, limit * page);
  }

  const built = queryBuilder.buildWithParams();

  const finalQuery =
    select === "count"
      ? `SELECT count() AS count FROM (${built.query}) matched_experiments`
      : built.query;

  const finalParams = built.params;

  return queryClickhouse<T>({
    query: finalQuery,
    params: finalParams,
    tags: { ...(props.tags ?? {}), projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
};

// ============================================================================
// Experiment Items Queries
// ============================================================================

/**
 * Return type for experiment item rows from ClickHouse.
 */
export type ExperimentItemEventsDataReturnType = {
  item_id: string;
  experiment_id: string;
  level: string;
  start_time: string;
  total_cost: number | null;
  latency_ms: number | null;
  observation_id: string;
  trace_id: string;
};

/**
 * Data for a single experiment within an item.
 */
export type ExperimentItemData = {
  experimentId: string;
  level: string;
  startTime: Date;
  totalCost: number | null;
  latencyMs: number | null;
  observationId: string;
  traceId: string;
};

/**
 * Grouped experiment item with data from all experiments.
 */
export type GroupedExperimentItem = {
  itemId: string;
  experiments: ExperimentItemData[];
};

/**
 * Return type for experiment item metrics from ClickHouse.
 */
export type ExperimentItemMetricsReturnType = {
  experiment_item_id: string;
  trace_id: string;
  total_cost: number | null;
  latency_milliseconds: number | null;
};

type ExperimentItemInput = {
  projectId: string;
  compExperimentIds: string[];
  filterByExperiment: {
    experimentId: string;
    filters: FilterState;
  }[];
  baseExperimentId?: string;
  config?: {
    /**
     * Whether to require the baseline experiment to be present in the results.
     * If true, the results will only include items that are present in the baseline experiment.
     * If false, the results will include items that are present in the baseline experiment OR any comparison experiment.
     * If not provided, defaults to false.
     */
    requireBaselinePresence?: boolean;
  };
};

/**
 * Get experiment items count for pagination with intersection filtering.
 * Counts items that match the intersection criteria across experiments.
 */
export const getExperimentItemsCountFromEvents = async (
  props: ExperimentItemInput,
): Promise<number> => {
  const { projectId, config } = props;

  const qualifiedItems = getExperimentItemsFromEventsGeneric({
    ...props,
    config,
    select: "count",
  });

  const queryBuilder = new CTEQueryBuilder()
    .withCTE("qualified_items", {
      ...qualifiedItems,
      schema: ["item_id"],
    })
    .from("qualified_items", "qi")
    .select("count() AS count");

  const { query, params } = queryBuilder.buildWithParams();

  const rows = await queryClickhouse<{ count: string }>({
    query,
    params,
    tags: { projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

type ExperimentItemsFilterOptionsInput = {
  projectId: string;
  experimentIds: string[];
};

type ExperimentScoreOptionsInput = ExperimentItemsFilterOptionsInput;

// Whitelist of score data types to include
const ALLOWED_SCORE_DATA_TYPES = ["NUMERIC", "CATEGORICAL", "BOOLEAN"] as const;
type ExperimentChartableScoreDataType =
  (typeof ALLOWED_SCORE_DATA_TYPES)[number];

type ScoreFilterOptionsRow = {
  name: string;
  source: ScoreSourceType;
  data_type: ExperimentChartableScoreDataType;
  values: string[];
};

const SCORE_FILTER_OPTIONS_LIMIT = 1000;
const SCORE_CATEGORICAL_VALUE_LIMIT = 20;

/**
 * Build query for experiment-run-level scores (scores with dataset_run_id matching experiment IDs).
 * These are scores directly attached to the experiment/dataset run, not to traces or observations.
 */
const buildExperimentRunScoreFilterOptionsQuery = (params: {
  projectId: string;
  experimentIds: string[];
}): { query: string; params: Record<string, unknown> } => {
  const { projectId, experimentIds } = params;

  // Simple query on scores table filtering by dataset_run_id
  const query = `
    SELECT
      name AS name,
      source AS source,
      data_type AS data_type,
      groupUniqArrayIf(${SCORE_CATEGORICAL_VALUE_LIMIT})(string_value, data_type = 'CATEGORICAL' AND notEmpty(string_value)) AS values
    FROM scores
    WHERE project_id = {projectId: String}
      AND dataset_run_id IN ({experimentIds: Array(String)})
      AND data_type IN ({allowedDataTypes: Array(String)})
    GROUP BY name, data_type, source
    ORDER BY name ASC
    LIMIT ${SCORE_FILTER_OPTIONS_LIMIT}
  `;

  return {
    query,
    params: {
      projectId,
      experimentIds,
      allowedDataTypes: ALLOWED_SCORE_DATA_TYPES,
    },
  };
};

const buildScoreFilterOptionsQuery = (params: {
  projectId: string;
  experimentIds: string[];
  level: "observation" | "trace";
}): { query: string; params: Record<string, unknown> } => {
  const { projectId, experimentIds, level } = params;

  // Build experiment events CTE using existing fragment
  const experimentEventsCTE = eventsExperimentsRootSpans({
    projectId,
    experimentIds,
  })
    .selectRaw("e.project_id", "e.trace_id", "e.span_id")
    .limitBy("e.project_id", "e.trace_id", "e.span_id")
    .buildWithParams();

  // Build unaggregated score rows so the experiment join happens before grouping
  const scoreRowsCTE = buildScoreRowsCTE({
    projectId,
    level,
  });

  // Build the join condition based on level
  const joinCondition =
    level === "trace"
      ? "ON s.project_id = ee.project_id AND s.trace_id = ee.trace_id"
      : "ON s.project_id = ee.project_id AND s.trace_id = ee.trace_id AND s.observation_id = ee.span_id";

  // Compose the full query using CTEQueryBuilder
  // Excludes CORRECTION scores by whitelisting allowed data types
  const queryBuilder = new CTEQueryBuilder()
    .withCTE("experiment_events", {
      ...experimentEventsCTE,
      schema: ["project_id", "trace_id", "span_id"],
    })
    .withCTE("score_rows", scoreRowsCTE)
    .from("score_rows", "s")
    .innerJoin("experiment_events", "ee", joinCondition)
    .select(
      "s.name AS name",
      "s.data_type AS data_type",
      "s.source AS source",
      `groupUniqArrayIf(${SCORE_CATEGORICAL_VALUE_LIMIT})(s.string_value, s.data_type = 'CATEGORICAL' AND notEmpty(s.string_value)) AS values`,
    )
    .groupBy("s.name", "s.data_type", "s.source")
    .orderBy("ORDER BY s.name ASC")
    .limit(SCORE_FILTER_OPTIONS_LIMIT);

  return queryBuilder.buildWithParams();
};

const processScoreFilterOptionsResults = (
  rows: ScoreFilterOptionsRow[],
): ProcessedScoreFilterOptions => {
  const numeric = new Set<string>();
  const boolean = new Set<string>();
  const categorical = new Map<string, Set<string>>();
  const scoreColumns: ScoreColumnDefinition[] = [];

  for (const row of rows) {
    // Always add to scoreColumns (unique by name+source+data_type combination)
    scoreColumns.push({
      name: row.name,
      dataType: row.data_type as "NUMERIC" | "BOOLEAN" | "CATEGORICAL",
      source: row.source,
    });

    if (row.data_type === "NUMERIC" || row.data_type === "BOOLEAN") {
      numeric.add(row.name);
    }
    if (row.data_type === "BOOLEAN") {
      boolean.add(row.name);
    } else if (row.data_type === "CATEGORICAL") {
      const existingValues = categorical.get(row.name) ?? new Set<string>();
      row.values.forEach((value) => existingValues.add(value));
      categorical.set(row.name, existingValues);
    }
  }

  return {
    numeric: Array.from(numeric),
    boolean: Array.from(boolean),
    categorical: Array.from(categorical.entries()).map(([label, values]) => ({
      label,
      values: Array.from(values),
    })),
    scoreColumns,
  };
};

const emptyScoreFilterOptions = (): ProcessedScoreFilterOptions => ({
  numeric: [],
  boolean: [],
  categorical: [],
  scoreColumns: [],
});

type ExperimentItemScoreOptionsByLevel = {
  observation: ProcessedScoreFilterOptions;
  trace: ProcessedScoreFilterOptions;
};

type ExperimentScoreOptionsByLevel = {
  observation: ProcessedScoreFilterOptions;
  trace: ProcessedScoreFilterOptions;
  experiment: ProcessedScoreFilterOptions;
};

const getExperimentItemScoreOptionsByLevel = async ({
  projectId,
  experimentIds,
}: ExperimentItemsFilterOptionsInput): Promise<ExperimentItemScoreOptionsByLevel> => {
  const uniqueExperimentIds = Array.from(new Set(experimentIds));

  if (uniqueExperimentIds.length === 0) {
    return {
      observation: emptyScoreFilterOptions(),
      trace: emptyScoreFilterOptions(),
    };
  }

  const traceQuery = buildScoreFilterOptionsQuery({
    projectId,
    experimentIds: uniqueExperimentIds,
    level: "trace",
  });

  const obsQuery = buildScoreFilterOptionsQuery({
    projectId,
    experimentIds: uniqueExperimentIds,
    level: "observation",
  });

  const [traceResults, obsResults] = await Promise.all([
    queryClickhouse<ScoreFilterOptionsRow>({
      query: traceQuery.query,
      params: traceQuery.params,
      tags: { projectId },
      preferredClickhouseService: "ReadOnly",
    }),
    queryClickhouse<ScoreFilterOptionsRow>({
      query: obsQuery.query,
      params: obsQuery.params,
      tags: { projectId },
      preferredClickhouseService: "ReadOnly",
    }),
  ]);

  return {
    observation: processScoreFilterOptionsResults(obsResults),
    trace: processScoreFilterOptionsResults(traceResults),
  };
};

export const getExperimentItemsFilterOptions = async (
  props: ExperimentItemsFilterOptionsInput,
): Promise<
  AgnosticScoreFilterOptions & {
    obs_scores_avg: string[];
    obs_score_categories: Array<{ label: string; values: string[] }>;
    obs_score_booleans: string[];
    obs_score_columns: ScoreColumnDefinition[];
    trace_scores_avg: string[];
    trace_score_categories: Array<{ label: string; values: string[] }>;
    trace_score_booleans: string[];
    trace_score_columns: ScoreColumnDefinition[];
  }
> => {
  const { observation, trace } =
    await getExperimentItemScoreOptionsByLevel(props);

  return {
    obs_scores_avg: observation.numeric,
    obs_score_categories: observation.categorical,
    obs_score_booleans: observation.boolean,
    obs_score_columns: observation.scoreColumns,
    trace_scores_avg: trace.numeric,
    trace_score_categories: trace.categorical,
    trace_score_booleans: trace.boolean,
    trace_score_columns: trace.scoreColumns,
    ...toAgnosticScoreFilterOptions(observation, trace),
  };
};

const getExperimentScoreOptionsByLevel = async ({
  projectId,
  experimentIds,
}: ExperimentScoreOptionsInput): Promise<ExperimentScoreOptionsByLevel> => {
  const uniqueExperimentIds = Array.from(new Set(experimentIds));

  if (uniqueExperimentIds.length === 0) {
    return {
      observation: emptyScoreFilterOptions(),
      trace: emptyScoreFilterOptions(),
      experiment: emptyScoreFilterOptions(),
    };
  }

  const obsQuery = buildScoreFilterOptionsQuery({
    projectId,
    experimentIds: uniqueExperimentIds,
    level: "observation",
  });

  // Trace-level names are half of what the level-agnostic facets offer; without
  // this a score recorded on the trace was never even suggested.
  const traceQuery = buildScoreFilterOptionsQuery({
    projectId,
    experimentIds: uniqueExperimentIds,
    level: "trace",
  });

  const runQuery = buildExperimentRunScoreFilterOptionsQuery({
    projectId,
    experimentIds: uniqueExperimentIds,
  });

  const [obsResults, traceResults, runResults] = await Promise.all([
    queryClickhouse<ScoreFilterOptionsRow>({
      query: obsQuery.query,
      params: obsQuery.params,
      tags: { projectId },
      preferredClickhouseService: "ReadOnly",
    }),
    queryClickhouse<ScoreFilterOptionsRow>({
      query: traceQuery.query,
      params: traceQuery.params,
      tags: { projectId },
      preferredClickhouseService: "ReadOnly",
    }),
    queryClickhouse<ScoreFilterOptionsRow>({
      query: runQuery.query,
      params: runQuery.params,
      tags: { projectId },
      preferredClickhouseService: "ReadOnly",
    }),
  ]);

  return {
    observation: processScoreFilterOptionsResults(obsResults),
    trace: processScoreFilterOptionsResults(traceResults),
    experiment: processScoreFilterOptionsResults(runResults),
  };
};

export const getExperimentScoreOptions = async (
  props: ExperimentScoreOptionsInput,
): Promise<
  AgnosticScoreFilterOptions & {
    obs_scores_avg: string[];
    obs_score_categories: Array<{ label: string; values: string[] }>;
    obs_score_columns: ScoreColumnDefinition[];
    trace_scores_avg: string[];
    trace_score_categories: Array<{ label: string; values: string[] }>;
    trace_score_columns: ScoreColumnDefinition[];
    experiment_scores_avg: string[];
    experiment_score_categories: Array<{ label: string; values: string[] }>;
    experiment_score_columns: ScoreColumnDefinition[];
  }
> => {
  const { observation, trace, experiment } =
    await getExperimentScoreOptionsByLevel(props);

  return {
    // Per-level stays the SOURCE: the run charts select a metric per level,
    // because a merged identity cannot say which level's series to plot.
    obs_scores_avg: observation.numeric,
    obs_score_categories: observation.categorical,
    obs_score_columns: observation.scoreColumns,
    trace_scores_avg: trace.numeric,
    trace_score_categories: trace.categorical,
    trace_score_columns: trace.scoreColumns,
    // …and the agnostic projection is what the score FACETS offer.
    ...toAgnosticScoreFilterOptions(observation, trace),
    // Experiment-level scores grade the RUN, not an item, so they stay their own
    // thing rather than being folded into the item-score filters.
    experiment_scores_avg: experiment.numeric,
    experiment_score_categories: experiment.categorical,
    experiment_score_columns: experiment.scoreColumns,
  };
};

type FilterByExperiment = {
  experimentId: string;
  filters: FilterState;
};

type BuildQualificationPlanInput = {
  compExperimentIds: string[];
  filterByExperiment: FilterByExperiment[];
  baseExperimentId?: string;
  config?: {
    requireBaselinePresence?: boolean;
  };
};

type QualificationPlan = {
  where: { query: string; params: Record<string, any> };
  having: { query: string; params: Record<string, any> } | null;
  orderBy: string | null;
  hasAgnosticScoreFilters: boolean;
  hasTraceScoreFilters: boolean;
};

function combineConditions(
  conditions: { query: string; params: Record<string, any> }[],
  operator: "AND" | "OR" = "OR",
): { query: string; params: Record<string, any> } {
  const valid = conditions.filter((c) => c.query.trim().length > 0);
  if (valid.length === 0) return { query: "", params: {} };

  return {
    query: `(${valid.map((c) => `(${c.query})`).join(` ${operator} `)})`,
    params: Object.assign({}, ...valid.map((c) => c.params ?? {})),
  };
}

function compileExperimentFilter(params: {
  experimentId: string;
  filterState: FilterState;
}): { query: string; params: Record<string, any> } {
  // 1) force experiment constraint
  const experimentFilter = new StringFilter({
    clickhouseTable: "events_proto",
    field: "e.experiment_id",
    operator: "=",
    value: params.experimentId,
  });

  // 2) translate UI filters to CH filters with existing mapping
  const translated = createFilterFromFilterState(
    params.filterState,
    experimentItemsTableNativeUiColumnDefinitions,
  );

  // 3) compile as AND
  const compiled = new FilterList([experimentFilter, ...translated]).apply();

  return {
    query: compiled.query,
    params: compiled.params ?? {},
  };
}

/**
 * Build filter conditions for the qualification query.
 * Returns OR conditions and params for each experiment that needs filtering.
 */
const buildQualificationPlan = (
  params: BuildQualificationPlanInput,
): QualificationPlan => {
  const { baseExperimentId, compExperimentIds, filterByExperiment, config } =
    params;

  const { requireBaselinePresence = false } = config ?? {};
  const isBaselineEnforced =
    requireBaselinePresence && Boolean(baseExperimentId);

  // Map experimentId -> filters for quick lookup
  const filtersByExperiment = new Map(
    filterByExperiment.map((f) => [f.experimentId, f.filters]),
  );

  const filteredCompExperimentIds = compExperimentIds.filter((expId) => {
    const hasFilters = (filtersByExperiment.get(expId) ?? []).length > 0;
    return hasFilters;
  });

  const filters = filterByExperiment.flatMap((f) => f.filters);
  // The canonical ids and their `obs_*` aliases both resolve to the
  // level-agnostic aggregate, so both mount the same CTE.
  const hasAgnosticScoreFilters = filters.some((f) =>
    [
      "scores_avg",
      "score_categories",
      "score_booleans",
      "obs_scores_avg",
      "obs_score_categories",
      "obs_score_booleans",
    ].includes(f.column),
  );
  const hasTraceScoreFilters = filters.some((f) =>
    [
      "trace_scores_avg",
      "trace_score_categories",
      "trace_score_booleans",
    ].includes(f.column),
  );

  const allExperimentIds = [
    ...(baseExperimentId ? [baseExperimentId] : []),
    ...compExperimentIds,
  ];

  const compiledFiltersByExperiment = allExperimentIds.map((experimentId) =>
    compileExperimentFilter({
      experimentId,
      filterState: filtersByExperiment.get(experimentId) ?? [],
    }),
  );

  return {
    where: combineConditions(compiledFiltersByExperiment, "OR"),
    having: isBaselineEnforced
      ? filteredCompExperimentIds.length > 0
        ? {
            query: `
          countIf(e.experiment_id = {baseExperimentId: String}) > 0
          AND countIf(e.experiment_id IN ({filteredCompExperimentIds: Array(String)})) > 0
        `,
            params: {
              baseExperimentId,
              filteredCompExperimentIds,
            },
          }
        : {
            query: `countIf(e.experiment_id = {baseExperimentId: String}) > 0`,
            params: {
              baseExperimentId,
            },
          }
      : null,
    orderBy: `ORDER BY e.experiment_item_id ASC`,
    hasAgnosticScoreFilters,
    hasTraceScoreFilters,
  };
};

const getExperimentItemsFromEventsGeneric = (params: {
  select: "count" | "rows";
  projectId: string;
  baseExperimentId?: string;
  compExperimentIds: string[];
  filterByExperiment: {
    experimentId: string;
    filters: FilterState;
  }[];
  config?: {
    requireBaselinePresence?: boolean;
  };
  limit?: number;
  offset?: number;
}) => {
  const {
    select,
    projectId,
    baseExperimentId,
    compExperimentIds,
    filterByExperiment,
    config,
    limit,
    offset,
  } = params;

  const {
    where,
    having,
    orderBy,
    hasAgnosticScoreFilters,
    hasTraceScoreFilters,
  } = buildQualificationPlan({
    baseExperimentId,
    compExperimentIds,
    filterByExperiment,
    config,
  });

  // The item roots the agnostic score aggregate is keyed by. Scoped to the
  // experiments in play so the CTE never scans the whole project.
  const itemRoots = eventsExperimentsRootSpans({
    projectId,
    experimentIds: [
      ...(baseExperimentId ? [baseExperimentId] : []),
      ...compExperimentIds,
    ],
  })
    .selectRaw("e.project_id", "e.span_id AS root_span_id", "e.trace_id")
    .limitBy("e.project_id", "e.span_id")
    .buildWithParams();

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.experiment_item_id",
    // min(start_time) is the item's root start_time (WHERE below restricts
    // to root rows), used as a coarse partition-prune lower bound for Query 2.
    selectExpression:
      "e.experiment_item_id as item_id, min(e.start_time) as start_time",
  })
    .whereRaw("e.span_id = e.experiment_item_root_span_id")
    .when(hasAgnosticScoreFilters, (b) =>
      b.withCTE(
        "item_scores_agg",
        experimentItemScoreCTE({
          projectId,
          itemRootsCTE: {
            ...itemRoots,
            schema: ["project_id", "root_span_id", "trace_id"],
          },
        }),
      ),
    )
    .when(hasAgnosticScoreFilters, (b) =>
      b.leftJoin(
        "item_scores_agg AS ias",
        "ON ias.project_id = e.project_id AND ias.root_span_id = e.span_id",
      ),
    )
    .when(hasTraceScoreFilters, (b) =>
      b.withCTE(
        "trace_scores_agg",
        // Optionally add timestamp >= oldest_selected_experiment_start as a coarse partition prune
        eventsTracesScoresAggregation({
          projectId,
          hasScoreAggregationFilters: true,
        }),
      ),
    )
    .when(hasTraceScoreFilters, (b) =>
      b.leftJoin(
        "trace_scores_agg AS ts",
        "ON ts.trace_id = e.trace_id AND ts.project_id = e.project_id",
      ),
    )
    .where(where)
    .when(having !== null, (b) => b.having(having!));

  if (select === "rows") {
    queryBuilder
      .when(orderBy !== null, (b) => b.orderBy(orderBy!))
      .limit(limit ?? 50, offset ?? 0);
  }

  return queryBuilder.buildWithParams();
};

/**
 * Get experiment items with intersection filtering across experiments.
 * Returns items grouped by item_id with data from ALL experiments.
 *
 * Query 1: Get filtered item_ids using intersection logic
 * Query 2: Fetch data for those items across ALL experiments
 */
export const getExperimentItemsFromEvents = async (
  props: ExperimentItemInput & {
    limit?: number;
    offset?: number;
  },
): Promise<GroupedExperimentItem[]> => {
  const {
    projectId,
    baseExperimentId,
    compExperimentIds,
    filterByExperiment,
    limit,
    offset,
    config,
  } = props;

  // ========== QUERY 1: Get filtered item_ids using intersection logic ==========
  const { query: itemIdsQuery, params: itemIdsParams } =
    getExperimentItemsFromEventsGeneric({
      select: "rows",
      projectId,
      baseExperimentId,
      compExperimentIds,
      filterByExperiment,
      config,
      limit,
      offset,
    });

  const itemIdsResult = await queryClickhouse<{
    item_id: string;
    start_time: string;
  }>({
    query: itemIdsQuery,
    params: itemIdsParams,
    tags: { projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  const itemIds = itemIdsResult.map((r) => r.item_id);

  if (itemIds.length === 0) {
    return [];
  }

  const allExperimentIds = [
    ...(baseExperimentId ? [baseExperimentId] : []),
    ...compExperimentIds,
  ];

  // Earliest root start_time among the qualified items - a coarse partition
  // prune for Query 2. Children always start at or after their own root, so
  // this bound can't exclude a legitimate descendant.
  const minStartTime = new Date(
    Math.min(
      ...itemIdsResult.map((r) =>
        parseClickhouseUTCDateTimeFormat(r.start_time).getTime(),
      ),
    ),
  );

  // ========== QUERY 2: Fetch data for ALL experiments ==========
  // total_cost is summed across the item's full observation subtree via a
  // window function - the root span itself usually carries no cost of its
  // own, so reading e.total_cost directly would just return 0. WHERE only
  // scopes to project/experiment/item; root-row selection happens in
  // ORDER BY/LIMIT BY below, so the window function still sees sibling rows.
  // The partition includes trace_id so items with multiple repetitions
  // (until we model them properly, LFE-8965) sum only the selected
  // iteration's own subtree, not every repetition's cost combined.
  const queryBuilderData = eventsExperimentsForItems({
    projectId,
    experimentItemIds: itemIds,
    experimentIds: allExperimentIds,
  })
    .whereRaw("e.start_time >= {itemsMinStartTime: DateTime64(3)}", {
      itemsMinStartTime: convertDateToClickhouseDateTime(minStartTime),
    })
    .selectRaw(
      "e.experiment_item_id as item_id",
      "e.experiment_id as experiment_id",
      "e.level as level",
      "e.start_time as start_time",
      "sum(e.total_cost) OVER (PARTITION BY e.experiment_item_id, e.experiment_id, e.trace_id) as total_cost",
      "if(isNull(e.end_time), NULL, date_diff('millisecond', e.start_time, e.end_time)) as latency_ms",
      "e.span_id as observation_id",
      "e.trace_id as trace_id",
    )
    // We must deterministically return the latest row for each experiment_item_id, experiment_id pair until we model repetitions (LFE-8965).
    // Uses raw orderBy() rather than orderByColumns(), which auto-prepends a
    // toStartOfMinute(start_time) primary-key-read-order prefix whenever a
    // start_time entry is present - that prefix would outrank the root-flag
    // tiebreak below whenever a child observation starts in a later minute
    // bucket than its root, causing LIMIT BY to keep the child row instead.
    .orderBy(
      "ORDER BY (e.span_id = e.experiment_item_root_span_id) DESC, e.start_time DESC",
    )
    .limitBy("e.experiment_item_id, e.experiment_id");

  const { query: dataQuery, params: dataParams } =
    queryBuilderData.buildWithParams();

  const rows = await queryClickhouse<ExperimentItemEventsDataReturnType>({
    query: dataQuery,
    params: dataParams,
    tags: { projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  // Group by item_id, preserving pagination order
  const itemMap = new Map<string, ExperimentItemData[]>();
  for (const row of rows) {
    const data: ExperimentItemData = {
      experimentId: row.experiment_id,
      level: row.level,
      startTime: parseClickhouseUTCDateTimeFormat(row.start_time),
      totalCost: row.total_cost !== null ? Number(row.total_cost) : null,
      latencyMs: row.latency_ms !== null ? Number(row.latency_ms) : null,
      observationId: row.observation_id,
      traceId: row.trace_id,
    };
    if (!itemMap.has(row.item_id)) {
      itemMap.set(row.item_id, []);
    }
    itemMap.get(row.item_id)!.push(data);
  }

  // Return in pagination order from itemIds
  return itemIds.map((itemId) => ({
    itemId,
    experiments: itemMap.get(itemId) ?? [],
  }));
};

// ============================================================================
// Batch IO Queries
// ============================================================================

const IO_TRUNCATE_LENGTH = 1000;

/**
 * Output data for a single experiment.
 */
export type ExperimentOutputData = {
  experimentId: string;
  output: string | null;
};

/**
 * Batch IO data for an experiment item.
 */
export type ExperimentItemBatchIO = {
  itemId: string;
  input: string | null; // From base experiment only
  expectedOutput: string | null; // From base experiment only
  outputs: ExperimentOutputData[]; // From ALL experiments
};

/**
 * Get batch IO data for experiment items.
 * Returns input/expectedOutput from base experiment, and output from all experiments.
 * All text fields are truncated to IO_TRUNCATE_LENGTH characters.
 */
export const getExperimentItemsBatchIO = async (props: {
  projectId: string;
  itemIds: string[];
  baseExperimentId?: string;
  compExperimentIds: string[];
}): Promise<ExperimentItemBatchIO[]> => {
  const { projectId, itemIds, baseExperimentId, compExperimentIds } = props;

  if (itemIds.length === 0) {
    return [];
  }

  const allExperimentIds = [
    ...(baseExperimentId ? [baseExperimentId] : []),
    ...compExperimentIds,
  ];

  const queryBuilder = eventsExperimentsRootSpans({
    projectId,
    experimentIds: allExperimentIds,
    experimentItemIds: itemIds,
  })
    .selectIO(true, env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT)
    .selectRaw(
      "leftUTF8(e.experiment_item_expected_output, {truncateLength: UInt32}) as expected_output",
      "e.experiment_item_id as item_id",
      "e.experiment_id as experiment_id",
    )
    // We must deterministically return the latest row for each experiment_item_id, experiment_id pair until we model repetitions (LFE-8965)
    .orderByColumns([{ column: "e.start_time", direction: "DESC" }])
    .limitBy("e.experiment_item_id, e.experiment_id");

  const { query, params } = queryBuilder.buildWithParams();

  const rows = await queryClickhouse<{
    item_id: string;
    experiment_id: string;
    input: string | null;
    output: string | null;
    expected_output: string | null;
  }>({
    query,
    params: {
      ...params,
      truncateLength: IO_TRUNCATE_LENGTH,
    },
    tags: { projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  // Group by item_id
  // Extract input/expectedOutput from base experiment row
  // Collect outputs from all rows
  const itemMap = new Map<
    string,
    {
      input: string | null;
      expectedOutput: string | null;
      outputs: ExperimentOutputData[];
    }
  >();

  for (const row of rows) {
    if (!itemMap.has(row.item_id)) {
      itemMap.set(row.item_id, {
        input: null,
        expectedOutput: null,
        outputs: [],
      });
    }

    const item = itemMap.get(row.item_id)!;
    const isBaseline =
      baseExperimentId && row.experiment_id === baseExperimentId;

    // Use baseline value if available, otherwise first non-null
    if (row.input !== null && (isBaseline || item.input === null)) {
      item.input = row.input;
    }
    if (
      row.expected_output !== null &&
      (isBaseline || item.expectedOutput === null)
    ) {
      item.expectedOutput = row.expected_output;
    }

    // Collect output from all experiments
    item.outputs.push({
      experimentId: row.experiment_id,
      output: row.output,
    });
  }

  // Return in the same order as itemIds
  return itemIds.map((itemId) => {
    const item = itemMap.get(itemId);
    return {
      itemId,
      input: item?.input ?? null,
      expectedOutput: item?.expectedOutput ?? null,
      outputs: item?.outputs ?? [],
    };
  });
};

export const getExperimentNamesFromEvents = async (props: {
  projectId: string;
}) => {
  const queryBuilder = new EventsAggQueryBuilder({
    projectId: props.projectId,
    groupByColumn: "e.experiment_id",
    selectExpression:
      "any(e.experiment_name) as experimentName, e.experiment_id as experimentId, nullIf(any(e.experiment_dataset_id), '') as datasetId",
  })
    .whereRaw("e.experiment_name IS NOT NULL AND length(e.experiment_name) > 0")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{
    experimentName: string;
    experimentId: string;
    datasetId: string | null;
  }>({
    query,
    params,
    tags: { projectId: props.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  return res;
};
