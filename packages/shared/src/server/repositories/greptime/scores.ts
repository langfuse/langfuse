import { prisma } from "../../../db";
import {
  type ScoreDataTypeType,
  type ScoreDomain,
  type ScoreSourceType,
  type ListableScoreDataType,
  AGGREGATABLE_SCORE_TYPES,
  LISTABLE_SCORE_TYPES,
  ScoreDataTypeEnum,
} from "../../../domain/scores";
import { InternalServerError } from "../../../errors";
import {
  type FilterState,
  type FilterCondition,
  type TimeFilter,
} from "../../../types";
import { type OrderByState } from "../../../interfaces/orderBy";
import { scoresTableCols } from "../../../tableDefinitions/scoresTable";
import { greptimeQuery } from "../../greptime/client";
import { recordDistribution } from "../../instrumentation";
import { parseMetadataCHRecordToDomain } from "../../utils/metadata_conversion";
import {
  FilterList,
  StringFilter,
  StringOptionsFilter,
  DateTimeFilter,
  NumberFilter,
} from "../../greptime/sql/greptime-filter";
import { createGreptimeFilterFromFilterState } from "../../greptime/sql/factory";
import { type FilterList as ChFilterList } from "../../queries";
import { translateChFilterList } from "./translateChFilter";
import type { ListFilterParams, ScoresCursorV3Type } from "../scores";
import {
  scoresTableGreptimeColumnDefinitions,
  type GreptimeColumnMappings,
} from "../../greptime/sql/columnMappings";
import { greptimeOrderBySql } from "../../greptime/sql/orderby";
import {
  greptimeBool,
  greptimeJson,
  selectJsonColumn,
} from "../../greptime/sql/rowContract";
import {
  convertGreptimeScoreRowToDomain,
  greptimeScoreSelect,
} from "./converters";
import {
  convertScoreAggregation,
  type ScoreAggregation,
} from "../scores_converters";
import { greptimeInClause, greptimeTsParam, notDeleted } from "./queryHelpers";

/**
 * GreptimeDB core score reads (04-read-path.md, P1). Plain SELECT on the merged projection
 * (drop FINAL / LIMIT 1 BY), `is_deleted = false`, JSON-aware SELECT lists.
 *
 * Deferred to later phases (these throw via "column not found" if their filters are sent): the
 * events-CTE variants (`*FromEvents`), the dataset-run-items / experiment joins, and the public-API
 * v3 list. The grouping helpers port their plain scores path only.
 */

type Row = Record<string, unknown>;

/**
 * scores-native filter columns for the grouping helpers. The dataset-run-item columns
 * (`datasetRunItemRunIds` / `datasetId` / `datasetItemIds`) are resolved through a reverse correlated
 * EXISTS over `dataset_run_items` (CH joined `scores ⋈ dataset_run_items_rmt` by trace_id) — see
 * `mapScoresColumnsTable` and `DatasetRunItemsOptionsFilter`.
 */
