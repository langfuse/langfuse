import { prisma } from "../../../db";
import { type FilterState } from "../../../types";
import {
  DEFAULT_RENDERING_PROPS,
  type RenderingProps,
} from "../../utils/rendering";
import { greptimeQuery } from "../../greptime/client";
import { greptimeSearchCondition } from "../../greptime/sql/search";
import { type FullEventsObservations } from "../../queries";
import { type ObservationTableQuery } from "../observations";
import { enrichObservationWithModelData } from "../observations_converters";
import { getTracesByIds } from "./traces";
import { getObservationByIdFromObservationsTable } from "./observations";
import {
  buildObservationsTableQuery,
  getObservationsTableCountGreptime,
  getObservationsTableRowsGreptime,
} from "./observationsTable";
import {
  convertGreptimeObservationRowToDomain,
  greptimeObservationSelect,
} from "./converters";
import { greptimeTsParam, notDeleted } from "./queryHelpers";

/**
 * GreptimeDB obs-from-events collapse (04-read-path.md, P5 Piece D).
 *
 * In GreptimeDB there are no `events_core` / `events_full` tables; the merged `observations`
 * projection is the only state, with the trace-denormalised fields (`userId`, `sessionId`,
 * `traceName`, `release`, trace `tags`) looked up from `traces` post-fetch. This module rebuilds
 * the `FullEventsObservation` shape (`AdditionalObservationFields & EventsObservation`) on top of
 * the P1/P2 greptime observation reads, so the events-table callers collapse to plain delegation.
 *
 * `positionInTrace` (root/first/last/nth span filter) is honoured with a `ROW_NUMBER()` qualifying
 * query that restricts the main read to the qualifying span ids.
 */

type PositionInTraceFilter = Extract<
  FilterState[number],
  { type: "positionInTrace" }
>;

const isPositionFilter = (f: FilterState[number]): f is PositionInTraceFilter =>
  f.type === "positionInTrace";

/**
 * Resolve the span ids that satisfy a `positionInTrace` filter: rank observations per trace by
 * start_time (ASC for root/first/nthFromStart, DESC for last/nthFromEnd) and keep rank = N.
 */
const resolvePositionQualifyingIds = async (
  projectId: string,
  baseFilter: FilterState,
  position: PositionInTraceFilter,
  searchQuery?: string,
  searchType?: Parameters<typeof greptimeSearchCondition>[0]["searchType"],
): Promise<string[]> => {
  const key = position.key;
  const isFromEnd = key === "last" || key === "nthFromEnd";
  const direction = isFromEnd ? "DESC" : "ASC";
  const rank =
    key === "last" || key === "first" || key === "root"
      ? 1
      : typeof position.value === "number"
        ? Math.max(1, position.value)
        : 1;

  const compiled = buildObservationsTableQuery({
    projectId,
    filter: baseFilter,
  });
  const search = greptimeSearchCondition({
    query: searchQuery,
    searchType,
    tablePrefix: "o",
  });

  const rows = await greptimeQuery<{ id: string }>({
    query: `
      WITH qualifying AS (
        SELECT o.id AS id,
          ROW_NUMBER() OVER (
            PARTITION BY o.trace_id
            ORDER BY o.start_time ${direction}, o.id ${direction}
          ) AS rn
        FROM observations o
        ${compiled.traceJoin ? "LEFT JOIN traces t ON t.id = o.trace_id AND t.project_id = o.project_id AND " + notDeleted("t") : ""}
        WHERE ${compiled.whereSql} AND ${notDeleted("o")}
          ${compiled.lookback ? "AND t.timestamp >= :obsTraceLookback" : ""}
          ${search.query}
      )
      SELECT id FROM qualifying WHERE rn = :rank`,
    params: {
      ...compiled.params,
      ...search.params,
      ...(compiled.lookback ? { obsTraceLookback: compiled.lookback } : {}),
      rank,
    },
    readOnly: true,
  });
  return rows.map((r) => r.id);
};

/**
 * Strip the `positionInTrace` filter and, when present, fold it into an `id IN (...)` restriction so
 * the remaining read runs through the standard greptime observation reader. Returns `null` when the
 * position filter qualifies zero rows (caller should short-circuit to an empty result).
 */
const applyPositionFilter = async (
  opts: ObservationTableQuery,
): Promise<FilterState | null> => {
  const positionFilter = opts.filter.find(isPositionFilter);
  const baseFilter: FilterState = opts.filter.filter(
    (f) => !isPositionFilter(f),
  );
  if (!positionFilter) return baseFilter;

  const qualifyingIds = await resolvePositionQualifyingIds(
    opts.projectId,
    baseFilter,
    positionFilter,
    opts.searchQuery,
    opts.searchType,
  );
  if (qualifyingIds.length === 0) return null;
  return [
    ...baseFilter,
    {
      column: "id",
      type: "stringOptions",
      operator: "any of",
      value: qualifyingIds,
    },
  ];
};

