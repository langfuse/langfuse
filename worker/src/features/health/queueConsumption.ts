import { env } from "../../env";

/**
 * In-memory liveness signal for this container's BullMQ queue consumers.
 *
 * After Redis lock loss (FLUSHALL, key eviction, failover — see #15509 and
 * #13880) BullMQ workers can wedge permanently: the process stays alive and
 * connectivity checks pass, but no queue picks up jobs ever again. Because
 * default-on repeatable jobs (blob storage integration scheduler every 20
 * minutes, PostHog/Mixpanel schedulers hourly) keep a healthy worker busy at
 * least once per hour, "no job activity for longer than the threshold" is a
 * reliable per-container wedge signal that a liveness probe can act on.
 *
 * State is deliberately process-local (not Redis): each container must report
 * on its own consumption, and the failure modes we guard against include a
 * flushed or unreachable Redis.
 */

export type QueueConsumptionHealth = {
  /** Whether at least one BullMQ queue consumer is registered in this container. */
  enabled: boolean;
  /** Number of BullMQ workers registered in this container. */
  registeredWorkerCount: number;
  /** ISO timestamp of the first worker registration (observation baseline). */
  trackingSince: string | null;
  /** ISO timestamp of the last job pickup/completion, or null if none since boot. */
  lastActivityAt: string | null;
  /** Seconds since the last job activity, measured from registration if none yet. */
  secondsSinceLastActivity: number | null;
  /** Staleness threshold that flips `stuck` to true. */
  thresholdSeconds: number;
  /** True when no job activity happened within `thresholdSeconds`. */
  stuck: boolean;
};

let registeredWorkerCount = 0;
let trackingSinceMs: number | null = null;
let lastActivityMs: number | null = null;

/** Called by WorkerManager.register for every successfully registered worker. */
export const markQueueWorkerRegistered = (): void => {
  registeredWorkerCount += 1;
  if (trackingSinceMs === null) {
    trackingSinceMs = Date.now();
  }
};

/** Called on every BullMQ job pickup ("active") and completion ("completed"). */
export const markQueueJobActivity = (): void => {
  lastActivityMs = Date.now();
};

/** Test-only: module state is global, so tests must reset between cases. */
export const resetQueueConsumptionStateForTest = (): void => {
  registeredWorkerCount = 0;
  trackingSinceMs = null;
  lastActivityMs = null;
};

/**
 * `stuck` measures from the LATER of registration time and last job activity:
 * a fresh boot gets a full threshold of grace before the probe may fail, and a
 * container without any registered consumers (API-only) is never stuck.
 */
export const evaluateQueueConsumptionStuck = (input: {
  nowMs: number;
  registeredWorkerCount: number;
  trackingSinceMs: number | null;
  lastActivityMs: number | null;
  thresholdSeconds: number;
}): QueueConsumptionHealth => {
  const { nowMs, thresholdSeconds } = input;

  const enabled =
    input.registeredWorkerCount > 0 && input.trackingSinceMs !== null;

  const referenceMs = enabled
    ? Math.max(input.trackingSinceMs!, input.lastActivityMs ?? 0)
    : null;

  const secondsSinceLastActivity =
    referenceMs !== null
      ? Math.max(0, Math.round((nowMs - referenceMs) / 1000))
      : null;

  const stuck =
    enabled &&
    secondsSinceLastActivity !== null &&
    secondsSinceLastActivity > thresholdSeconds;

  return {
    enabled,
    registeredWorkerCount: input.registeredWorkerCount,
    trackingSince:
      input.trackingSinceMs !== null
        ? new Date(input.trackingSinceMs).toISOString()
        : null,
    lastActivityAt:
      input.lastActivityMs !== null
        ? new Date(input.lastActivityMs).toISOString()
        : null,
    secondsSinceLastActivity,
    thresholdSeconds,
    stuck,
  };
};

/** Evaluate this container's queue-consumption health. Purely in-memory. */
export const getQueueConsumptionHealth = (): QueueConsumptionHealth =>
  evaluateQueueConsumptionStuck({
    nowMs: Date.now(),
    registeredWorkerCount,
    trackingSinceMs,
    lastActivityMs,
    thresholdSeconds:
      env.LANGFUSE_QUEUE_CONSUMPTION_STUCK_THRESHOLD_MINUTES * 60,
  });
