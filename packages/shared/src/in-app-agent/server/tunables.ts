import { env } from "../../env";

/** Worker lease renewal + cancel-signal pickup interval. */
export const IN_APP_AGENT_HEARTBEAT_INTERVAL_MS = 5_000;

/** RUNNING with a heartbeat older than this is failed (worker_lost) on read. */
export const IN_APP_AGENT_HEARTBEAT_STALE_MS = 60_000;

/** QUEUED older than this is failed (queue_timeout) on read. */
export const IN_APP_AGENT_QUEUE_TIMEOUT_MS =
  env.LANGFUSE_IN_APP_AGENT_QUEUE_TIMEOUT_MS;

/**
 * RUNNING for longer than this since claim is failed (run_timeout) on read —
 * the backstop against a hung tool renewing a healthy heartbeat forever.
 */
export const IN_APP_AGENT_RUN_MAX_DURATION_MS =
  env.LANGFUSE_IN_APP_AGENT_RUN_MAX_DURATION_MS;

/** AWAITING_APPROVAL parked longer than this expires (approval_expired) on read. */
export const IN_APP_AGENT_APPROVAL_TTL_MS =
  env.LANGFUSE_IN_APP_AGENT_APPROVAL_TTL_MS;
