/**
 * Lifecycle tunables for background in-app agent runs, in one place so they
 * can be tuned without hunting. Every value is env-overridable; the defaults
 * are the RFC's v1 values. Read lazily via process.env (not the zod env
 * schema) so a bad override degrades to the default instead of failing boot.
 */

function envMs(name: string, defaultMs: number): number {
  const raw = process.env[name];
  if (!raw) return defaultMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

/** Worker lease renewal + cancel-signal pickup interval. */
export const IN_APP_AGENT_HEARTBEAT_INTERVAL_MS = envMs(
  "LANGFUSE_IN_APP_AGENT_HEARTBEAT_INTERVAL_MS",
  5_000,
);

/** RUNNING with a heartbeat older than this is failed (worker_lost) on read. */
export const IN_APP_AGENT_HEARTBEAT_STALE_MS = envMs(
  "LANGFUSE_IN_APP_AGENT_HEARTBEAT_STALE_MS",
  60_000,
);

/** QUEUED older than this is failed (queue_timeout) on read. */
export const IN_APP_AGENT_QUEUE_TIMEOUT_MS = envMs(
  "LANGFUSE_IN_APP_AGENT_QUEUE_TIMEOUT_MS",
  5 * 60_000,
);

/**
 * RUNNING for longer than this since claim is failed (run_timeout) on read —
 * the backstop against a hung tool renewing a healthy heartbeat forever.
 */
export const IN_APP_AGENT_RUN_MAX_DURATION_MS = envMs(
  "LANGFUSE_IN_APP_AGENT_RUN_MAX_DURATION_MS",
  15 * 60_000,
);

/** AWAITING_APPROVAL parked longer than this expires (approval_expired) on read. */
export const IN_APP_AGENT_APPROVAL_TTL_MS = envMs(
  "LANGFUSE_IN_APP_AGENT_APPROVAL_TTL_MS",
  24 * 60 * 60_000,
);
