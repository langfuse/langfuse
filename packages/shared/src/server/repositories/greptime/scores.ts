import { prisma } from "../../../db";
import {
  type ScoreDataTypeType,
  type ScoreDomain,
  type ScoreSourceType,
  type ListableScoreDataType,
  AGGREGATABLE_SCORE_TYPES,
  LISTABLE_SCORE_TYPES,
} from "../../../domain/scores";
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
import { FilterList, StringFilter } from "../../greptime/sql/greptime-filter";
import { createGreptimeFilterFromFilterState } from "../../greptime/sql/factory";
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

/** scores-native filter columns for the grouping helpers (dataset-run/experiment columns are P4). */
const scoresColumnsGreptimeColumnDefinitions: GreptimeColumnMappings = [
  { uiTableName: "Timestamp", uiTableId: "timestamp", greptimeTableName: "scores", greptimeSelect: "timestamp", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Session ID", uiTableId: "sessionId", greptimeTableName: "scores", greptimeSelect: "session_id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Dataset Run IDs", uiTableId: "datasetRunIds", greptimeTableName: "scores", greptimeSelect: "dataset_run_id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Observation ID", uiTableId: "observationId", greptimeTableName: "scores", greptimeSelect: "observation_id", queryPrefix: "s" }, // prettier-ignore
  { uiTableName: "Trace ID", uiTableId: "traceId", greptimeTableName: "scores", greptimeSelect: "trace_id", queryPrefix: "s" }, // prettier-ignore
];

const inList = (column: string, values: readonly string[], prefix: string) =>
  greptimeInClause(column, values, prefix);

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
      ${paginate(limit, offset)}`,
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
      ${paginate(limit, offset)}`,
    params: { projectId, ...ids.params, ...dt.params },
    readOnly: true,
  });
  return mapScoreRows(rows, excludeMetadata, includeHasMetadata);
};

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
      ${paginate(limit, offset)}`,
    params: {
      projectId,
      ...ids.params,
      ...dt.params,
      ...(minTimestamp ? { minTs: greptimeTsParam(minTimestamp) } : {}),
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
      ${paginate(limit, offset)}`,
    params: {
      projectId,
      ...ids.params,
      ...(dt ? dt.params : {}),
      ...(timestamp ? { traceTs: greptimeTsParam(timestamp) } : {}),
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
