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
import { type BatchExportEventsRow } from "../database-read-stream/types";

const BATCH_SIZE = 100;
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

function parseEventRow(record: unknown): BatchExportEventsRow {
  if (!record || typeof record !== "object") {
    throw new Error("Invalid events table row");
  }

  const row = record as Partial<BatchExportEventsRow>;
  if (!row.id || !row.traceId) {
    throw new Error("Events row is missing required identifiers");
  }

  return row as BatchExportEventsRow;
}

export function toObservationForEval(record: unknown, projectId: string) {
  const row = parseEventRow(record);

  const observation = {
    span_id: row.id,
    trace_id: row.traceId,
    project_id: projectId,
    parent_span_id: row.parentObservationId,
    type: row.type,
    name: row.name ?? "",
    environment: row.environment ?? "default",
    version: row.version,
    level: row.level,
    status_message: row.statusMessage,
    trace_name: row.traceName,
    user_id: row.userId,
    session_id: row.sessionId,
    tags: toStringArray(row.tags),
    release: row.release,
    provided_model_name: row.providedModelName,
    model_parameters: row.modelParameters ?? null,
    prompt_id: row.promptId,
    prompt_name: row.promptName,
    prompt_version:
      typeof row.promptVersion === "number" ||
      typeof row.promptVersion === "string"
        ? row.promptVersion
        : null,
    // The ClickHouse events table doesn't distinguish between computed and
    // provided usage/cost details — both map to the same source column.
    // totalCost is added as the "total" key to match the normal ingestion path.
    provided_usage_details: toNumericRecord(row.usageDetails),
    provided_cost_details: {
      ...toNumericRecord(row.costDetails),
      ...(row.totalCost != null ? { total: row.totalCost } : {}),
    },
    usage_details: toNumericRecord(row.usageDetails),
    cost_details: {
      ...toNumericRecord(row.costDetails),
      ...(row.totalCost != null ? { total: row.totalCost } : {}),
    },
    // Tool fields are not available from the events export stream.
    // Evaluators depending on tool variables will receive empty values.
    tool_definitions: {},
    tool_calls: [],
    tool_call_names: [],
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
      batch.map(async (record) => {
        const observation = toObservationForEval(record, projectId);
        await scheduleObservationEvals({
          observation,
          configs: evaluators,
          schedulerDeps,
          ignoreConfigTargeting: true,
        });
      }),
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
