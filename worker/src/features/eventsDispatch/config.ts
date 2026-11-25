import { env as sharedEnv } from "@langfuse/shared/src/env";
import { env } from "../../env";

/** Switch for the whole pipeline: trace recording, dispatch and the consumer. */
export function isEventsDispatchEnabled(): boolean {
  return env.LANGFUSE_EVENTS_DISPATCH_ENABLED === "true";
}

// Mutable so tests can shorten windows; production never writes these.
/** The per-trace Redis maps and the dispatcher that reads them. */
export const traceDispatchConfig = {
  /** Changing the count requires draining the maps first. */
  shardCount: sharedEnv.REDIS_CLUSTER_ENABLED === "true" ? 16 : 1,
  /** Idle time for projects without a saved `trace_idle_ms`. */
  defaultIdleMs:
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ? 120_000 : 600_000,
  /** How long a due trace stays pending before cleanup drops it. */
  pendingTtlMs: 2 * 60 * 60_000,
  dispatchIntervalMs: 60_000,
  boundsTtlMs: env.LANGFUSE_TRACE_DISPATCH_BOUNDS_TTL_MS,
};

/** The jobs on `events-dispatch-queue` and their consumer. */
export const eventsDispatchConfig = {
  /** 0 disables a budget. */
  maxBatchBytes: 64 * 1024 * 1024,
  maxTraceBytes: 50 * 1024 * 1024,
  consumerConcurrency: 1,
};
