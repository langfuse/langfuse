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
import { log } from "console";
import { FullObservation } from "../queries/createGenerationsQuery";

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

export const getObservationsTable = async (
  opts: ObservationTableQuery,
): FullObservations => {
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
  // const scoresFilter = new FilterList([
  //   new StringFilter({
  //     clickhouseTable: "scores",
  //     field: "project_id",
  //     operator: "=",
  //     value: projectId,
  //   }),
  // ]);
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
  // const appliedScoresFilter = scoresFilter.apply();
  const appliedObservationsFilter = observationsFilter.apply();

  const query = `
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
      FROM observations o FINAL LEFT JOIN traces t FINAL ON t.id = o.trace_id AND t.project_id = o.project_id
        where 
          ${appliedObservationsFilter.query}
      ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const records = await queryClickhouse<ObservationRecordReadType>({
    query,
    params: {
      // ...appliedTracesFilter.params,
      // ...appliedScoresFilter.params,
      ...appliedObservationsFilter.params,
    },
  });

  return records.map((o) => ({
    id: o.id,
    type: "GENERATION",
    name: o.name,
    level: o.level,
    version: o.version,
    input: o.input,
    output: o.output,
    metadata: o.metadata,
    traceId: o.trace_id,
    projectId: projectId,
    startTime: parseClickhouseUTCDateTimeFormat(o.start_time),
    endTime: o.end_time ? parseClickhouseUTCDateTimeFormat(o.end_time) : null,
    parentObservationId: o.parent_observation_id,
    statusMessage: o.status_message,
    createdAt: parseClickhouseUTCDateTimeFormat(o.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(o.updated_at),
    model: o.provided_model_name,
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

    //   completionStartTime: Date | null;
    //   promptId: string | null;
    //   promptName: string | null;
    //   promptVersion: number | null;
    //   modelId: string | null;
    //   inputPrice: Decimal | null;
    //   outputPrice: Decimal | null;
    //   totalPrice: Decimal | null;
    //   latency: number | null;
    //   timeToFirstToken: number | null;
  }));
};

// type FullObservation = AdditionalObservationFields & {
//   id: string;
//   type: $Enums.ObservationType;
//   name: string | null;
//   metadata: JsonValue | null;
//   level: $Enums.ObservationLevel;
//   version: string | null;
//   input: JsonValue | null;
//   output: JsonValue | null;
//   traceId: string | null;
//   projectId: string;
//   startTime: Date;
//   endTime: Date | null;
//   parentObservationId: string | null;
//   statusMessage: string | null;
//   createdAt: Date;
//   updatedAt: Date;
//   model: string | null;
//   modelParameters: JsonValue | null;
//   promptTokens: number;
//   completionTokens: number;
//   totalTokens: number;
//   unit: string | null;
//   calculatedInputCost: Decimal | null;
//   calculatedOutputCost: Decimal | null;
//   calculatedTotalCost: Decimal | null;
//   completionStartTime: Date | null;
//   promptId: string | null;
//   promptName: string | null;
//   promptVersion: number | null;
//   modelId: string | null;
//   inputPrice: Decimal | null;
//   outputPrice: Decimal | null;
//   totalPrice: Decimal | null;
//   latency: number | null;
//   timeToFirstToken: number | null;
// }
