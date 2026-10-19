import { z } from "zod";
import { TOPICS_BACKFILL_TRACE_LIMIT } from "../backfill-limit";
import { InvalidRequestError } from "@langfuse/shared";
import {
  topicExecutionInputSchema,
  topicIdSchema,
  topicTraceSelectionCriteriaSchema,
  topicTraceSelectionSnapshotSchema,
} from "@langfuse/shared/topics";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { selectTopicTraceRows } from "@langfuse/shared/topics/server";

export const topicTraceSelectionSchema =
  topicTraceSelectionCriteriaSchema.safeExtend({
    projectId: topicIdSchema,
    limit: topicTraceSelectionCriteriaSchema.shape.limit.refine(
      (limit) => limit === null || limit <= TOPICS_BACKFILL_TRACE_LIMIT,
      `Select at most ${TOPICS_BACKFILL_TRACE_LIMIT.toLocaleString("en-US")} traces.`,
    ),
  });

export const topicTriggerInputSchema = z
  .union([
    topicExecutionInputSchema,
    topicExecutionInputSchema.options[0].omit({ traceIds: true }).extend({
      selection: topicTraceSelectionSnapshotSchema,
    }),
  ])
  .refine(
    (input) =>
      input.operation !== "process" ||
      ("selection" in input
        ? input.selection.limit === null ||
          input.selection.limit <= TOPICS_BACKFILL_TRACE_LIMIT
        : input.traceIds.length <= TOPICS_BACKFILL_TRACE_LIMIT),
    `Select at most ${TOPICS_BACKFILL_TRACE_LIMIT.toLocaleString("en-US")} traces.`,
  )
  .refine(
    (input) =>
      input.operation !== "update" ||
      input.timeRange.to.getTime() - input.timeRange.from.getTime() <=
        93 * 86_400_000,
    "Select a time range of at most 93 days.",
  );

export async function previewTopicTraces(
  input: z.infer<typeof topicTraceSelectionSchema>,
  prisma: PrismaClient,
) {
  const selection = {
    ...input,
    limit: input.limit ?? TOPICS_BACKFILL_TRACE_LIMIT,
  };
  const rows = await selectTopicTraceRows(selection, prisma, "preview");
  const matchedTraceCount = Number(rows[0]?.matchedTraceCount ?? 0);
  return {
    matchedTraceCount,
    selectedTraceCount: Math.min(matchedTraceCount, selection.limit),
    traces: rows.map((row) => ({
      id: row.id,
      timestamp: new Date(Number(row.timestampMs)),
      name: row.name || null,
      environment: row.environment,
    })),
  };
}

export async function resolveTopicTraceSelection(
  input: z.infer<typeof topicTriggerInputSchema>,
  prisma: PrismaClient,
) {
  if (!("selection" in input)) return input;
  const { selection, ...execution } = input;
  const rows = await selectTopicTraceRows(
    {
      ...selection,
      limit: selection.limit ?? TOPICS_BACKFILL_TRACE_LIMIT,
      projectId: input.projectId,
    },
    prisma,
    "ids",
  );
  const excluded = new Set(selection.excludedTraceIds);
  const traceIds = rows
    .filter((trace) => !excluded.has(trace.id))
    .map((trace) => trace.id);
  if (traceIds.length === 0)
    throw new InvalidRequestError(
      "No traces match this selection. Refresh the preview.",
    );
  return topicExecutionInputSchema.parse({
    ...execution,
    traceIds,
  });
}