// Return type is intentionally inferred (carries the runtime `modelId` from
// enrichObservationWithModelData) so the public-API V2 path can satisfy `EventsObservationPublic`.
const enrichEventsObservations = async (
  observations: Awaited<ReturnType<typeof getObservationsTableRowsGreptime>>,
  projectId: string,
) => {
  const uniqueModels = Array.from(
    new Set(
      observations
        .map((o) => o.internalModelId)
        .filter((m): m is string => Boolean(m)),
    ),
  );
  const traceIds = Array.from(
    new Set(
      observations.map((o) => o.traceId).filter((t): t is string => Boolean(t)),
    ),
  );

  const [models, traces] = await Promise.all([
    uniqueModels.length > 0
      ? prisma.model.findMany({
          where: {
            id: { in: uniqueModels },
            OR: [{ projectId }, { projectId: null }],
          },
          include: { Price: true },
        })
      : [],
    traceIds.length > 0 ? getTracesByIds(traceIds, projectId) : [],
  ]);

  return observations.map((o) => {
    const trace = traces.find((t) => t.id === o.traceId);
    const model = models.find((m) => m.id === o.internalModelId);
    return {
      ...o,
      userId: trace?.userId ?? null,
      sessionId: trace?.sessionId ?? null,
      traceName: trace?.name ?? null,
      release: trace?.release ?? null,
      tags: trace?.tags ?? [],
      traceTags: trace?.tags ?? [],
      traceTimestamp: trace?.timestamp ?? null,
      toolDefinitionsCount: o.toolDefinitions
        ? Object.keys(o.toolDefinitions).length
        : null,
      toolCallsCount: o.toolCalls ? o.toolCalls.length : null,
      ...enrichObservationWithModelData(model),
    };
  });
};

/**
 * Rows for the events observations table list (V1, complete observations) as `FullEventsObservation`.
 */
export const getObservationsFromEventsGreptime = async (
  opts: ObservationTableQuery,
): Promise<FullEventsObservations> => {
  const filter = await applyPositionFilter(opts);
  if (filter === null) return [];

  const observations = await getObservationsTableRowsGreptime(
    {
      projectId: opts.projectId,
      filter,
      orderBy: opts.orderBy,
      limit: opts.limit,
      offset: opts.offset,
      selectIOAndMetadata: opts.selectIOAndMetadata,
      searchQuery: opts.searchQuery,
      searchType: opts.searchType,
    },
    opts.renderingProps ?? DEFAULT_RENDERING_PROPS,
  );

  return enrichEventsObservations(observations, opts.projectId);
};

export const getObservationsCountFromEventsGreptime = async (
  opts: ObservationTableQuery,
): Promise<number> => {
  const filter = await applyPositionFilter(opts);
  if (filter === null) return 0;

  return getObservationsTableCountGreptime({
    projectId: opts.projectId,
    filter,
    searchQuery: opts.searchQuery,
    searchType: opts.searchType,
  });
};

/**
 * Single observation by id in the events shape. Wraps the P1 greptime by-id read and layers the
 * trace-denormalised events fields.
 */
export const getObservationByIdFromEventsGreptime = async (params: {
  id: string;
  projectId: string;
  fetchWithInputOutput?: boolean;
  startTime?: Date;
  type?: Parameters<typeof getObservationByIdFromObservationsTable>[0]["type"];
  traceId?: string;
  renderingProps?: RenderingProps;
}): Promise<FullEventsObservations[number] | undefined> => {
  const observation = await getObservationByIdFromObservationsTable(params);
  if (!observation) return undefined;
  const enriched = await enrichEventsObservations(
    [observation],
    params.projectId,
  );
  return enriched[0];
};

// ---------------------------------------------------------------------------
// Public-API events observation variants (legacy /api/public observations path).
// In GreptimeDB the "events" path == the merged projection, so these collapse onto the same
// `FullEventsObservation` reader. Filters come from the public-API simple props (+ optional
// advanced filter JSON), resolved against the observations column mapping.
// ---------------------------------------------------------------------------

export type EventsPublicApiObservationsProps = {
  traceId?: string;
  userId?: string;
  name?: string;
  type?: string;
  level?: string;
  parentObservationId?: string;
  fromStartTime?: string;
  toStartTime?: string;
  version?: string;
  environment?: string | string[];
  advancedFilters?: FilterState;
};

