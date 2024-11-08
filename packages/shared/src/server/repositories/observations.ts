import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import {
  Model,
  Observation,
  ObservationLevel,
  ObservationType,
  ObservationView,
  Price,
} from "@prisma/client";
import { logger } from "../logger";
import { InternalServerError, LangfuseNotFoundError } from "../../errors";
import Decimal from "decimal.js";
import { prisma } from "../../db";
import { jsonSchema } from "../../utils/zod";
import { ObservationRecordReadType } from "./definitions";
import { FilterState } from "../../types";
import {
  DateTimeFilter,
  FilterList,
  StringFilter,
} from "../queries/clickhouse-filter/clickhouse-filter";
import { FullObservations } from "../queries/createGenerationsQuery";
import { createFilterFromFilterState } from "../queries/clickhouse-filter/factory";
import {
  observationsTableTraceUiColumnDefinitions,
  observationsTableUiColumnDefinitions,
} from "../../tableDefinitions";
import { TableCount } from "./types";
import { orderByToClickhouseSql } from "../queries/clickhouse-filter/orderby-factory";
import { OrderByState } from "../../interfaces/orderBy";
import { getTracesByIds } from "./traces";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";

export const convertObservation = async (
  record: ObservationRecordReadType,
): Promise<Observation> => {
  const model = record.internal_model_id
    ? await prisma.model.findFirst({
        where: {
          id: record.internal_model_id,
        },
        include: {
          Price: true,
        },
      })
    : undefined;
  return await convertObservationAndModel(record, model ?? undefined);
};

export const convertObservationToView = async (
  record: ObservationRecordReadType,
): Promise<ObservationView> => {
  const model = record.internal_model_id
    ? await prisma.model.findFirst({
        where: {
          id: record.internal_model_id,
        },
        include: {
          Price: true,
        },
      })
    : undefined;
  return {
    ...(await convertObservationAndModel(record, model ?? undefined)),
    latency: record.end_time
      ? parseClickhouseUTCDateTimeFormat(record.end_time).getTime() -
        parseClickhouseUTCDateTimeFormat(record.start_time).getTime()
      : null,
    timeToFirstToken: record.completion_start_time
      ? parseClickhouseUTCDateTimeFormat(record.start_time).getTime() -
        parseClickhouseUTCDateTimeFormat(record.completion_start_time).getTime()
      : null,
    inputPrice:
      model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
    outputPrice:
      model?.Price?.find((m) => m.usageType === "output")?.price ?? null,
    totalPrice:
      model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
    promptName: record.prompt_name ?? null,
    promptVersion: record.prompt_version ?? null,
    modelId: record.internal_model_id ?? null,
  };
};

