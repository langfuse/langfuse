import { prisma } from "@langfuse/shared/src/db";
import {
  BatchActionStatus,
  observationForEvalSchema,
  type ObservationRunEvaluationConfig,
} from "@langfuse/shared";
import { logger, traceException } from "@langfuse/shared/src/server";
import {
  createObservationEvalSchedulerDeps,
  scheduleObservationEvals,
  type ObservationEvalConfig,
} from "../evaluation/observationEval";
const BATCH_SIZE = 100;
const CONCURRENCY_LIMIT = 50;
const MAX_ERROR_LOG_LINES = 20;

function toNumericRecord(value: unknown): Record<string, number | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number | null>>(
    (acc, [key, rawValue]) => {
      if (typeof rawValue === "number") {
        acc[key] = rawValue;
      } else if (rawValue === null) {
        acc[key] = null;
      } else if (typeof rawValue === "string") {
        const parsed = Number(rawValue);
        if (!Number.isNaN(parsed)) {
          acc[key] = parsed;
        }
      }

      return acc;
    },
    {},
  );
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toObjectRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

export function toObservationForEval(record: unknown, projectId: string) {
  if (!record || typeof record !== "object") {
    throw new Error("Invalid events table row");
  }

  const row = record as Record<string, unknown>;
  if (!row.id || !row.trace_id) {
    throw new Error("Events row is missing required identifiers");
  }

  const observation = {
    span_id: row.id as string,
    trace_id: row.trace_id as string,
    project_id: projectId,
    parent_span_id: (row.parent_observation_id as string | null) ?? null,
    type: (row.type as string) ?? undefined,
    name: (row.name as string) ?? "",
    environment: (row.environment as string) ?? "default",
    version: (row.version as string | null) ?? undefined,
    level: (row.level as string) ?? undefined,
    status_message: (row.status_message as string | null) ?? undefined,
    trace_name: (row.trace_name as string | null) ?? undefined,
    user_id: (row.user_id as string | null) ?? undefined,
    session_id: (row.session_id as string | null) ?? undefined,
    tags: toStringArray(row.tags),
    release: (row.release as string | null) ?? undefined,
    provided_model_name:
      (row.provided_model_name as string | null) ?? undefined,
    model_parameters: row.model_parameters ?? null,
    prompt_id: (row.prompt_id as string | null) ?? undefined,
    prompt_name: (row.prompt_name as string | null) ?? undefined,
    prompt_version:
      typeof row.prompt_version === "number" ||
      typeof row.prompt_version === "string"
        ? row.prompt_version
        : null,
    // The ClickHouse events table doesn't distinguish between computed and
    // provided usage/cost details — both map to the same source column.
    // totalCost is added as the "total" key to match the normal ingestion path.
    provided_usage_details: toNumericRecord(
      row.provided_usage_details ?? row.usage_details,
    ),
    provided_cost_details: {
      ...toNumericRecord(row.provided_cost_details ?? row.cost_details),
      ...((row.total_cost as number | null) != null
        ? { total: row.total_cost as number }
        : {}),
    },
    usage_details: toNumericRecord(row.usage_details),
    cost_details: {
      ...toNumericRecord(row.cost_details),
      ...((row.total_cost as number | null) != null
        ? { total: row.total_cost as number }
        : {}),
    },
    tool_definitions: toObjectRecord(row.tool_definitions) ?? {},
    tool_calls: Array.isArray(row.tool_calls) ? row.tool_calls : [],
    tool_call_names: toStringArray(row.tool_call_names),
    experiment_id: null,
    experiment_name: null,
    experiment_description: null,
    experiment_dataset_id: null,
    experiment_item_id: null,
    experiment_item_expected_output: null,
    experiment_item_root_span_id: null,
    input: row.input ?? null,
    output: row.output ?? null,
    metadata: toObjectRecord(row.metadata),
  };

  return observationForEvalSchema.parse(observation);
}

export async function processBatchedObservationEval(params: {
  projectId: string;
  batchActionId: string;
  config: ObservationRunEvaluationConfig;
  evaluators: ObservationEvalConfig[];
  observationStream: AsyncIterable<unknown>;
}): Promise<void> {
  const { projectId, batchActionId, config, evaluators, observationStream } =
    params;
  const { default: pLimit } = await import("p-limit");
  const limit = pLimit(CONCURRENCY_LIMIT);
  const schedulerDeps = createObservationEvalSchedulerDeps();

  await prisma.batchAction.update({
    where: { id: batchActionId },
    data: {
      status: BatchActionStatus.Processing,
      totalCount: 0,
      processedCount: 0,
      failedCount: 0,
      log: null,
    },
  });

  let totalCount = 0;
  let processedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  let buffer: unknown[] = [];

  const processBatch = async (batch: unknown[]) => {
    const results = await Promise.allSettled(
      batch.map((record) =>
        limit(async () => {
          const observation = toObservationForEval(record, projectId);
          await scheduleObservationEvals({
            observation,
            configs: evaluators,
            schedulerDeps,
            ignoreConfigTargeting: true,
          });
        }),
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        processedCount++;
      } else {
        failedCount++;
        traceException(result.reason);

        if (errors.length < MAX_ERROR_LOG_LINES) {
          const errorMessage =
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error";
          errors.push(
            `Row ${totalCount - batch.length + i + 1}: ${errorMessage}`,
          );
        }
      }
    }

    await prisma.batchAction.update({
      where: { id: batchActionId },
      data: { totalCount, processedCount, failedCount },
    });
  };

  for await (const record of observationStream) {
    buffer.push(record);
    totalCount++;

    if (buffer.length >= BATCH_SIZE) {
      await processBatch(buffer);
      buffer = [];
    }
  }

  // Process remaining records
  if (buffer.length > 0) {
    await processBatch(buffer);
  }

  const finalStatus =
    failedCount === 0
      ? BatchActionStatus.Completed
      : processedCount === 0
        ? BatchActionStatus.Failed
        : BatchActionStatus.Partial;

  const errorSummary =
    errors.length > 0
      ? `${failedCount} observations failed while scheduling ${config.evaluators.length} evaluator(s): ${config.evaluators.map((evaluator) => evaluator.evaluatorName).join(", ")}.\n${errors.join("\n")}`
      : null;

  await prisma.batchAction.update({
    where: { id: batchActionId },
    data: {
      status: finalStatus,
      finishedAt: new Date(),
      totalCount,
      processedCount,
      failedCount,
      log: errorSummary,
    },
  });

  logger.info(`Completed observation-run-evaluation action ${batchActionId}`, {
    evaluatorConfigIds: config.evaluators.map(
      (evaluator) => evaluator.evaluatorConfigId,
    ),
    totalCount,
    processedCount,
    failedCount,
    finalStatus,
  });
}
