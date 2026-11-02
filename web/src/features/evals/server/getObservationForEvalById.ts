import {
  DEFAULT_TRACE_ENVIRONMENT,
  getEventsStreamForEval,
  getObservationByIdFromObservationsTable,
} from "@langfuse/shared/src/server";
import {
  LangfuseNotFoundError,
  observationForEvalSchema,
  type ObservationForEval,
} from "@langfuse/shared";
import { env } from "@/src/env.mjs";

export async function getObservationForEvalById(params: {
  projectId: string;
  id: string;
  traceId: string;
  startTime: Date;
  shouldReadFromObservationsTable?: boolean;
}): Promise<ObservationForEval> {
  if (
    env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true" ||
    params.shouldReadFromObservationsTable
  ) {
    return getObservationForEvalByIdFromLegacyObservations(params);
  }

  const startTimeUpperBound = new Date(params.startTime.getTime() + 1);
  const stream = await getEventsStreamForEval({
    projectId: params.projectId,
    filter: [
      {
        type: "string",
        column: "traceId",
        operator: "=",
        value: params.traceId,
      },
      {
        type: "datetime",
        column: "startTime",
        operator: ">=",
        value: params.startTime,
      },
      {
        type: "datetime",
        column: "startTime",
        operator: "<",
        value: startTimeUpperBound,
      },
      {
        type: "stringOptions",
        column: "id",
        operator: "any of",
        value: [params.id],
      },
    ],
    rowLimit: 1,
  });

  for await (const row of stream) {
    return observationForEvalSchema.parse(row);
  }

  throw new LangfuseNotFoundError("Observation not found");
}

async function getObservationForEvalByIdFromLegacyObservations(params: {
  projectId: string;
  id: string;
  traceId: string;
  startTime: Date;
}): Promise<ObservationForEval> {
  const observation = await getObservationByIdFromObservationsTable({
    projectId: params.projectId,
    id: params.id,
    traceId: params.traceId,
    startTime: params.startTime,
    fetchWithInputOutput: true,
  }).catch((error) => {
    if (error instanceof LangfuseNotFoundError) {
      throw new LangfuseNotFoundError("Observation not found");
    }
    throw error;
  });

  if (!observation) {
    throw new LangfuseNotFoundError("Observation not found");
  }

  return observationForEvalSchema.parse({
    span_id: observation.id,
    trace_id: observation.traceId,
    project_id: params.projectId,
    parent_span_id: observation.parentObservationId,
    type: observation.type,
    name: observation.name ?? "",
    environment: observation.environment ?? DEFAULT_TRACE_ENVIRONMENT,
    version: observation.version,
    level: observation.level,
    status_message: observation.statusMessage,
    trace_name: null,
    user_id: null,
    session_id: null,
    tags: [],
    release: null,
    provided_model_name: observation.model,
    model_parameters: observation.modelParameters,
    prompt_id: observation.promptId,
    prompt_name: observation.promptName,
    prompt_version: observation.promptVersion,
    provided_usage_details: observation.providedUsageDetails ?? {},
    provided_cost_details: observation.providedCostDetails ?? {},
    usage_details: observation.usageDetails ?? {},
    cost_details: observation.costDetails ?? {},
    tool_definitions: observation.toolDefinitions ?? {},
    tool_calls: observation.toolCalls ?? [],
    tool_call_names: observation.toolCallNames ?? [],
    tool_call_count: observation.toolCallNames?.length ?? 0,
    experiment_id: null,
    experiment_name: null,
    experiment_description: null,
    experiment_dataset_id: null,
    experiment_item_id: null,
    experiment_item_expected_output: null,
    experiment_item_metadata: null,
    experiment_item_root_span_id: null,
    input: observation.input,
    output: observation.output,
    metadata: observation.metadata,
  });
}
