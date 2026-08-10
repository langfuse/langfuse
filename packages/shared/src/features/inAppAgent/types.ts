import z from "zod";
import { AgUiContextSchema } from "../../in-app-agent/schema";

/**
 * Lifecycle states of an in-app agent run (`in_app_agent_runs.status`).
 *
 * Stored as a plain string column (not a PG enum) so states can be added
 * without `ALTER TYPE`, following BatchExportStatus/BatchActionStatus.
 * Legacy rows may still be null, while every current writer sets it
 * explicitly. Readers therefore keep handling a missing status.
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
  /** Background worker aborted the run on SIGTERM (deploy). */
  WORKER_SHUTDOWN = "worker_shutdown",
  /**
   * Background run died after an approved mutation may have started but
   * before its result was persisted. Never generically retried: the next
   * turn must verify whether the effect landed before proposing again.
   */
  OUTCOME_UNKNOWN = "outcome_unknown",
  /** Run committed as QUEUED but the BullMQ enqueue failed right after. */
  ENQUEUE_FAILED = "enqueue_failed",
  /** QUEUED past `QUEUE_TIMEOUT`: no worker ever picked the run up. */
  QUEUE_TIMEOUT = "queue_timeout",
  /** RUNNING with a heartbeat older than `HEARTBEAT_STALE`: worker died. */
  WORKER_LOST = "worker_lost",
  /**
   * RUNNING for longer than `RUN_MAX_DURATION` since claim — the backstop
   * against a hung tool renewing an otherwise healthy heartbeat forever.
   */
  RUN_TIMEOUT = "run_timeout",
  /** Approval parked longer than `APPROVAL_TTL` without a decision. */
  APPROVAL_EXPIRED = "approval_expired",
  /** Pending approval replaced by a newer user message (recorded on CANCELLED). */
  APPROVAL_SUPERSEDED = "approval_superseded",
  /** Pending approval cancelled by the user (recorded on CANCELLED). */
  APPROVAL_CANCELLED = "approval_cancelled",
}

/**
 * Typed contents of `in_app_agent_runs.request` — the server-side trigger
 * payload a background worker reads at claim. The BullMQ job carries only
 * `{projectId, runId}`, so everything the run needs that is not already in
 * the append-only event stream lives here. The user message itself is not
 * duplicated: the submitting mutation appends it as a conversation event
 * and the worker rebuilds model input from the event history.
 */
export const InAppAgentRunRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("userMessage"),
    /** Sanitized AG-UI context items (current page, resolved view filters). */
    context: z.array(AgUiContextSchema),
  }),
  z.object({
    kind: z.literal("approvalDecision"),
    /** Provenance for debugging only; no code path queries lineage. */
    parentRunId: z.string(),
    toolCallId: z.string(),
    approved: z.boolean(),
    /** Inherited sanitized context; defaults for legacy continuation rows. */
    context: z.array(AgUiContextSchema).default([]),
  }),
]);

export type InAppAgentRunRequest = z.infer<typeof InAppAgentRunRequestSchema>;
