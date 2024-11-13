import { commandClickhouse, queryClickhouse } from "./clickhouse";
import { Observation, ObservationLevel } from "@prisma/client";
import { logger } from "../logger";
import { InternalServerError, LangfuseNotFoundError } from "../../errors";
import { prisma } from "../../db";
import { ObservationRecordReadType } from "./definitions";
import { FilterState } from "../../types";
import {
  DateTimeFilter,
  FilterList,
  StringFilter,
} from "../queries/clickhouse-sql/clickhouse-filter";
import { FullObservations } from "../queries/createGenerationsQuery";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  observationsTableTraceUiColumnDefinitions,
  observationsTableUiColumnDefinitions,
} from "../../tableDefinitions";
import { TableCount } from "./types";
import { orderByToClickhouseSql } from "../queries/clickhouse-sql/orderby-factory";
import { OrderByState } from "../../interfaces/orderBy";
import { getTracesByIds } from "./traces";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import {
  convertObservationToView,
  convertObservation,
} from "./observations_converters";
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import { OBSERVATIONS_TO_TRACE_INTERVAL } from "./constants";

export const getObservationsViewForTrace = async (
  traceId: string,
  projectId: string,
  fetchWithInputOutput: boolean = false,
) => {
  const query = `
  SELECT
    id,
    trace_id,
    project_id,
    type,
    parent_observation_id,
    start_time,
    end_time,
    name,
    metadata,
    level,
    status_message,
    version,
    ${fetchWithInputOutput ? "input, output," : ""}
    provided_model_name,
    internal_model_id,
    model_parameters,
    provided_usage_details,
    usage_details,
    provided_cost_details,
    cost_details,
    total_cost,
    completion_start_time,
    prompt_id,
    prompt_name,
    prompt_version,
    created_at,
    updated_at,
    event_ts
  FROM observations 
  WHERE trace_id = {traceId: String}
  AND project_id = {projectId: String}
  ORDER BY event_ts DESC
  LIMIT 1 BY id, project_id`;
  const records = await queryClickhouse<ObservationRecordReadType>({
    query,
    params: { traceId, projectId },
  });

  return await Promise.all(
    records.map(async (o) => await convertObservationToView(o)),
  );
};

export const getObservationById = async (
  id: string,
  projectId: string,
  fetchWithInputOutput: boolean = false,
) => {
  const query = `
  SELECT
    id,
    trace_id,
    project_id,
    type,
    parent_observation_id,
    start_time,
    end_time,
    name,
    metadata,
    level,
    status_message,
    version,
    ${fetchWithInputOutput ? "input, output," : ""}
    provided_model_name,
    internal_model_id,
    model_parameters,
    provided_usage_details,
    usage_details,
    provided_cost_details,
    cost_details,
    total_cost,
    completion_start_time,
    prompt_id,
    prompt_name,
    prompt_version,
    created_at,
    updated_at,
    event_ts
  FROM observations WHERE id = {id: String} AND project_id = {projectId: String} ORDER BY event_ts desc LIMIT 1 by id, project_id`;
  const records = await queryClickhouse<ObservationRecordReadType>({
    query,
    params: { id, projectId },
  });

  const mapped = await Promise.all(
    records.map(async (r) => await convertObservation(r)),
  );

  if (mapped.length === 0) {
    throw new LangfuseNotFoundError(`Observation with id ${id} not found`);
  }

  if (mapped.length > 1) {
    logger.error(
      `Multiple observations found for id ${id} and project ${projectId}`,
    );
    throw new InternalServerError(
      `Multiple observations found for id ${id} and project ${projectId}`,
    );
  }
  return mapped.shift() as Observation;
};

export type ObservationTableQuery = {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  searchQuery?: string;
  limit?: number;
  offset?: number;
  selectIOAndMetadata?: boolean;
};

export type ObservationTableRecord = {
  id: string;
  projectId: string;
  traceId: string;
  observationCount: number;
  providedCostDetails: Record<string, number>;
  costDetails: Record<string, number>;
  usageDetails: Record<string, number>;
  providedUsageDetails: Record<string, number>;
  latencyMs: number;
  level: ObservationLevel;
  scoresAvg: Record<string, number>;
  scoresValues: Record<string, number>;
};

export type ObservationsTableQueryResult = ObservationRecordReadType & {
  latency?: string;
  time_to_first_token?: string;
  trace_tags?: string[];
  trace_name?: string;
  trace_user_id?: string;
};

export const getObservationsTableCount = async (opts: ObservationTableQuery) =>
  getObservationsTableInternal<TableCount>({
    ...opts,
    select: "count(*) as count",
  });

