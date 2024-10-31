import {
  ObservationClickhouseRecord,
  TraceClickhouseRecord,
} from "../clickhouse/schema";
import { queryClickhouse } from "./clickhouse";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/clickhouse-filter/factory";
import { ObservationLevel } from "@prisma/client";
import { FilterState } from "../../types";
import { logger } from "../logger";
import { FilterList } from "../queries/clickhouse-filter/clickhouse-filter";

export const convertObservation = (record: ObservationClickhouseRecord) => {
  return {
    id: record.id,
    observationId: record.id,
    traceId: record.trace_id,
    projectId: record.project_id,
    type: record.type,
    parentObservationId: record.parent_observation_id,
    startTime: new Date(record.start_time),
    endTime: record.end_time ? new Date(record.end_time) : undefined,
    name: record.name,
    metadata: record.metadata,
    level: record.level as ObservationLevel,
    statusMessage: record.status_message,
    version: record.version,
    input: record.input,
    output: record.output,
    providedModelName: record.provided_model_name,
    internalModelId: record.internal_model_id,
    modelParameters: record.model_parameters,
    providedUsageDetails: record.provided_usage_details,
    usageDetails: record.usage_details,
    providedCostDetails: record.provided_cost_details,
    costDetails: record.cost_details,
    totalCost: record.total_cost,
    completionStartTime: record.completion_start_time
      ? new Date(record.completion_start_time)
      : undefined,
    promptId: record.prompt_id,
    promptName: record.prompt_name,
    promptVersion: record.prompt_version,
    createdAt: new Date(record.created_at),
    updatedAt: new Date(record.updated_at),
    eventTs: new Date(record.event_ts),
  };
};

export const getObservationsForTrace = async (
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
  const records = await queryClickhouse<ObservationClickhouseRecord>({
    query,
    params: { traceId, projectId },
  });

  return records.map((record) => {
    return {
      ...record,
      projectId: record.project_id,
      observationId: record.id,
      traceId: record.trace_id,
    };
  });
};
