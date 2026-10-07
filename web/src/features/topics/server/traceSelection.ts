import { z } from "zod";
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
      input.operation !== "update" ||
      input.timeRange.to.getTime() - input.timeRange.from.getTime() <=
        93 * 86_400_000,
    "Select a time range of at most 93 days.",
  );

export async function previewTopicTraces(
  input: z.infer<typeof topicTraceSelectionSchema>,
  prisma: PrismaClient,
) {
  const rows = await selectTopicTraceRows(input, prisma, "preview");
  const matchedTraceCount = Number(rows[0]?.matchedTraceCount ?? 0);
  return {
    matchedTraceCount,
    selectedTraceCount: Math.min(matchedTraceCount, input.limit ?? Infinity),
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
    { ...selection, projectId: input.projectId },
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