const buildEventsPublicApiObservationsFilter = (
  props: EventsPublicApiObservationsProps,
): FilterState => {
  const filter: FilterState = [];
  const pushEq = (column: string, value?: string) => {
    if (value !== undefined && value !== null) {
      filter.push({ column, type: "string", operator: "=", value });
    }
  };
  pushEq("traceId", props.traceId);
  pushEq("userId", props.userId);
  pushEq("name", props.name);
  pushEq("type", props.type);
  pushEq("level", props.level);
  pushEq("parentObservationId", props.parentObservationId);
  pushEq("version", props.version);
  if (props.environment) {
    const envs = Array.isArray(props.environment)
      ? props.environment
      : [props.environment];
    if (envs.length > 0) {
      filter.push({
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: envs,
      });
    }
  }
  if (props.fromStartTime) {
    filter.push({
      column: "startTime",
      type: "datetime",
      operator: ">=",
      value: new Date(props.fromStartTime),
    });
  }
  if (props.toStartTime) {
    filter.push({
      column: "startTime",
      type: "datetime",
      operator: "<",
      value: new Date(props.toStartTime),
    });
  }
  if (props.advancedFilters) {
    filter.push(...props.advancedFilters);
  }
  return filter;
};

export const getObservationsForPublicApiFromEventsGreptime = async (opts: {
  projectId: string;
  props: EventsPublicApiObservationsProps;
  page: number;
  limit: number;
  parseIoAsJson?: boolean;
  selectIOAndMetadata?: boolean;
}): Promise<FullEventsObservations> => {
  return getObservationsFromEventsGreptime({
    projectId: opts.projectId,
    filter: buildEventsPublicApiObservationsFilter(opts.props),
    limit: opts.limit,
    offset: (opts.page - 1) * opts.limit,
    selectIOAndMetadata: opts.selectIOAndMetadata ?? true,
    renderingProps: {
      shouldJsonParse: opts.parseIoAsJson ?? true,
      truncated: false,
    },
  });
};

export const getObservationsCountForPublicApiFromEventsGreptime = async (opts: {
  projectId: string;
  props: EventsPublicApiObservationsProps;
}): Promise<number> => {
  return getObservationsCountFromEventsGreptime({
    projectId: opts.projectId,
    filter: buildEventsPublicApiObservationsFilter(opts.props),
  });
};

/**
 * V2 cursor-paginated variant. Stable composite cursor `(start_time, trace_id, id)` DESC (the CH
 * version used `xxHash32(trace_id)` as the middle key; GreptimeDB orders on the raw trace_id with the
 * same cursor payload). Fetches `limit + 1` so the caller can detect "has more".
 */
export const getObservationsV2ForPublicApiFromEventsGreptime = async (opts: {
  projectId: string;
  props: EventsPublicApiObservationsProps;
  limit: number;
  cursor?: { lastStartTimeTo: Date; lastTraceId: string; lastId: string };
  selectIOAndMetadata?: boolean;
  parseIoAsJson?: boolean;
}) => {
  const { projectId } = opts;
  const compiled = buildObservationsTableQuery({
    projectId,
    filter: buildEventsPublicApiObservationsFilter(opts.props),
  });

  const cursorSql = opts.cursor
    ? `AND (o.start_time < :curTs
         OR (o.start_time = :curTs AND (o.trace_id < :curTrace
           OR (o.trace_id = :curTrace AND o.id < :curId))))`
    : "";
  const exclude = !opts.selectIOAndMetadata;

  const rows = await greptimeQuery<Record<string, unknown>>({
    query: `
      SELECT ${greptimeObservationSelect({ prefix: "o", excludeIo: exclude, excludeMetadata: exclude })}
      FROM observations o
      ${compiled.traceJoin ? "LEFT JOIN traces t ON t.id = o.trace_id AND t.project_id = o.project_id AND " + notDeleted("t") : ""}
      WHERE ${compiled.whereSql} AND ${notDeleted("o")}
        ${compiled.lookback ? "AND t.timestamp >= :obsTraceLookback" : ""}
        ${cursorSql}
      ORDER BY o.start_time DESC, o.trace_id DESC, o.id DESC
      LIMIT :limit`,
    params: {
      ...compiled.params,
      ...(compiled.lookback ? { obsTraceLookback: compiled.lookback } : {}),
      ...(opts.cursor
        ? {
            curTs: greptimeTsParam(opts.cursor.lastStartTimeTo),
            curTrace: opts.cursor.lastTraceId,
            curId: opts.cursor.lastId,
          }
        : {}),
      limit: opts.limit + 1,
    },
    readOnly: true,
  });

  const observations = rows.map((r) =>
    convertGreptimeObservationRowToDomain(r, {
      shouldJsonParse: opts.parseIoAsJson ?? false,
      truncated: false,
    }),
  );
  return enrichEventsObservations(observations, projectId);
};
