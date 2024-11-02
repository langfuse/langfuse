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
import { getProjectIdDefaultFilter } from "../queries/clickhouse-filter/factory";
import {
  FilterList,
  StringFilter,
} from "../queries/clickhouse-filter/clickhouse-filter";
import { log, time, trace } from "console";
import {
  FullObservation,
  FullObservations,
} from "../queries/createGenerationsQuery";
import { legacyObservationCreateEvent } from "../ingestion/types";

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
  FROM observations FINAL WHERE id = {id: String} AND project_id = {projectId: String}`;
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
};

export const getObservationsTable = async (
  opts: ObservationTableQuery,
): Promise<FullObservations> => {
  const { projectId, filter, selectIOAndMetadata, limit, offset } = opts;
  logger.info(
    `Fetching observations for project ${projectId}, filter: ${filter}, selectIOAndMetadata: ${selectIOAndMetadata}, limit: ${limit}, offset: ${offset}`,
  );

  // const tracesFilter = new FilterList([
  //   new StringFilter({
  //     clickhouseTable: "traces",
  //     field: "project_id",
  //     operator: "=",
  //     value: projectId,
  //     tablePrefix: "t",
  //   }),
  // ]);
  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);
  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  // const appliedTracesFilter = tracesFilter.apply();
  const appliedScoresFilter = scoresFilter.apply();
  const appliedObservationsFilter = observationsFilter.apply();

  const query = `
      WITH scores_avg AS (
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
      )
      SELECT
        o.id,
        o.name,
        o."model_parameters",
        o.start_time as "start_time",
        o.end_time as "end_time",
        ${selectIOAndMetadata ? `o.input, o.output, o.metadata,` : ""} 
        o.trace_id as "trace_id",
        t.name as "trace_name",
        o.completion_start_time as "completion_start_time",
        o.provided_usage_details as "provided_usage_details",
        o.usage_details as "usage_details",
        o.provided_cost_details as "provided_cost_details",
        o.cost_details as "cost_details",
        o.level as level,
        o.status_message as "status_message",
        o.version as version,
        t.tags as "trace_tags",
        o.parent_observation_id as "parent_observation_id",
        o.created_at as "created_at",
        o.updated_at as "updated_at",
        o.provided_model_name as "provided_model_name",
        o.total_cost as "total_cost",
        internal_model_id as "internal_model_id",
        provided_model_name as "provided_model_name",
        if(isNull(end_time), NULL, date_diff('seconds', start_time, end_time)) as latency,
        if(isNull(completion_start_time), NULL,  date_diff('seconds', start_time, completion_start_time)) as time_to_first_token
      FROM observations o FINAL 
        LEFT JOIN traces t FINAL ON t.id = o.trace_id AND t.project_id = o.project_id
        LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = t.id and s_avg.observation_id = o.id
      WHERE ${appliedObservationsFilter.query}
      ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  logger.info(`Observations query: ${query}`);
  const records = await queryClickhouse<ObservationsTableQueryResult>({
    query,
    params: {
      // ...appliedTracesFilter.params,
      ...appliedScoresFilter.params,
      ...appliedObservationsFilter.params,
    },
  });

  const uniqueModels = Array.from(
    new Set(
      records
        .map((r) => r.internal_model_id)
        .filter((r) => r !== null && r !== undefined),
    ),
  );

  const models =
    uniqueModels.length > 0
      ? await prisma.model.findMany({
          where: {
            id: {
              in: Array.from(uniqueModels),
            },
            OR: [{ projectId: projectId }, { projectId: null }],
          },
          include: {
            Price: true,
          },
        })
      : [];

  return records.map((o) => {
    const model = models.find((p) => p.id === o.internal_model_id);
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
      projectId: projectId,
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
      traceName: o.trace_name ?? null,
      traceTags: o.trace_tags ?? [],
    };
  });
};
