import { redis } from "./redis";

/**
 * Redis-backed consecutive-failure counter for automations whose delivery does
 * NOT carry a DB failure window on the action config (monitor-alert, and the
 * project-notification Slack path — Slack configs have no
 * `lastFailingExecutionId`). Keyed by (projectId, automationId), 24h TTL.
 */
const automationFailureTtlSeconds = 24 * 60 * 60;
const automationFailureKey = (projectId: string, automationId: string) =>
  `automation-failures:${projectId}:${automationId}`;

/** automationFailureThreshold is the consecutive-failure count after which such an automation is auto-disabled (mirrors the DB-walk threshold of 5). */
export const automationFailureThreshold = 5;

/** incrementAutomationFailureCount bumps the consecutive-failure counter and refreshes the 24h TTL; returns the new count. */
export async function incrementAutomationFailureCount(args: {
  projectId: string;
  automationId: string;
}): Promise<number> {
  if (!redis) return 0;
  const key = automationFailureKey(args.projectId, args.automationId);
  const results = await redis
    .multi()
    .incr(key)
    .expire(key, automationFailureTtlSeconds)
    .exec();
  return Number(results?.[0]?.[1] ?? 0);
}

/** resetAutomationFailureCount clears the streak (after a successful delivery, an auto-disable, or a manual re-enable). */
export async function resetAutomationFailureCount(args: {
  projectId: string;
  automationId: string;
}): Promise<void> {
  if (!redis) return;
  await redis.del(automationFailureKey(args.projectId, args.automationId));
}