export const getObservationsTable = async (
  opts: ObservationTableQuery,
): Promise<FullObservations> => {
  const observationRecords = await getObservationsTableInternal<
    Omit<
      ObservationsTableQueryResult,
      "trace_tags" | "trace_name" | "trace_user_id" | "type"
    >
  >({
    ...opts,
    select: `
        o.id as id,
        o.name as name,
        o."model_parameters" as model_parameters,
        o.start_time as "start_time",
        o.end_time as "end_time",
        o.trace_id as "trace_id",
        o.completion_start_time as "completion_start_time",
        o.provided_usage_details as "provided_usage_details",
        o.usage_details as "usage_details",
        o.provided_cost_details as "provided_cost_details",
        o.cost_details as "cost_details",
        o.level as level,
        o.status_message as "status_message",
        o.version as version,
        o.parent_observation_id as "parent_observation_id",
        o.created_at as "created_at",
        o.updated_at as "updated_at",
        o.provided_model_name as "provided_model_name",
        o.total_cost as "total_cost",
        internal_model_id as "internal_model_id",
        provided_model_name as "provided_model_name",
        if(isNull(end_time), NULL, date_diff('milliseconds', start_time, end_time)) as latency,
        if(isNull(completion_start_time), NULL,  date_diff('milliseconds', start_time, completion_start_time)) as "time_to_first_token"`,
  });

  const uniqueModels: string[] = Array.from(
    new Set(
      observationRecords
        .map((r) => r.internal_model_id)
        .filter((r): r is string => Boolean(r)),
    ),
  );

  const [models, traces] = await Promise.all([
    uniqueModels.length > 0
      ? prisma.model.findMany({
          where: {
            id: {
              in: uniqueModels,
            },
            OR: [{ projectId: opts.projectId }, { projectId: null }],
          },
          include: {
            Price: true,
          },
        })
      : [],
    getTracesByIds(
      observationRecords
        .map((o) => o.trace_id)
        .filter((o): o is string => Boolean(o)),
      opts.projectId,
    ),
  ]);

  return await Promise.all(
    observationRecords.map(async (o) => {
      const model = models.find((p) => p.id === o.internal_model_id);
      const trace = traces.find((t) => t.id === o.trace_id);
      return {
        ...(await convertObservationToView(
          { ...o, type: "GENERATION" },
          model,
        )),
        latency: o.latency ? Number(o.latency) / 1000 : null,
        timeToFirstToken: o.time_to_first_token
          ? Number(o.time_to_first_token) / 1000
          : null,
        traceName: trace?.name ?? null,
        traceTags: trace?.tags ?? [],
        userId: trace?.userId ?? null,
      };
    }),
  );
};