const scoresColumnsGreptimeColumnDefinitions: GreptimeColumnMappings = [
  { uiTableName: "Timestamp", uiTableId: "timestamp", greptimeTableName: "scores", greptimeSelect: "timestamp", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Session ID", uiTableId: "sessionId", greptimeTableName: "scores", greptimeSelect: "session_id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Dataset Run IDs", uiTableId: "datasetRunIds", greptimeTableName: "scores", greptimeSelect: "dataset_run_id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Observation ID", uiTableId: "observationId", greptimeTableName: "scores", greptimeSelect: "observation_id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Trace ID", uiTableId: "traceId", greptimeTableName: "scores", greptimeSelect: "trace_id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Dataset Run Item Run IDs", uiTableId: "datasetRunItemRunIds", greptimeTableName: "scores", greptimeSelect: "trace_id", queryPrefix: "s", datasetRunItemsGrain: { driColumn: "dataset_run_id", outerPrefix: "s" } }, // prettier-ignore
  { uiTableName: "Dataset ID", uiTableId: "datasetId", greptimeTableName: "scores", greptimeSelect: "trace_id", queryPrefix: "s", datasetRunItemsGrain: { driColumn: "dataset_id", outerPrefix: "s" } }, // prettier-ignore
  { uiTableName: "Dataset Item IDs", uiTableId: "datasetItemIds", greptimeTableName: "scores", greptimeSelect: "trace_id", queryPrefix: "s", datasetRunItemsGrain: { driColumn: "dataset_item_id", outerPrefix: "s" } }, // prettier-ignore
];

const inList = (column: string, values: readonly string[], prefix: string) =>
  greptimeInClause(column, values, prefix);

/**
 * Legacy CH `SCORE_TO_TRACE_OBSERVATIONS_INTERVAL` (1 HOUR). A trace/observation timestamp is only a
 * scan lower bound for its scores; a score can land slightly before its parent's timestamp, so the
 * bound is relaxed by this slack to avoid dropping near-boundary scores (mirrors the CH path and the
 * dashboards reader).
 */
const SCORE_TO_TRACE_OBSERVATIONS_INTERVAL_MS = 60 * 60 * 1000;

/** `has_metadata` (length(mapKeys(metadata)) > 0 in CH) computed from the JSON column. */
const HAS_METADATA_EXPR =
  "(json_to_string(s.`metadata`) IS NOT NULL AND json_to_string(s.`metadata`) != '{}' AND json_to_string(s.`metadata`) != '') AS has_metadata";

const scoreListSelect = (
  excludeMetadata: boolean,
  includeHasMetadata: boolean,
) =>
  greptimeScoreSelect({ prefix: "s", excludeMetadata }) +
  (includeHasMetadata ? `, ${HAS_METADATA_EXPR}` : "");

// ---------------------------------------------------------------------------
// by id
// ---------------------------------------------------------------------------

export const _handleGetScoreById = async ({
  projectId,
  scoreId,
  source,
  scoreScope,
  scoreDataTypes,
}: {
  projectId: string;
  scoreId: string;
  source?: ScoreSourceType;
  scoreScope: "traces_only" | "all";
  scoreDataTypes?: readonly ScoreDataTypeType[];
}): Promise<ScoreDomain | undefined> => {
  const dt = scoreDataTypes
    ? inList("s.data_type", scoreDataTypes as string[], "dt")
    : null;
  const rows = await greptimeQuery<Row>({
    query: `
      SELECT ${greptimeScoreSelect({ prefix: "s" })}
      FROM scores s
      WHERE s.project_id = :projectId AND s.id = :scoreId
        ${dt ? `AND ${dt.sql}` : ""}
        ${source ? "AND s.source = :source" : ""}
        ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
        AND ${notDeleted("s")}
      LIMIT 1`,
    params: {
      projectId,
      scoreId,
      ...(source ? { source } : {}),
      ...(dt ? dt.params : {}),
    },
    readOnly: true,
  });
  return rows.map((r) => convertGreptimeScoreRowToDomain(r)).shift();
};

export const _handleGetScoresByIds = async ({
  projectId,
  scoreId,
  source,
  scoreScope,
  dataTypes,
}: {
  projectId: string;
  scoreId: string[];
  source?: ScoreSourceType;
  scoreScope: "traces_only" | "all";
  dataTypes?: readonly ScoreDataTypeType[];
}): Promise<ScoreDomain[]> => {
  if (scoreId.length === 0) return [];
  const idList = inList("s.id", scoreId, "sid");
  const dt = dataTypes
    ? inList("s.data_type", dataTypes as string[], "dt")
    : null;
  const rows = await greptimeQuery<Row>({
    query: `
      SELECT ${greptimeScoreSelect({ prefix: "s" })}
      FROM scores s
      WHERE s.project_id = :projectId AND ${idList.sql}
        ${source ? "AND s.source = :source" : ""}
        ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
        ${dt ? `AND ${dt.sql}` : ""}
        AND ${notDeleted("s")}`,
    params: {
      projectId,
      ...idList.params,
      ...(source ? { source } : {}),
      ...(dt ? dt.params : {}),
    },
    readOnly: true,
  });
  return rows.map((r) => convertGreptimeScoreRowToDomain(r));
};

export const getScoreById = ({
  projectId,
  scoreId,
  source,
}: {
  projectId: string;
  scoreId: string;
  source?: ScoreSourceType;
}): Promise<ScoreDomain | undefined> =>
  _handleGetScoreById({ projectId, scoreId, source, scoreScope: "all" });

export const getScoresByIds = (
  projectId: string,
  scoreId: string[],
  source?: ScoreSourceType,
): Promise<ScoreDomain[]> =>
  _handleGetScoresByIds({
    projectId,
    scoreId,
    source,
    scoreScope: "all",
    dataTypes: LISTABLE_SCORE_TYPES,
  });

export const searchExistingAnnotationScore = async (
  projectId: string,
  observationId: string | null,
  traceId: string | null,
  sessionId: string | null,
  name: string | undefined,
  configId: string | undefined,
  dataType: ScoreDataTypeType,
) => {
  if (!name && !configId) {
    throw new Error("Either name or configId (or both) must be provided.");
  }
  const rows = await greptimeQuery<Row>({
    query: `
      SELECT ${greptimeScoreSelect({ prefix: "s" })}
      FROM scores s
      WHERE s.project_id = :projectId
        AND s.source = 'ANNOTATION'
        AND s.data_type = :dataType
        ${traceId ? "AND s.trace_id = :traceId" : "AND s.trace_id IS NULL"}
        ${observationId ? "AND s.observation_id = :observationId" : "AND s.observation_id IS NULL"}
        ${sessionId ? "AND s.session_id = :sessionId" : "AND s.session_id IS NULL"}
        AND (FALSE ${name ? "OR s.name = :name" : ""} ${configId ? "OR s.config_id = :configId" : ""})
        AND ${notDeleted("s")}
      LIMIT 1`,
    params: {
      projectId,
      dataType,
      ...(traceId ? { traceId } : {}),
      ...(observationId ? { observationId } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(name ? { name } : {}),
      ...(configId ? { configId } : {}),
    },
    readOnly: true,
  });
  return rows.map((r) => convertGreptimeScoreRowToDomain(r)).shift();
};

// ---------------------------------------------------------------------------
// list by foreign key
// ---------------------------------------------------------------------------

type ListProps = {
  projectId: string;
  limit?: number;
  offset?: number;
  excludeMetadata?: boolean;
  includeHasMetadata?: boolean;
};

const paginate = (limit?: number, offset?: number) =>
  limit !== undefined && offset !== undefined
    ? `LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    : "";

/**
 * Deterministic pagination for the score-list readers. The merged projection has no implicit row
 * order, so LIMIT/OFFSET without an ORDER BY can return different rows per page. Order by recency
 * (newest first, id as a stable tiebreak) before paginating. `timestamp`/`id` are reserved words,
 * hence the backtick-quoted column segment.
 */
const paginateOrdered = (prefix: string, limit?: number, offset?: number) =>
  limit !== undefined && offset !== undefined
    ? `ORDER BY ${prefix}.\`timestamp\` DESC, ${prefix}.\`id\` LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    : "";

const mapScoreRows = (
  rows: Row[],
  excludeMetadata: boolean,
  includeHasMetadata: boolean,
): ScoreDomain[] =>
  rows.map((row) => {
    const score = convertGreptimeScoreRowToDomain(row, !excludeMetadata);
    if (includeHasMetadata) {
      Object.assign(score, { hasMetadata: greptimeBool(row.has_metadata) });
    }
    return score;
  });

export const getScoresForSessions = async (
  props: ListProps & { sessionIds: string[] },
) => {
  const {
    projectId,
    sessionIds,
    limit,
    offset,
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;
  if (sessionIds.length === 0) return [];
  const ids = inList("s.session_id", sessionIds, "sess");
  const dt = inList("s.data_type", LISTABLE_SCORE_TYPES, "dt");
  const rows = await greptimeQuery<Row>({
    query: `
      SELECT ${scoreListSelect(excludeMetadata, includeHasMetadata)}
      FROM scores s
      WHERE s.project_id = :projectId AND ${ids.sql} AND ${dt.sql} AND ${notDeleted("s")}
      ${paginateOrdered("s", limit, offset)}`,
    params: { projectId, ...ids.params, ...dt.params },
    readOnly: true,
  });
  return mapScoreRows(rows, excludeMetadata, includeHasMetadata);
};

export const getScoresForExperiments = async (
  props: ListProps & { runIds: string[] },
) => {
  const {
    projectId,
    runIds,
    limit,
    offset,
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;
  if (runIds.length === 0) return [];
  const ids = inList("s.dataset_run_id", runIds, "run");
  const dt = inList("s.data_type", AGGREGATABLE_SCORE_TYPES, "dt");
  const rows = await greptimeQuery<Row>({
    query: `
      SELECT ${scoreListSelect(excludeMetadata, includeHasMetadata)}
      FROM scores s
      WHERE s.project_id = :projectId AND ${ids.sql} AND ${dt.sql} AND ${notDeleted("s")}
      ${paginateOrdered("s", limit, offset)}`,
    params: { projectId, ...ids.params, ...dt.params },
    readOnly: true,
  });
  return mapScoreRows(rows, excludeMetadata, includeHasMetadata);
};

/**
 * Scores correlated to dataset runs / experiments through `dataset_run_items` by `trace_id`. The CH
 * version joins `dataset_run_items_rmt ⋈ scores FINAL` and dedups with `LIMIT 1 BY (s.id, run_id)`.
 * In GreptimeDB the scores projection is already merged (one row per id), so we only need to collapse
 * the DRI physical fan-out: a `DISTINCT (project_id, trace_id, dataset_run_id)` key set (mirrors
 * `fetchRunScores`) joined to scores yields exactly one row per (score, run). `groupKey` names the
 * extra field carried back to the caller (`datasetRunId` for runs, `experimentId` for experiments —
 * experiment_id == dataset_run_id). Metadata payload is excluded; only `hasMetadata` is computed.
 */
const getScoresJoinedByDatasetRun = async <K extends string>(
  projectId: string,
  runIds: string[],
  groupKey: K,
): Promise<
  Array<ScoreDomain & { hasMetadata: boolean } & Record<K, string>>
> => {
  if (runIds.length === 0) return [];
  const ids = inList("dataset_run_id", runIds, "run");
  const dt = inList("s.data_type", AGGREGATABLE_SCORE_TYPES, "dt");
  const rows = await greptimeQuery<Row>({
    query: `
      WITH dri_keys AS (
        SELECT DISTINCT project_id, trace_id, dataset_run_id
        FROM dataset_run_items
        WHERE project_id = :projectId AND ${ids.sql} AND ${notDeleted()}
      )
      SELECT ${scoreListSelect(true, true)}, d.dataset_run_id AS group_run_id
      FROM dri_keys d
      JOIN scores s ON s.project_id = d.project_id AND s.trace_id = d.trace_id AND ${notDeleted("s")}
      WHERE ${dt.sql}`,
    params: { projectId, ...ids.params, ...dt.params },
    readOnly: true,
  });
  return rows.map((row) => {
    const score = convertGreptimeScoreRowToDomain(row, false);
    return {
      ...score,
      [groupKey]: String(row.group_run_id),
      hasMetadata: greptimeBool(row.has_metadata),
    } as ScoreDomain & { hasMetadata: boolean } & Record<K, string>;
  });
};

export const getTraceScoresForDatasetRuns = (
  projectId: string,
  datasetRunIds: string[],
) => getScoresJoinedByDatasetRun(projectId, datasetRunIds, "datasetRunId");

export const getScoresForExperimentItems = (
  projectId: string,
  experimentIds: string[],
) => getScoresJoinedByDatasetRun(projectId, experimentIds, "experimentId");

export const getScoresForObservations = async (
  props: ListProps & { observationIds: string[]; minTimestamp?: Date },
) => {
  const {
    projectId,
    observationIds,
    minTimestamp,
    limit,
    offset,
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;
  if (observationIds.length === 0) return [];
  const ids = inList("s.observation_id", observationIds, "obs");
  const dt = inList("s.data_type", LISTABLE_SCORE_TYPES, "dt");
  const rows = await greptimeQuery<Row>({
    query: `
      SELECT ${scoreListSelect(excludeMetadata, includeHasMetadata)}
      FROM scores s
      WHERE s.project_id = :projectId AND ${ids.sql} AND ${dt.sql}
        ${minTimestamp ? "AND s.timestamp >= :minTs" : ""}
        AND ${notDeleted("s")}
      ${paginateOrdered("s", limit, offset)}`,
    params: {
      projectId,
      ...ids.params,
      ...dt.params,
      ...(minTimestamp
        ? {
            minTs: greptimeTsParam(
              new Date(
                minTimestamp.getTime() -
                  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL_MS,
              ),
            ),
          }
        : {}),
    },
    readOnly: true,
  });
  return mapScoreRows(rows, excludeMetadata, includeHasMetadata);
};

const getScoresForTracesInternal = async (
  props: ListProps & {
    traceIds: string[];
    level?: "trace" | "observation" | "all";
    timestamp?: Date;
    dataTypes?: readonly ScoreDataTypeType[];
  },
) => {
  const {
    projectId,
    traceIds,
    level = "all",
    timestamp,
    dataTypes,
    limit,
    offset,
    excludeMetadata = false,
    includeHasMetadata = false,
  } = props;
  if (traceIds.length === 0) return [];
  const ids = inList("s.trace_id", traceIds, "trc");
  const dt = dataTypes
    ? inList("s.data_type", dataTypes as string[], "dt")
    : null;
  const levelFilter =
    level === "trace"
      ? "AND s.observation_id IS NULL"
      : level === "observation"
        ? "AND s.observation_id IS NOT NULL"
        : "";
  const rows = await greptimeQuery<Row>({
    query: `
      SELECT ${scoreListSelect(excludeMetadata, includeHasMetadata)}
      FROM scores s
      WHERE s.project_id = :projectId AND ${ids.sql}
        ${dt ? `AND ${dt.sql}` : ""}
        ${timestamp ? "AND s.timestamp >= :traceTs" : ""}
        ${levelFilter}
        AND ${notDeleted("s")}
      ${paginateOrdered("s", limit, offset)}`,
    params: {
      projectId,
      ...ids.params,
      ...(dt ? dt.params : {}),
      ...(timestamp
        ? {
            traceTs: greptimeTsParam(
              new Date(
                timestamp.getTime() - SCORE_TO_TRACE_OBSERVATIONS_INTERVAL_MS,
              ),
            ),
          }
        : {}),
    },
    readOnly: true,
  });
  const mapped = mapScoreRows(rows, excludeMetadata, includeHasMetadata);
  mapped.forEach((score) =>
    recordDistribution(
      "langfuse.query_by_id_age",
      new Date().getTime() - score.timestamp.getTime(),
      { table: "scores" },
    ),
  );
  return mapped;
};

export const getScoresForTraces = (
  props: ListProps & {
    traceIds: string[];
    level?: "trace" | "observation" | "all";
    timestamp?: Date;
  },
) => getScoresForTracesInternal({ ...props, dataTypes: LISTABLE_SCORE_TYPES });

export const getScoresAndCorrectionsForTraces = (
  props: ListProps & {
    traceIds: string[];
    level?: "trace" | "observation" | "all";
    timestamp?: Date;
  },
) => getScoresForTracesInternal({ ...props });

// ---------------------------------------------------------------------------
// groupings (filter-option helpers) — plain scores path
// ---------------------------------------------------------------------------

const applyScoresColumnsFilter = (filter: FilterState) =>
  new FilterList(
    createGreptimeFilterFromFilterState(
      filter,
      scoresColumnsGreptimeColumnDefinitions,
      scoresTableCols,
    ),
  ).apply();

export const getScoresGroupedByNameSourceType = async ({
  projectId,
  filter,
  fromTimestamp,
  toTimestamp,
}: {
  projectId: string;
  filter: FilterCondition[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
}) => {
  const filterRes = applyScoresColumnsFilter(filter);
  const dt = inList("s.data_type", LISTABLE_SCORE_TYPES, "dt");
  const rows = await greptimeQuery<{
    name: string;
    source: string;
    data_type: string;
  }>({
    query: `
      SELECT s.name AS name, s.source AS source, s.data_type AS data_type
      FROM scores s
      WHERE s.project_id = :projectId
        ${filterRes.query ? `AND ${filterRes.query}` : ""}
        ${fromTimestamp ? "AND s.timestamp >= :fromTs" : ""}
        ${toTimestamp ? "AND s.timestamp <= :toTs" : ""}
        AND ${dt.sql}
        AND ${notDeleted("s")}
      GROUP BY name, source, data_type
      ORDER BY count(*) DESC
      LIMIT 200`,
    params: {
      projectId,
      ...filterRes.params,
      ...dt.params,
      ...(fromTimestamp ? { fromTs: greptimeTsParam(fromTimestamp) } : {}),
      ...(toTimestamp ? { toTs: greptimeTsParam(toTimestamp) } : {}),
    },
    readOnly: true,
  });
  return rows.map((row) => ({
    name: row.name,
    source: row.source as ScoreSourceType,
    dataType: row.data_type as ListableScoreDataType,
  }));
};

export const getNumericScoresGroupedByName = async (
  projectId: string,
  filter?: FilterState,
) => {
  const filterRes = filter ? applyScoresColumnsFilter(filter) : undefined;
  return greptimeQuery<{ name: string }>({
    query: `
      SELECT name AS name
      FROM scores s
      WHERE s.project_id = :projectId
        AND s.data_type IN ('NUMERIC', 'BOOLEAN')
        ${filterRes?.query ? `AND ${filterRes.query}` : ""}
        AND ${notDeleted("s")}
      GROUP BY name
      ORDER BY count(*) DESC
      LIMIT 200`,
    params: { projectId, ...(filterRes ? filterRes.params : {}) },
    readOnly: true,
  });
};

export const getCategoricalScoresGroupedByName = async (
  projectId: string,
  filter?: FilterState,
) => {
  const filterRes = filter ? applyScoresColumnsFilter(filter) : undefined;
  const rows = await greptimeQuery<{ label: string; values: unknown }>({
    query: `
      SELECT name AS label, array_agg(DISTINCT string_value) AS values
      FROM scores s
      WHERE s.project_id = :projectId
        AND s.data_type = 'CATEGORICAL'
        ${filterRes?.query ? `AND ${filterRes.query}` : ""}
        AND ${notDeleted("s")}
      GROUP BY name
      ORDER BY count(*) DESC
      LIMIT 200`,
    params: { projectId, ...(filterRes ? filterRes.params : {}) },
    readOnly: true,
  });

  const normalized = rows.map((row) => ({
    label: row.label,
    values: greptimeJson<string[]>(row.values, [])
      .filter((v): v is string => v != null)
      .slice(0, 20),
  }));

  const scoreNames = normalized.map((r) => r.label);
  const scoreConfigs =
    scoreNames.length > 0
      ? await prisma.scoreConfig.findMany({
          where: {
            projectId,
            name: { in: scoreNames },
            dataType: "CATEGORICAL",
            isArchived: false,
          },
          select: { name: true, categories: true },
        })
      : [];
  const configMap = new Map(scoreConfigs.map((c) => [c.name, c.categories]));

  return normalized.map((row) => {
    const configCategories = configMap.get(row.label);
    if (configCategories && Array.isArray(configCategories)) {
      const allPossibleValues = (
        configCategories as Array<{ label: string; value: number }>
      ).map((c) => c.label);
      const mergedValues = Array.from(
        new Set([...row.values, ...allPossibleValues]),
      ).slice(0, 20);
      return { ...row, values: mergedValues };
    }
    return row;
  });
};

export const getScoreNames = async (
  projectId: string,
  timestampFilter: FilterState,
) => {
  const filterRes = new FilterList(
    createGreptimeFilterFromFilterState(
      timestampFilter,
      scoresTableGreptimeColumnDefinitions,
      scoresTableCols,
    ),
  ).apply();
  const dt = inList("s.data_type", LISTABLE_SCORE_TYPES, "dt");
  const rows = await greptimeQuery<{ name: string; count: string }>({
    query: `
      SELECT name, count(*) AS count
      FROM scores s
      WHERE s.project_id = :projectId
        ${filterRes.query ? `AND ${filterRes.query}` : ""}
        AND ${dt.sql}
        AND ${notDeleted("s")}
      GROUP BY name
      ORDER BY count(*) DESC
      LIMIT 1000`,
    params: { projectId, ...filterRes.params, ...dt.params },
    readOnly: true,
  });
  return rows.map((row) => ({ name: row.name, count: Number(row.count) }));
};

export const getScoreStringValues = async (
  projectId: string,
  timestampFilter: FilterState,
) => {
  const filterRes = new FilterList(
    createGreptimeFilterFromFilterState(
      timestampFilter,
      scoresTableGreptimeColumnDefinitions,
      scoresTableCols,
    ),
  ).apply();
  const rows = await greptimeQuery<{ string_value: string; count: string }>({
    query: `
      SELECT string_value, count(*) AS count
      FROM scores s
      WHERE s.project_id = :projectId
        AND string_value IS NOT NULL AND string_value != '' AND s.data_type != 'TEXT'
        ${filterRes.query ? `AND ${filterRes.query}` : ""}
        AND ${notDeleted("s")}
      GROUP BY string_value
      ORDER BY count(*) DESC
      LIMIT 1000`,
    params: { projectId, ...filterRes.params },
    readOnly: true,
  });
  return rows.map((row) => ({
    value: row.string_value,
    count: Number(row.count),
  }));
};

export const getDistinctScoreNames = async (p: {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterState;
  isTimestampFilter: (filter: FilterCondition) => filter is TimeFilter;
}) => {
  const { projectId, cutoffCreatedAt, filter, isTimestampFilter } = p;
  const scoreTimestampFilter = filter?.find(isTimestampFilter);
  const dt = inList("s.data_type", LISTABLE_SCORE_TYPES, "dt");
  const rows = await greptimeQuery<{ name: string }>({
    query: `
      SELECT DISTINCT name
      FROM scores s
      WHERE s.project_id = :projectId
        AND s.created_at <= :cutoff
        ${scoreTimestampFilter ? "AND s.timestamp >= :filterTs" : ""}
        AND ${dt.sql}
        AND ${notDeleted("s")}`,
    params: {
      projectId,
      cutoff: greptimeTsParam(cutoffCreatedAt),
      ...dt.params,
      ...(scoreTimestampFilter
        ? { filterTs: greptimeTsParam(scoreTimestampFilter.value) }
        : {}),
    },
    readOnly: true,
  });
  return rows.map((r) => r.name);
};

export const getScoreMetadataById = async (
  projectId: string,
  id: string,
  source?: ScoreSourceType,
) => {
  const rows = await greptimeQuery<Row>({
    query: `
      SELECT ${selectJsonColumn("metadata", { tablePrefix: "s" })}
      FROM scores s
      WHERE s.project_id = :projectId AND s.id = :id
        ${source ? "AND s.source = :source" : ""}
        AND ${notDeleted("s")}
      LIMIT 1`,
    params: { projectId, id, ...(source ? { source } : {}) },
    readOnly: true,
  });
  return rows
    .map((row) =>
      parseMetadataCHRecordToDomain(
        greptimeJson<Record<string, string>>(row.metadata, {}),
      ),
    )
    .shift();
};

// ---------------------------------------------------------------------------
// existence + cross-project counts
// ---------------------------------------------------------------------------

export const hasAnyScore = async (projectId: string) => {
  const rows = await greptimeQuery<{ one: number }>({
    query: `SELECT 1 AS one FROM scores WHERE project_id = :projectId AND ${notDeleted()} LIMIT 1`,
    params: { projectId },
    readOnly: true,
  });
  return rows.length > 0;
};

export const hasAnyScoreOlderThan = async (
  projectId: string,
  beforeDate: Date,
) => {
  const rows = await greptimeQuery<{ one: number }>({
    query: `
      SELECT 1 AS one FROM scores
      WHERE project_id = :projectId AND timestamp < :cutoff AND ${notDeleted()}
      LIMIT 1`,
    params: { projectId, cutoff: greptimeTsParam(beforeDate) },
    readOnly: true,
  });
  return rows.length > 0;
};

export const getScoreCountsByProjectInCreationInterval = async ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) => {
  const dt = inList("data_type", LISTABLE_SCORE_TYPES, "dt");
  const rows = await greptimeQuery<{ project_id: string; count: string }>({
    query: `
      SELECT project_id, count(*) AS count
      FROM scores
      WHERE created_at >= :start AND created_at < :end AND ${dt.sql} AND ${notDeleted()}
      GROUP BY project_id`,
    params: {
      start: greptimeTsParam(start),
      end: greptimeTsParam(end),
      ...dt.params,
    },
    readOnly: true,
  });
  return rows.map((row) => ({
    projectId: row.project_id,
    count: Number(row.count),
  }));
};

export const getScoreCountOfProjectsSinceCreationDate = async ({
  projectIds,
  start,
}: {
  projectIds: string[];
  start: Date;
}) => {
  if (projectIds.length === 0) return 0;
  const ids = inList("project_id", projectIds, "pid");
  const rows = await greptimeQuery<{ count: string }>({
    query: `
      SELECT count(*) AS count
      FROM scores
      WHERE ${ids.sql} AND created_at >= :start AND ${notDeleted()}`,
    params: { ...ids.params, start: greptimeTsParam(start) },
    readOnly: true,
  });
  return Number(rows[0]?.count ?? 0);
};

export const getScoreCountsByProjectAndDay = async ({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}) => {
  const dt = inList("data_type", LISTABLE_SCORE_TYPES, "dt");
  const rows = await greptimeQuery<{
    count: string;
    project_id: string;
    date: Date | string;
  }>({
    query: `
      SELECT count(*) AS count, project_id, date_trunc('day', timestamp) AS date
      FROM scores
      WHERE timestamp >= :start AND timestamp < :end AND ${dt.sql} AND ${notDeleted()}
      GROUP BY project_id, date_trunc('day', timestamp)`,
    params: {
      start: greptimeTsParam(startDate),
      end: greptimeTsParam(endDate),
      ...dt.params,
    },
    readOnly: true,
  });
  return rows.map((row) => ({
    count: Number(row.count),
    projectId: row.project_id,
    date:
      row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : String(row.date).slice(0, 10),
  }));
};

// ---------------------------------------------------------------------------
// scores UI table (scores <-> traces join) + histogram — built last
// ---------------------------------------------------------------------------

export type ScoreUiTableRow = ScoreDomain & {
  traceName: string | null;
  traceUserId: string | null;
  traceTags: Array<string> | null;
};

const buildScoresUiQuery = (props: {
  select: "count" | "rows";
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
  excludeMetadata: boolean;
  includeHasMetadataFlag: boolean;
}) => {
  const scoresFilter = new FilterList([
    new StringFilter({
      table: "scores",
      field: "project_id",
      operator: "=",
      value: props.projectId,
      tablePrefix: "s",
    }),
  ]);
  scoresFilter.push(
    ...createGreptimeFilterFromFilterState(
      props.filter,
      scoresTableGreptimeColumnDefinitions,
      scoresTableCols,
    ),
  );
  const filterRes = scoresFilter.apply();
  const performTracesJoin =
    props.select === "rows" || scoresFilter.some((f) => f.table === "traces");
  const dt = inList("s.data_type", LISTABLE_SCORE_TYPES, "dt");

  const select =
    props.select === "count"
      ? "count(*) AS count"
      : greptimeScoreSelect({
          prefix: "s",
          excludeMetadata: props.excludeMetadata,
        }) +
        ", t.user_id AS user_id, t.name AS trace_name, json_to_string(t.tags) AS trace_tags" +
        (props.includeHasMetadataFlag ? `, ${HAS_METADATA_EXPR}` : "");

  const orderBy =
    props.select === "rows"
      ? greptimeOrderBySql(
          props.orderBy ?? null,
          scoresTableGreptimeColumnDefinitions,
        )
      : "";

  return {
    query: `
      SELECT ${select}
      FROM scores s
      ${performTracesJoin ? `LEFT JOIN traces t ON s.trace_id = t.id AND t.project_id = s.project_id AND ${notDeleted("t")}` : ""}
      WHERE ${filterRes.query} AND ${dt.sql} AND ${notDeleted("s")}
      ${orderBy}
      ${props.select === "rows" ? paginate(props.limit, props.offset) : ""}`,
    params: { ...filterRes.params, ...dt.params },
  };
};

export const getScoresUiCount = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
}) => {
  const { query, params } = buildScoresUiQuery({
    ...props,
    select: "count",
    excludeMetadata: true,
    includeHasMetadataFlag: false,
  });
  const rows = await greptimeQuery<{ count: string }>({
    query,
    params,
    readOnly: true,
  });
  return Number(rows[0]?.count ?? 0);
};

export async function getScoresUiTable(props: {
  projectId: string;
  filter: FilterState;
  orderBy: OrderByState;
  limit?: number;
  offset?: number;
  excludeMetadata?: boolean;
  includeHasMetadataFlag?: boolean;
}): Promise<ScoreUiTableRow[]> {
  const excludeMetadata = props.excludeMetadata ?? false;
  const includeHasMetadataFlag = props.includeHasMetadataFlag ?? false;
  const { query, params } = buildScoresUiQuery({
    ...props,
    select: "rows",
    excludeMetadata,
    includeHasMetadataFlag,
  });
  const rows = await greptimeQuery<Row>({ query, params, readOnly: true });
  return rows.map((row) => {
    const score = convertGreptimeScoreRowToDomain(row, !excludeMetadata);
    const result: ScoreUiTableRow = {
      ...score,
      traceUserId: (row.user_id as string | null) ?? null,
      traceName: (row.trace_name as string | null) ?? null,
      traceTags: greptimeJson<string[] | null>(row.trace_tags, null),
    };
    if (includeHasMetadataFlag) {
      Object.assign(result, { hasMetadata: greptimeBool(row.has_metadata) });
    }
    return result;
  });
}

export const getNumericScoreHistogram = async (
  projectId: string,
  filter: FilterState,
  limit: number,
) => {
  // CH used dashboardColumnDefinitions; the scores mapping covers the histogram's
  // score/trace filter columns. A trace-column filter triggers the traces join.
  const filterList = new FilterList(
    createGreptimeFilterFromFilterState(
      filter,
      scoresTableGreptimeColumnDefinitions,
      scoresTableCols,
    ),
  );
  const filterRes = filterList.apply();
  const hasTraceFilter = filterList.some((f) => f.table === "traces");

  return greptimeQuery<{ value: number }>({
    query: `
      SELECT s.value AS value
      FROM scores s
      ${hasTraceFilter ? `LEFT JOIN traces t ON s.trace_id = t.id AND t.project_id = s.project_id AND ${notDeleted("t")}` : ""}
      WHERE s.project_id = :projectId
        ${filterRes.query ? `AND ${filterRes.query}` : ""}
        AND ${notDeleted("s")}
      ${limit !== undefined ? `LIMIT ${Number(limit)}` : ""}`,
    params: { projectId, ...filterRes.params },
    readOnly: true,
  });
};

// ---------------------------------------------------------------------------
// P2: aggregated scores for prompts (scores <-> observations join)
// ---------------------------------------------------------------------------

/**
 * Scores attached to GENERATION observations of the given prompts. CH joined `scores FINAL` to
 * `observations FINAL`; on the merged projection this is a plain JOIN with `is_deleted = false`.
 * `has_metadata` (CH `length(mapKeys(metadata)) > 0`) is computed from the JSON column.
 */
export const getAggregatedScoresForPrompts = async (
  projectId: string,
  promptIds: string[],
  fetchScoreRelation: "observation" | "trace",
  {
    fromTimestamp,
    toTimestamp,
  }: { fromTimestamp?: Date; toTimestamp?: Date } = {},
) => {
  if (promptIds.length === 0) return [];
  const promptList = inList("o.prompt_id", promptIds, "pid");
  const dt = inList("s.data_type", LISTABLE_SCORE_TYPES, "dt");

  const rows = await greptimeQuery<
    ScoreAggregation & { prompt_id: string; has_metadata: unknown }
  >({
    query: `
      SELECT
        o.prompt_id AS prompt_id,
        s.id AS id,
        s.name AS name,
        s.string_value AS string_value,
        s.value AS value,
        s.source AS source,
        s.data_type AS data_type,
        s.comment AS comment,
        s.timestamp AS timestamp,
        ${HAS_METADATA_EXPR}
      FROM scores s
      JOIN observations o
        ON o.trace_id = s.trace_id AND o.project_id = s.project_id
        ${fetchScoreRelation === "observation" ? "AND o.id = s.observation_id" : ""}
      WHERE o.project_id = :projectId AND s.project_id = :projectId
        AND ${notDeleted("s")} AND ${notDeleted("o")}
        AND ${promptList.sql}
        AND o.type = 'GENERATION'
        ${fromTimestamp ? "AND o.start_time >= :fromTs" : ""}
        ${toTimestamp ? "AND o.start_time <= :toTs" : ""}
        AND s.name IS NOT NULL
        ${fetchScoreRelation === "trace" ? "AND s.observation_id IS NULL" : ""}
        AND ${dt.sql}`,
    params: {
      projectId,
      ...promptList.params,
      ...dt.params,
      ...(fromTimestamp ? { fromTs: greptimeTsParam(fromTimestamp) } : {}),
      ...(toTimestamp ? { toTs: greptimeTsParam(toTimestamp) } : {}),
    },
    readOnly: true,
  });

  return rows.map((row) => ({
    ...convertScoreAggregation<ListableScoreDataType>(row),
    promptId: row.prompt_id,
    hasMetadata: greptimeBool(row.has_metadata),
  }));
};

// ---------------------------------------------------------------------------
// P5 public-API score generators (legacy /api/public/scores v1/v2 + v3 list)
// ---------------------------------------------------------------------------

/**
 * Public-API score list. The CH self-referential IN-subquery + `LIMIT 1 BY` dedup is redundant on
 * the merged projection (the outer score filter already selects the matching rows), so it collapses
 * to a single filtered SELECT with an optional traces LEFT JOIN. scoreScope `traces_only` restricts
 * to trace-attached scores. Returns domain scores with an optional embedded `trace` object.
 */
export const _handleGenerateScoresForPublicApi = async ({
  projectId,
  scoresFilter,
  tracesFilter,
  scoreScope,
  includeTrace,
  needsTraceJoin,
  pagination,
}: {
  projectId: string;
  scoresFilter: ChFilterList;
  tracesFilter: ChFilterList;
  scoreScope: "traces_only" | "all";
  includeTrace: boolean;
  needsTraceJoin: boolean;
  pagination?: { limit: number; page: number };
}) => {
  const applied = translateChFilterList(scoresFilter).apply();
  const appliedTraces = translateChFilterList(tracesFilter).apply();
  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT
        ${needsTraceJoin ? `t.user_id AS user_id, ${selectJsonColumn("tags", { alias: "tags", tablePrefix: "t" })}, t.environment AS trace_environment, t.session_id AS trace_session_id,` : ""}
        ${greptimeScoreSelect({ prefix: "s" })}
      FROM scores s
      ${needsTraceJoin ? `LEFT JOIN traces t ON s.trace_id = t.id AND s.project_id = t.project_id AND ${notDeleted("t")}` : ""}
      WHERE s.project_id = :projectId AND ${notDeleted("s")}
        ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
        ${applied.query ? `AND ${applied.query}` : ""}
        ${tracesFilter.length() > 0 ? `AND ${appliedTraces.query}` : ""}
      ORDER BY s.timestamp DESC
      ${pagination ? "LIMIT :limit OFFSET :offset" : ""}`,
    params: {
      projectId,
      ...applied.params,
      ...appliedTraces.params,
      ...(pagination
        ? {
            limit: pagination.limit,
            offset: (pagination.page - 1) * pagination.limit,
          }
        : {}),
    },
    readOnly: true,
  });

  return rows.map((record) => {
    const domainScore = convertGreptimeScoreRowToDomain(record);
    return {
      ...domainScore,
      trace:
        includeTrace && domainScore.traceId !== null
          ? {
              userId: greptimeStringOrUndefined(record.user_id),
              tags: greptimeJson<string[]>(record.tags, []),
              environment: greptimeStringOrUndefined(record.trace_environment),
              sessionId: greptimeStringOrNull(record.trace_session_id),
            }
          : null,
    };
  });
};

