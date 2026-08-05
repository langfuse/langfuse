import { BaseError, type Plan } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { env } from "@langfuse/shared/src/env";
import { recordIncrement } from "@langfuse/shared/src/server";

/**
 * Flat safety ceiling on concurrent non-terminal runs, checked at admission.
 *
 * The daily `in-app-agent-run` bucket is also a burst allowance: it cannot stop
 * one organization from filling a region's execution slots for 15 minutes at a
 * time. This one count bounds queue depth, attached watches, poll load, worker
 * occupancy and model spend. It is a safety valve, not a plan entitlement.
 *
 * Only QUEUED and RUNNING rows have `finishedAt: null`. A parked approval sets
 * it, so it holds neither a worker nor the conversation slot and correctly does
 * not count.
 *
 * The ceiling is coarse by design. The check runs outside the run-creating
 * transaction, whose lock covers a single conversation and so cannot serialize
 * submits across conversations anyway; concurrent submits may overshoot by the
 * number of in-flight requests. The exact one-active-run-per-conversation
 * invariant stays with the partial unique index.
 */
export async function assertInAppAgentRunCapacity(params: {
  prisma: PrismaClient;
  orgId: string;
  plan: Plan;
  userId: string;
}): Promise<void> {
  // A run that outlived its own reconciliation deadline must not hold a slot
  // forever: conversation-scoped reconciliation only fires when that
  // conversation is read, and nothing this old can still be executing.
  const cutoff = new Date(
    Date.now() -
      env.LANGFUSE_IN_APP_AGENT_QUEUE_TIMEOUT_MS -
      env.LANGFUSE_IN_APP_AGENT_RUN_MAX_DURATION_MS,
  );

  // Grouped by user so one query answers both ceilings. Scoped through the
  // project relation rather than a session-derived project list, which only
  // holds the projects the caller can see and would undercount the org.
  const activeRunsByUser = await params.prisma.inAppAgentRun.groupBy({
    by: ["triggeredByUserId"],
    where: {
      project: { orgId: params.orgId },
      finishedAt: null,
      createdAt: { gt: cutoff },
    },
    _count: { _all: true },
  });

  const orgActiveRuns = activeRunsByUser.reduce(
    (total, group) => total + group._count._all,
    0,
  );
  const userActiveRuns =
    activeRunsByUser.find((group) => group.triggeredByUserId === params.userId)
      ?._count._all ?? 0;

  const perUser = env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER;
  const perOrg = env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_ORG;

  // User first, so the message names the limit the caller can act on.
  const exceeded =
    userActiveRuns >= perUser
      ? {
          limit: "user" as const,
          message: `You already have ${perUser} assistant runs in progress. Wait for one to finish.`,
        }
      : orgActiveRuns >= perOrg
        ? {
            limit: "org" as const,
            message: `Your organization is at its limit of ${perOrg} assistant runs in progress. Try again shortly.`,
          }
        : null;

  if (!exceeded) {
    return;
  }

  recordIncrement("langfuse.in_app_agent.run_capacity_rejected", 1, {
    plan: params.plan,
    limit: exceeded.limit,
  });

  throw new BaseError("TooManyRequestsError", 429, exceeded.message, true);
}
