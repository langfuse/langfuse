import { randomUUID } from "node:crypto";
import {
  EvalTemplateType,
  JobConfigState,
  TopicsTargetObject,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  QueueJobs,
  TopicsTraceQueue,
  type TraceBatchInputReference,
} from "@langfuse/shared/src/server";
import {
  TRACE_TRANSCRIPT_EVAL_CONSUMER,
  TRACE_TRANSCRIPT_EVAL_TYPES,
  enqueueTraceTranscriptEvals,
} from "./traceTranscriptEval";

export const JOB_MAX_AGE_MS = 2 * 60 * 60_000;

/** A queue that runs per-trace work from the stored transcript; it resolves its rule's definitions itself. */
type EventsDispatchEnqueueContext = {
  transcriptS3Path: string;
  /** The snapshot that seeded the trace, when it came from one. */
  batchActionId?: string;
};

type EventsDispatchConsumer = {
  name: string;
  evaluatorTypes: readonly EvalTemplateType[];
  enqueue: (
    reference: TraceBatchInputReference,
    ruleIds: string[],
    context: EventsDispatchEnqueueContext,
  ) => Promise<void>;
};

const TOPICS_CONSUMER: EventsDispatchConsumer = {
  name: "topics",
  evaluatorTypes: [EvalTemplateType.FACET],
  enqueue: async (reference, ruleIds, { batchActionId }) => {
    const queue = TopicsTraceQueue.getInstance({
      shardingKey: `${reference.projectId}-${reference.traceId}`,
    });
    if (!queue) throw new Error("Topics trace queue is unavailable.");
    await queue.add(
      QueueJobs.TopicsTraceJob,
      {
        name: QueueJobs.TopicsTraceJob,
        id: randomUUID(),
        timestamp: new Date(),
        payload: { ...reference, ruleIds, batchActionId },
      },
      {
        // A retried job within its lifetime never enqueues a trace revision twice.
        deduplication: {
          id: JSON.stringify([
            reference.projectId,
            reference.traceId,
            reference.revision,
          ]),
          ttl: JOB_MAX_AGE_MS,
        },
      },
    );
  },
};

const CONSUMERS: EventsDispatchConsumer[] = [
  TOPICS_CONSUMER,
  {
    name: TRACE_TRANSCRIPT_EVAL_CONSUMER,
    evaluatorTypes: TRACE_TRANSCRIPT_EVAL_TYPES,
    enqueue: enqueueTraceTranscriptEvals,
  },
];

// Matches the Topics consumer's settings cache; rule edits reach dispatch within this window.
const RULES_TTL_MS = 15_000;
const MAX_CACHED_PROJECTS = 10_000;
const ruleCache = new Map<
  string,
  { rules: Promise<Map<string, Set<EvalTemplateType>>>; expiresAt: number }
>();

/** Evaluator types of each active trace-level rule's runnable assignments. */
function ruleEvaluatorTypes(
  projectId: string,
): Promise<Map<string, Set<EvalTemplateType>>> {
  const now = Date.now();
  const cached = ruleCache.get(projectId);
  if (cached && cached.expiresAt > now) return cached.rules;
  if (ruleCache.size >= MAX_CACHED_PROJECTS) ruleCache.clear();
  const rules = prisma.evaluationRule
    .findMany({
      where: {
        projectId,
        status: JobConfigState.ACTIVE,
        targetObject: TopicsTargetObject,
      },
      select: {
        id: true,
        assignments: {
          where: { evaluator: { projectId, blockedAt: null } },
          select: { evaluator: { select: { type: true } } },
        },
      },
    })
    .then(
      (rows) =>
        new Map(
          rows.map((rule) => [
            rule.id,
            new Set(rule.assignments.map(({ evaluator }) => evaluator.type)),
          ]),
        ),
    );
  ruleCache.set(projectId, { rules, expiresAt: now + RULES_TTL_MS });
  rules.catch(() => ruleCache.delete(projectId));
  return rules;
}

/** A snapshot's traces go to Topics alone; its execution names the facets. */
export const SNAPSHOT_JOBS = [{ consumer: TOPICS_CONSUMER, ruleIds: [] }];

/** Routes recorded rule IDs to the consumers whose evaluator type each rule runs; unknown IDs are returned separately. */
export async function routeRules(
  projectId: string,
  ruleIds: string[],
): Promise<{
  jobs: { consumer: EventsDispatchConsumer; ruleIds: string[] }[];
  unresolved: string[];
}> {
  const types = await ruleEvaluatorTypes(projectId);
  const unresolved = ruleIds.filter((id) => !types.has(id));
  const jobs = CONSUMERS.flatMap((consumer) => {
    const selected = ruleIds.filter((id) =>
      consumer.evaluatorTypes.some((type) => types.get(id)?.has(type)),
    );
    return selected.length > 0 ? [{ consumer, ruleIds: selected }] : [];
  });
  return { jobs, unresolved };
}