export const _handleGetScoresCountForPublicApi = async ({
  projectId,
  scoresFilter,
  tracesFilter,
  scoreScope,
  needsTraceJoin,
}: {
  projectId: string;
  scoresFilter: ChFilterList;
  tracesFilter: ChFilterList;
  scoreScope: "traces_only" | "all";
  includeTrace: boolean;
  needsTraceJoin: boolean;
}): Promise<number | undefined> => {
  const applied = translateChFilterList(scoresFilter).apply();
  const appliedTraces = translateChFilterList(tracesFilter).apply();
  const rows = await greptimeQuery<{ count: string | number }>({
    query: `
      SELECT count(*) AS count
      FROM scores s
      ${needsTraceJoin ? `LEFT JOIN traces t ON s.trace_id = t.id AND s.project_id = t.project_id AND ${notDeleted("t")}` : ""}
      WHERE s.project_id = :projectId AND ${notDeleted("s")}
        ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
        ${applied.query ? `AND ${applied.query}` : ""}
        ${tracesFilter.length() > 0 ? `AND ${appliedTraces.query}` : ""}`,
    params: { projectId, ...applied.params, ...appliedTraces.params },
    readOnly: true,
  });
  return rows.length > 0 ? Number(rows[0].count) : undefined;
};

const greptimeStringOrUndefined = (v: unknown): string =>
  v == null ? "" : String(v);
