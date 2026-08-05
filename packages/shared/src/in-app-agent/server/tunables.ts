import { env } from "../../env";

/** Worker lease renewal + cancel-signal pickup interval. */
export const IN_APP_AGENT_HEARTBEAT_INTERVAL_MS =
  env.LANGFUSE_IN_APP_AGENT_HEARTBEAT_INTERVAL_MS;

/** RUNNING with a heartbeat older than this is failed (worker_lost) on read. */
export const IN_APP_AGENT_HEARTBEAT_STALE_MS =
  env.LANGFUSE_IN_APP_AGENT_HEARTBEAT_STALE_MS;

/** QUEUED older than this is failed (queue_timeout) on read. */
export const IN_APP_AGENT_QUEUE_TIMEOUT_MS =
  env.LANGFUSE_IN_APP_AGENT_QUEUE_TIMEOUT_MS;

/**
 * QUEUED and unclaimed for longer than this is re-delivered by the lifecycle
 * sweep. Covers the commit-before-enqueue window, where the run row exists but
 * no job does. Redispatch stops at QUEUE_TIMEOUT_MS, so a run can never be
 * woken up long after the user gave up on it.
 */
export const IN_APP_AGENT_QUEUE_REDISPATCH_MS =
  env.LANGFUSE_IN_APP_AGENT_QUEUE_REDISPATCH_MS;

/**
 * RUNNING for longer than this since claim is failed (run_timeout) on read —
 * the backstop against a hung tool renewing a healthy heartbeat forever.
 */
export const IN_APP_AGENT_RUN_MAX_DURATION_MS =
  env.LANGFUSE_IN_APP_AGENT_RUN_MAX_DURATION_MS;

/** AWAITING_APPROVAL parked longer than this expires (approval_expired) on read. */
export const IN_APP_AGENT_APPROVAL_TTL_MS =
  env.LANGFUSE_IN_APP_AGENT_APPROVAL_TTL_MS;

/** Interval at which the watch stream re-reads run status + new events. */
export const IN_APP_AGENT_WATCH_TAIL_POLL_MS =
  env.LANGFUSE_IN_APP_AGENT_WATCH_TAIL_POLL_MS;

/** SSE comment interval, so load-balancer idle timeouts never fire. */
export const IN_APP_AGENT_WATCH_KEEPALIVE_MS =
  env.LANGFUSE_IN_APP_AGENT_WATCH_KEEPALIVE_MS;

/**
 * Deliberate stream end; the client reconnects with its cursor through the
 * same path as a fresh page load, so route/LB duration limits are never hit
 * unpredictably. Kept well inside the watch route's 120s `maxDuration`.
 */
export const IN_APP_AGENT_WATCH_MAX_CONNECTION_MS =
  env.LANGFUSE_IN_APP_AGENT_WATCH_MAX_CONNECTION_MS;
