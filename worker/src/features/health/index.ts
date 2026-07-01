import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { Response } from "express";

import { env } from "../../env";
import {
  getLastProcessedPartition,
  getLastRunStartedAt,
} from "../eventPropagation/handleEventPropagationJob";

export type EventPropagationHealth = {
  /** Whether the dual-write / event-propagation job runs in this deployment. */
  enabled: boolean;
  /** ISO timestamp of the last run start, or null if it has not run yet. */
  lastRunStartedAt: string | null;
  /** Seconds since the last run started, or null if it has not run yet. */
  secondsSinceLastRun: number | null;
  /** Informational: seconds between now and the last processed partition. */
  propagationDelaySeconds: number | null;
  /** Raw cursor value (partition timestamp) for debugging. */
  lastProcessedPartition: string | null;
  /** Staleness threshold that flips `stuck` to true. */
  thresholdSeconds: number;
  /** True when the job has not started a run within `thresholdSeconds`. */
  stuck: boolean;
};

const isEventPropagationEnabled = (): boolean =>
  env.QUEUE_CONSUMER_EVENT_PROPAGATION_QUEUE_IS_ENABLED === "true" &&
  env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "dual";

/**
 * `stuck` is intentionally only true when we have a reading that exceeds the
 * threshold. A missing heartbeat (job never ran yet — e.g. fresh boot or during
 * a rollout) is treated as NOT stuck to avoid restart loops before the first
 * scheduled run. A disabled job is never stuck.
 */
export const evaluateEventPropagationStuck = (input: {
  enabled: boolean;
  nowMs: number;
  lastRunStartedAtMs: number | null;
  lastProcessedPartition: string | null;
  thresholdSeconds: number;
}): EventPropagationHealth => {
  const {
    enabled,
    nowMs,
    lastRunStartedAtMs,
    lastProcessedPartition,
    thresholdSeconds,
  } = input;

  const secondsSinceLastRun =
    lastRunStartedAtMs !== null
      ? Math.max(0, Math.round((nowMs - lastRunStartedAtMs) / 1000))
      : null;

  let propagationDelaySeconds: number | null = null;
  if (lastProcessedPartition) {
    const partitionMs = new Date(lastProcessedPartition).getTime();
    if (!Number.isNaN(partitionMs)) {
      propagationDelaySeconds = Math.max(
        0,
        Math.round((nowMs - partitionMs) / 1000),
      );
    }
  }

  const stuck =
    enabled &&
    secondsSinceLastRun !== null &&
    secondsSinceLastRun > thresholdSeconds;

  return {
    enabled,
    lastRunStartedAt:
      lastRunStartedAtMs !== null
        ? new Date(lastRunStartedAtMs).toISOString()
        : null,
    secondsSinceLastRun,
    propagationDelaySeconds,
    lastProcessedPartition: lastProcessedPartition ?? null,
    thresholdSeconds,
    stuck,
  };
};

/**
 * Fetch event-propagation health from Redis (cursor + run heartbeat) and
 * evaluate it. Redis-only: no ClickHouse query, so it is cheap enough to run on
 * every health probe.
 */
export const getEventPropagationHealth =
  async (): Promise<EventPropagationHealth> => {
    const thresholdSeconds =
      env.LANGFUSE_EVENT_PROPAGATION_STUCK_THRESHOLD_MINUTES * 60;

    if (!isEventPropagationEnabled()) {
      return {
        enabled: false,
        lastRunStartedAt: null,
        secondsSinceLastRun: null,
        propagationDelaySeconds: null,
        lastProcessedPartition: null,
        thresholdSeconds,
        stuck: false,
      };
    }

    const [lastRunStartedAtMs, lastProcessedPartition] = await Promise.all([
      getLastRunStartedAt(),
      getLastProcessedPartition(),
    ]);

    return evaluateEventPropagationStuck({
      enabled: true,
      nowMs: Date.now(),
      lastRunStartedAtMs,
      lastProcessedPartition,
      thresholdSeconds,
    });
  };

type ContainerHealthOptions = {
  /** Fail (500) once a SIGTERM/SIGINT has been received (readiness only). */
  failOnSigterm: boolean;
  /**
   * Also fail (503) when the event-propagation job is stuck. Opt-in via the
   * ?failIfEventPropagationStuck=true query parameter so only a dedicated probe
   * pays the extra Redis lookups and only that probe forces a restart.
   */
  failIfEventPropagationStuck?: boolean;
};

/**
 * Check the health of the container.
 */
export const checkContainerHealth = async (
  res: Response,
  options: ContainerHealthOptions,
) => {
  const { failOnSigterm, failIfEventPropagationStuck = false } = options;

  if (failOnSigterm && isSigtermReceived()) {
    logger.info(
      "Health check failed: SIGTERM / SIGINT received, shutting down.",
    );
    return res.status(500).json({
      status: "SIGTERM / SIGINT received, shutting down",
    });
  }

  //check database health
  await prisma.$queryRaw`SELECT 1;`;

  if (!redis) {
    throw new Error("Redis connection not available");
  }

  await Promise.race([
    redis?.ping(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Redis ping timeout after 2 seconds")),
        2000,
      ),
    ),
  ]);

  if (failIfEventPropagationStuck) {
    const eventPropagation = await getEventPropagationHealth();
    if (eventPropagation.stuck) {
      logger.warn(
        `Health check failed: event propagation stuck (last run ${eventPropagation.secondsSinceLastRun}s ago, threshold ${eventPropagation.thresholdSeconds}s)`,
      );
      return res.status(503).json({
        status: "Event propagation stuck",
        eventPropagation,
      });
    }
    return res.json({
      status: "ok",
      eventPropagation,
    });
  }

  res.json({
    status: "ok",
  });
};

let sigtermReceived = false;

export const setSigtermReceived = () => {
  logger.info("Set sigterm received to true");
  sigtermReceived = true;
};

export const isSigtermReceived = () => sigtermReceived;