const getObservationsTableInternal = async <T>(
  opts: ObservationTableQuery & { select: string },
): Promise<Array<T>> => {
  const { projectId, filter, selectIOAndMetadata, limit, offset, orderBy } =
    opts;

  const selectString = selectIOAndMetadata
    ? `
    ${opts.select},
    ${selectIOAndMetadata ? `o.input, o.output, o.metadata` : ""}
  `
    : opts.select;

  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);

  const timeFilter = opts.filter.find(
    (f) =>
      f.column === "Start Time" && (f.operator === ">=" || f.operator === ">"),
  );

  // query optimisation: joining traces onto observations is expensive. Hence, only join if the UI table contains filters on traces.
  const traceTableFilter = opts.filter.filter(
    (f) =>
      observationsTableTraceUiColumnDefinitions
        .map((c) => c.uiTableId)
        .includes(f.column) ||
      observationsTableTraceUiColumnDefinitions
        .map((c) => c.uiTableName)
        .includes(f.column),
  );

  timeFilter
    ? scoresFilter.push(
        new DateTimeFilter({
          clickhouseTable: "scores",
          field: "timestamp",
          operator: ">=",
          value: timeFilter.value as Date,
        }),
      )
    : undefined;

  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      filter,
      observationsTableUiColumnDefinitions,
    ),
  );

  const appliedScoresFilter = scoresFilter.apply();
  const appliedObservationsFilter = observationsFilter.apply();

  const search = clickhouseSearchCondition(opts.searchQuery);

  const scoresCte = `WITH scores_avg AS (
    SELECT
      trace_id,
      observation_id,
       groupArray(tuple(name, avg_value)) AS "scores_avg"
    FROM (
      SELECT
        trace_id,
        observation_id,
        name,
        avg(value) avg_value,
        comment
      FROM
        scores final
      WHERE ${appliedScoresFilter.query}
      GROUP BY
        trace_id,
        observation_id,
        name,
        comment
      ORDER BY
        trace_id
      ) tmp
    GROUP BY
      trace_id, 
      observation_id
  )`;

  if (traceTableFilter.length > 0) {
    // joins with traces are very expensive. We need to filter by time as well.
    // We assume that a trace has to have been within the last 2 days to be relevant.

    const query = `
      ${scoresCte}
      SELECT
       ${selectString}
      FROM observations o FINAL 
        LEFT JOIN traces t FINAL ON t.id = o.trace_id AND t.project_id = o.project_id
        LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = o.trace_id and s_avg.observation_id = o.id
      WHERE ${appliedObservationsFilter.query}
        AND o.type = 'GENERATION'
        ${timeFilter ? `AND t.timestamp > {tracesTimestampFilter: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
        ${search.query}
      ${orderByToClickhouseSql(orderBy ?? null, observationsTableUiColumnDefinitions)}
      ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

    const res = await queryClickhouse<T>({
      query,
      params: {
        ...appliedScoresFilter.params,
        ...appliedObservationsFilter.params,
        ...(timeFilter
          ? {
              tracesTimestampFilter: convertDateToClickhouseDateTime(
                timeFilter.value as Date,
              ),
            }
          : {}),
        ...search.params,
      },
    });

    return res;
  } else {
    // we query by T, which could also be {count: string}.
    const query = `
      ${scoresCte}
      SELECT
       ${selectString}
      FROM observations o FINAL 
        LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = o.trace_id and s_avg.observation_id = o.id
      WHERE ${appliedObservationsFilter.query}
      ${orderByToClickhouseSql(orderBy ?? null, observationsTableUiColumnDefinitions)}
      ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

    const res = await queryClickhouse<T>({
      query,
      params: {
        ...appliedScoresFilter.params,
        ...appliedObservationsFilter.params,
      },
    });

    return res;
  }
};

export const getObservationsGroupedByModel = async (
  projectId: string,
  filter: FilterState,
) => {
  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      filter,
      observationsTableUiColumnDefinitions,
    ),
  );

  const appliedObservationsFilter = observationsFilter.apply();

  const query = `

    SELECT
      o.provided_model_name as name
    FROM observations o FINAL
    WHERE ${appliedObservationsFilter.query}
    AND o.type = 'GENERATION'
    GROUP BY o.provided_model_name
    ORDER BY count() DESC
    LIMIT 1000;
    `;

  const res = await queryClickhouse<{ name: string }>({
    query,
    params: {
      ...appliedObservationsFilter.params,
    },
  });
  return res.map((r) => ({ model: r.name }));
};

export const getObservationsGroupedByName = async (
  projectId: string,
  filter: FilterState,
) => {
  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      filter,
      observationsTableUiColumnDefinitions,
    ),
  );

  const appliedObservationsFilter = observationsFilter.apply();

  const query = `

    SELECT
      o.name as name
    FROM observations o FINAL
    WHERE ${appliedObservationsFilter.query}
    AND o.type = 'GENERATION'
    GROUP BY o.name
    ORDER BY count() DESC
    LIMIT 1000;
    `;

  const res = await queryClickhouse<{ name: string }>({
    query,
    params: {
      ...appliedObservationsFilter.params,
    },
  });
  return res;
};

export const getObservationsGroupedByPromptName = async (
  projectId: string,
  filter: FilterState,
) => {
  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      filter,
      observationsTableUiColumnDefinitions,
    ),
  );

  const appliedObservationsFilter = observationsFilter.apply();

  const query = `
    SELECT
      o.prompt_id as id
    FROM observations o FINAL
    WHERE ${appliedObservationsFilter.query}
    AND o.type = 'GENERATION'
    AND o.prompt_id IS NOT NULL
    GROUP BY o.prompt_id
    ORDER BY count() DESC
    LIMIT 1000;
    `;

  const res = await queryClickhouse<{ id: string }>({
    query,
    params: {
      ...appliedObservationsFilter.params,
    },
  });

  const prompts = res.map((r) => r.id).filter((r): r is string => Boolean(r));

  const pgPrompts =
    prompts.length > 0
      ? await prisma.prompt.findMany({
          select: {
            id: true,
            name: true,
          },
          where: {
            id: {
              in: prompts,
            },
            projectId,
          },
        })
      : [];

  return pgPrompts.map((p) => ({
    promptName: p.name,
  }));
};

export const getCostForTraces = async (
  projectId: string,
  traceIds: string[],
) => {
  const query = `
    SELECT
      sum(o.total_cost) as total_cost
    FROM observations o FINAL
    WHERE o.project_id = {projectId: String}
    AND o.trace_id IN ({traceIds: Array(String)});
    `;

  const res = await queryClickhouse<{ total_cost: string }>({
    query,
    params: {
      projectId,
      traceIds,
    },
  });
  return res.length > 0 ? Number(res[0].total_cost) : undefined;
};

export const deleteObservationsByTraceIds = async (
  projectId: string,
  traceIds: string[],
) => {
  const query = `
    DELETE FROM observations
    WHERE project_id = {projectId: String}
    AND trace_id IN ({traceIds: Array(String)});
  `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
      traceIds,
    },
  });
};

export const getObservationsWithPromptName = async (
  projectId: string,
  promptName: string,
) => {
  const query = `
  SELECT count(*) as count
  FROM observations FINAL
  WHERE project_id = {projectId: String}
  AND prompt_name = {promptName: String};
`;
  const rows = await queryClickhouse<{ count: string }>({
    query: query,
    params: {
      projectId,
      promptName,
    },
  });

  return rows.map((r) => Number(r.count)).shift() ?? undefined;
};
