import z from "zod";

/**
 * Lifecycle states of an in-app agent run (`in_app_agent_runs.status`).
 *
 * Stored as a plain string column (not a PG enum) so states can be added
 * without `ALTER TYPE`, following BatchExportStatus/BatchActionStatus.
 * The column is nullable until the first status reader ships: NULL means
 * the row was written by code that predates the column.
 */
export enum InAppAgentRunStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  AWAITING_APPROVAL = "AWAITING_APPROVAL",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export const InAppAgentRunStatusSchema = z.enum(InAppAgentRunStatus);

/**
 * Terminal error codes of an in-app agent run (`in_app_agent_runs.error_code`).
 *
 * Constrains writers at the type level; the column itself stays a free-form
 * string and historical rows may contain other values, so readers must
 * tolerate unknown strings rather than parse against this enum.
 */
export enum InAppAgentRunErrorCode {
  /** Unfinished run lazily closed because its foreground stream died. */
  STALE = "stale",
  /** Client aborted the request. */
  CANCELLED = "cancelled",
  /** Agent loop failed while streaming. */
  AGENT_ERROR = "agent_error",
  /** Agent initialization failed before the loop started. */
  INIT_FAILED = "init_failed",
}