const convertObservationAndModel = async (
  record: ObservationRecordReadType,
  model?: Model & { Price: Price[] },
): Promise<Observation> => {
  return {
    id: record.id,
    traceId: record.trace_id ?? null,
    projectId: record.project_id,
    type: record.type as ObservationType,
    parentObservationId: record.parent_observation_id ?? null,
    startTime: parseClickhouseUTCDateTimeFormat(record.start_time),
    endTime: record.end_time
      ? parseClickhouseUTCDateTimeFormat(record.end_time)
      : null,
    name: record.name ?? null,
    metadata: record.metadata,
    level: record.level as ObservationLevel,
    statusMessage: record.status_message ?? null,
    version: record.version ?? null,
    input: jsonSchema.nullish().parse(record.input) ?? null,
    output: jsonSchema.nullish().parse(record.output) ?? null,
    modelParameters: jsonSchema.nullable().parse(record.model_parameters),
    completionStartTime: record.completion_start_time
      ? parseClickhouseUTCDateTimeFormat(record.completion_start_time)
      : null,
    promptId: record.prompt_id ?? null,
    createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
    promptTokens: record.usage_details?.input
      ? Number(record.usage_details?.input)
      : 0,
    completionTokens: record.usage_details?.output
      ? Number(record.usage_details?.output)
      : 0,
    totalTokens: record.usage_details?.total
      ? Number(record.usage_details?.total)
      : 0,
    calculatedInputCost: record.cost_details?.input
      ? new Decimal(record.cost_details.input)
      : null,
    calculatedOutputCost: record.cost_details?.output
      ? new Decimal(record.cost_details.output)
      : null,
    calculatedTotalCost: record.cost_details?.total
      ? new Decimal(record.cost_details.total)
      : null,
    inputCost: record.cost_details?.input
      ? new Decimal(record.cost_details?.input)
      : null,
    outputCost: record.cost_details?.output
      ? new Decimal(record.cost_details?.output)
      : null,
    totalCost: record.total_cost ? new Decimal(record.total_cost) : null,
    model: record.provided_model_name ?? null,
    internalModelId: record.internal_model_id ?? null,
    internalModel: model?.modelName ?? null, // to be removed
    unit: "TOKENS", // to be removed.
  };
};

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
  FROM observations FINAL WHERE trace_id = {traceId: String} AND project_id = {projectId: String}`;
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
      "trace_tags" | "trace_name" | "trace_user_id"
    >
  >({
    ...opts,
    //t.name as "trace_name",
    //t.user_id as "trace_user_id",
    // t.tags as "trace_tags",
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
        if(isNull(end_time), NULL, date_diff('seconds', start_time, end_time)) as latency,
        if(isNull(completion_start_time), NULL,  date_diff('seconds', start_time, completion_start_time)) as "time_to_first_token"`,
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

  return observationRecords.map((o) => {
    const model = models.find((p) => p.id === o.internal_model_id);
    const trace = traces.find((t) => t.id === o.trace_id);
    return {
      id: o.id,
      type: "GENERATION",
      name: o.name ?? null,
      level: o.level as ObservationLevel,
      version: o.version ?? null,
      input: o.input ?? null,
      output: o.output ?? null,
      metadata: o.metadata,
      traceId: o.trace_id ?? null,
      projectId: o.project_id,
      startTime: parseClickhouseUTCDateTimeFormat(o.start_time),
      endTime: o.end_time ? parseClickhouseUTCDateTimeFormat(o.end_time) : null,
      parentObservationId: o.parent_observation_id ?? null,
      statusMessage: o.status_message ?? null,
      createdAt: parseClickhouseUTCDateTimeFormat(o.created_at),
      updatedAt: parseClickhouseUTCDateTimeFormat(o.updated_at),
      model: o.provided_model_name ?? null,
      modelParameters: o.model_parameters ?? null,
      promptTokens: o.usage_details?.input ? Number(o.usage_details?.input) : 0,
      completionTokens: o.usage_details?.output
        ? Number(o.usage_details?.output)
        : 0,
      totalTokens: o.usage_details?.total ? Number(o.usage_details?.total) : 0,
      unit: "TOKENS",
      calculatedInputCost: o.cost_details?.input
        ? new Decimal(o.cost_details.input)
        : null,
      calculatedOutputCost: o.cost_details?.output
        ? new Decimal(o.cost_details.output)
        : null,
      calculatedTotalCost: o.total_cost ? new Decimal(o.total_cost) : null,
      completionStartTime: o.completion_start_time
        ? parseClickhouseUTCDateTimeFormat(o.completion_start_time)
        : null,
      latency: o.latency ? Number(o.latency) : null,
      timeToFirstToken: o.time_to_first_token
        ? Number(o.time_to_first_token)
        : null,
      promptId: o.prompt_id ?? null,
      promptName: o.prompt_name ?? null,
      promptVersion: o.prompt_version ?? null,
      modelId: o.internal_model_id ?? null,
      inputPrice:
        model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
      outputPrice:
        model?.Price?.find((m) => m.usageType === "output")?.price ?? null,
      totalPrice:
        model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
      traceName: trace?.name ?? null,
      traceTags: trace?.tags ?? [],
      userId: trace?.userId ?? null,
    };
  });
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
        ${timeFilter ? `AND t.timestamp > {tracesTimestampFilter: DateTime64} - INTERVAL 2 DAY` : ""}
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