const greptimeStringOrNull = (v: unknown): string | null =>
  v == null ? null : String(v);

const V3_STRING_OPTION_FIELDS: ReadonlyArray<{
  key: keyof ListFilterParams;
  field: string;
}> = [
  { key: "id", field: "id" },
  { key: "name", field: "name" },
  { key: "source", field: "source" },
  { key: "dataType", field: "data_type" },
  { key: "environment", field: "environment" },
  { key: "configId", field: "config_id" },
  { key: "queueId", field: "queue_id" },
  { key: "authorUserId", field: "author_user_id" },
  { key: "traceId", field: "trace_id" },
  { key: "sessionId", field: "session_id" },
  { key: "observationId", field: "observation_id" },
  { key: "experimentId", field: "dataset_run_id" },
];

/** GreptimeDB-native port of the v3 `buildDynamicFilters` (all plain `scores` columns). */
const buildGreptimeScoreV3Filters = (
  params: ListFilterParams,
): { query: string; params: Record<string, unknown> } => {
  const list = new FilterList();
  for (const { key, field } of V3_STRING_OPTION_FIELDS) {
    const values = params[key] as string[] | undefined;
    if (values?.length) {
      list.push(
        new StringOptionsFilter({
          table: "scores",
          field,
          operator: "any of",
          values,
          tablePrefix: "s",
        }),
      );
    }
  }
  if (params.fromTimestamp !== undefined)
    list.push(
      new DateTimeFilter({
        table: "scores",
        field: "timestamp",
        operator: ">=",
        value: params.fromTimestamp,
        tablePrefix: "s",
      }),
    );
  if (params.toTimestamp !== undefined)
    list.push(
      new DateTimeFilter({
        table: "scores",
        field: "timestamp",
        operator: "<",
        value: params.toTimestamp,
        tablePrefix: "s",
      }),
    );
  if (params.valueMin !== undefined)
    list.push(
      new NumberFilter({
        table: "scores",
        field: "value",
        operator: ">=",
        value: params.valueMin,
        tablePrefix: "s",
      }),
    );
  if (params.valueMax !== undefined)
    list.push(
      new NumberFilter({
        table: "scores",
        field: "value",
        operator: "<=",
        value: params.valueMax,
        tablePrefix: "s",
      }),
    );

  const compiled = list.apply();
  const extraClauses: string[] = [];
  const extraParams: Record<string, unknown> = {};

  if (params.value?.length && params.dataType?.length === 1) {
    const dt = params.dataType[0] as ScoreDataTypeType;
    if (dt === ScoreDataTypeEnum.NUMERIC || dt === ScoreDataTypeEnum.BOOLEAN) {
      const nums = params.value.map((v) => {
        if (dt === ScoreDataTypeEnum.BOOLEAN) {
          if (v === "true") return 1;
          if (v === "false") return 0;
          throw new InternalServerError(
            `BOOLEAN value filter received unexpected value: ${v}`,
          );
        }
        const n = Number(v);
        if (!Number.isFinite(n))
          throw new InternalServerError(
            `NUMERIC value filter received non-finite value: ${v}`,
          );
        return n;
      });
      const placeholders = nums.map((n, i) => {
        extraParams[`v3val${i}`] = n;
        return `:v3val${i}`;
      });
      extraClauses.push(`s.\`value\` IN (${placeholders.join(", ")})`);
    } else if (dt === ScoreDataTypeEnum.CATEGORICAL) {
      const placeholders = params.value.map((v, i) => {
        extraParams[`v3sval${i}`] = v;
        return `:v3sval${i}`;
      });
      extraClauses.push(`s.\`string_value\` IN (${placeholders.join(", ")})`);
    } else {
      throw new InternalServerError(
        `value filter with dataType=${dt} should have been rejected by handler validation`,
      );
    }
  }

  const query = [compiled.query, ...extraClauses].filter(Boolean).join(" AND ");
  return { query, params: { ...compiled.params, ...extraParams } };
};

