/** Worker lease renewal + cancel-signal pickup interval. */
export const IN_APP_AGENT_HEARTBEAT_INTERVAL_MS = 5_000;

/** RUNNING with a heartbeat older than this is failed (worker_lost) on read. */
export const IN_APP_AGENT_HEARTBEAT_STALE_MS = 60_000;

/** QUEUED older than this is failed (queue_timeout) on read. */
export const IN_APP_AGENT_QUEUE_TIMEOUT_MS = 5 * 60_000;

/**
 * RUNNING for longer than this since claim is failed (run_timeout) on read —
 * the backstop against a hung tool renewing a healthy heartbeat forever.
 */
export const IN_APP_AGENT_RUN_MAX_DURATION_MS = 15 * 60_000;

/** AWAITING_APPROVAL parked longer than this expires (approval_expired) on read. */
export const IN_APP_AGENT_APPROVAL_TTL_MS = 24 * 60 * 60_000;

/**
 * Sequential model calls (Mastra `maxSteps`) allowed in one turn. Shared so
 * wrap-up, truncation detection, and the Agent constructor cannot drift.
 */
export const IN_APP_AGENT_MAX_STEPS = 20;
