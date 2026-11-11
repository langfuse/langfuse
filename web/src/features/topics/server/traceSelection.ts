import { z } from "zod";
import { TOPICS_BACKFILL_TRACE_LIMIT } from "../backfill-limit";
import { InvalidRequestError, type FilterState } from "@langfuse/shared";
import {
  topicExecutionInputSchema,
  topicIdSchema,
  topicTraceSelectionCriteriaSchema,
  topicTraceSelectionSnapshotSchema,
  TOPICS_MAX_TIME_RANGE_MS,
} from "@langfuse/shared/topics";
import {
  prisma as defaultPrisma,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import {
  selectTopicTraceRows,
  topicMatchingTraceIdsQuery,
} from "@langfuse/shared/topics/server";
import {
  getTopicSetupTraceCounts,
  getTopicSetupTraceIds,
  getTracingReadinessSettings,
} from "@langfuse/shared/src/server";

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
        TOPICS_MAX_TIME_RANGE_MS,
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

// Fallback when a project has no stored idle time; the setup flow always saves one.
const SETUP_DEFAULT_IDLE_MS = 600_000;
const SETUP_WINDOWS = [1, 7] as const;

async function topicSetupIdleMs(projectId: string) {
  const { traceIdleMs } = await getTracingReadinessSettings(projectId);
  return traceIdleMs ?? SETUP_DEFAULT_IDLE_MS;
}

/** The rule filter as a 7-day trace subquery; undefined without filters, null when nothing matches. */
async function setupMatching(
  projectId: string,
  filter: FilterState,
  now: Date,
) {
  if (filter.length === 0) return undefined;
  return topicMatchingTraceIdsQuery(
    {
      projectId,
      filter,
      from: new Date(now.getTime() - SETUP_WINDOWS[1] * 86_400_000),
      to: now,
    },
    defaultPrisma,
  );
}

/** Finished traces over 1 and 7 days that the first rule's filter selects. */
export async function countTopicSetupTraces(input: {
  projectId: string;
  filter: FilterState;
  now: Date;
}) {
  const matching = await setupMatching(
    input.projectId,
    input.filter,
    input.now,
  );
  if (matching === null) return { finished1d: 0, finished7d: 0 };
  return getTopicSetupTraceCounts({
    projectId: input.projectId,
    idleMs: await topicSetupIdleMs(input.projectId),
    now: input.now,
    matching,
  });
}

/** Widens from 1 to 7 days until the limit is met, so busy projects scan one day. */
export async function selectTopicSetupTraces(input: {
  projectId: string;
  filter: FilterState;
  sampling: number;
  limit: number;
  now: Date;
}) {
  const idleMs = await topicSetupIdleMs(input.projectId);
  let traceIds: string[] = [];
  let days: (typeof SETUP_WINDOWS)[number] = 1;
  const matching = await setupMatching(
    input.projectId,
    input.filter,
    input.now,
  );
  if (matching === null) return { traceIds, days };
  for (days of SETUP_WINDOWS) {
    traceIds = await getTopicSetupTraceIds({
      ...input,
      idleMs,
      days,
      matching,
    });
    if (traceIds.length >= input.limit) break;
  }
  return { traceIds, days };
}