/**
 * v3 score list rows (cursor keyset). Fetches `limit + 1` domain scores ordered by
 * (timestamp, id) DESC with a stable composite cursor; the caller (scores.ts) slices, encodes the
 * next cursor, and shapes each domain score into the field-group `APIScoreV3` contract.
 */
export const listScoresV3RowsForPublicApi = async (
  params: {
    projectId: string;
    limit: number;
    cursor?: ScoresCursorV3Type;
  } & ListFilterParams,
): Promise<{ scores: ScoreDomain[]; hasMore: boolean }> => {
  const filter = buildGreptimeScoreV3Filters(params);
  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT ${greptimeScoreSelect({ prefix: "s" })}
      FROM scores s
      WHERE s.project_id = :projectId AND ${notDeleted("s")}
        ${params.cursor ? "AND (s.timestamp < :lastTs OR (s.timestamp = :lastTs AND s.id < :lastId))" : ""}
        ${filter.query ? `AND ${filter.query}` : ""}
      ORDER BY s.timestamp DESC, s.id DESC
      LIMIT :limit`,
    params: {
      projectId: params.projectId,
      limit: params.limit + 1,
      ...(params.cursor
        ? {
            lastTs: greptimeTsParam(params.cursor.lastTimestamp),
            lastId: params.cursor.lastId,
          }
        : {}),
      ...filter.params,
    },
    readOnly: true,
  });
  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  return {
    scores: page.map((r) => convertGreptimeScoreRowToDomain(r)),
    hasMore,
  };
};
