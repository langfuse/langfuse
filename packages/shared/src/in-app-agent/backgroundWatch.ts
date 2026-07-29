// Client-safe contracts for background execution: the approval-decision
// transcript event and the watch stream's browser wire format. Shared by the
// tRPC mutations, the watch route, and the drawer's stream client, so the
// three cannot drift.

import { EventType } from "@ag-ui/core";
import { z } from "zod";

import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  InAppAgentRunStatusSchema,
} from "../features/inAppAgent/types";
import type { AgUiCustomEvent, AgUiEvent } from "./schema";

/**
 * A human decision on a pending tool approval, recorded in the append-only
 * event stream rather than a side channel.
 *
 * Card state derives entirely from events plus run status: pending = parent
 * run `AWAITING_APPROVAL`, decided = a matching decision event, superseded or
 * expired = parent status plus error code. Without this event the decision and
 * the decider would live only in the continuation run's request payload,
 * invisible to the render stream, and the decide→claim gap would show a stale
 * pending card.
 *
 * Render-only by contract, like reasoning events: it rides as a `CUSTOM`
 * event, which `toPersistableAgentEvent` drops and the message accumulators
 * skip, so the model never sees it. The agent learns the outcome from the tool
 * result the continuation synthesizes.
 */
export const IN_APP_AGENT_APPROVAL_DECISION_EVENT_NAME =
  "langfuse_approval_decision";

export const InAppAgentApprovalDecisionSchema = z.object({
  toolCallId: z.string().min(1),
  approved: z.boolean(),
  /**
   * Always the conversation owner in v1, and kept anyway: events are
   * immutable history, so omitting it now would leave every decision recorded
   * before multi-viewer attribution arrives with an unknowable decider.
   */
  decidedByUserId: z.string().min(1),
});

export type InAppAgentApprovalDecision = z.infer<
  typeof InAppAgentApprovalDecisionSchema
>;

export function buildInAppAgentApprovalDecisionEvent(
  decision: InAppAgentApprovalDecision,
): AgUiCustomEvent {
  return {
    type: EventType.CUSTOM,
    name: IN_APP_AGENT_APPROVAL_DECISION_EVENT_NAME,
    value: decision,
  };
}

export function parseInAppAgentApprovalDecisionEvent(
  event: AgUiEvent,
): InAppAgentApprovalDecision | undefined {
  if (
    event.type !== EventType.CUSTOM ||
    event.name !== IN_APP_AGENT_APPROVAL_DECISION_EVENT_NAME
  ) {
    return undefined;
  }

  const parsed = InAppAgentApprovalDecisionSchema.safeParse(event.value);

  return parsed.success ? parsed.data : undefined;
}

/**
 * Watch stream wire format.
 *
 * Scope is the conversation, not the run: the cursor is the conversation-wide
 * `sequenceNumber`, so one stream spans approval continuations and supersedes
 * without the client rediscovering run IDs. The stream carries the *current*
 * run's status; the client never tracks "which run am I watching".
 */
export const InAppAgentWatchStatusFrameSchema = z.object({
  type: z.literal("status"),
  runId: z.string(),
  status: InAppAgentRunStatusSchema,
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  /**
   * A cancel has been requested but the run has not stopped yet. Cancellation
   * of a RUNNING run is cooperative — the worker observes the flag on its next
   * heartbeat and aborts at the following step boundary — so this is the only
   * thing that distinguishes "still working" from "winding down", and without
   * it the UI looks unchanged for seconds after the user hits stop.
   */
  cancelRequested: z.boolean().optional(),
});

export const InAppAgentWatchEventFrameSchema = z.object({
  type: z.literal("event"),
  sequenceNumber: z.number().int(),
  /** The persisted AG-UI event verbatim. */
  event: z.record(z.string(), z.unknown()),
});

export const InAppAgentWatchErrorFrameSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});

/**
 * The client's stop-reconnecting signal. Any *other* close — the keep-alive
 * window elapsing, a deploy, a network blip — means reconnect with the cursor.
 */
export const InAppAgentWatchDoneFrameSchema = z.object({
  type: z.literal("done"),
});

export const InAppAgentWatchFrameSchema = z.discriminatedUnion("type", [
  InAppAgentWatchStatusFrameSchema,
  InAppAgentWatchEventFrameSchema,
  InAppAgentWatchErrorFrameSchema,
  InAppAgentWatchDoneFrameSchema,
]);

export type InAppAgentWatchFrame = z.infer<typeof InAppAgentWatchFrameSchema>;

/**
 * Statuses that mean "the conversation is still busy". `AWAITING_APPROVAL` is
 * deliberately absent: parking sets `finished_at`, freeing both the worker and
 * the conversation slot while the approval waits.
 */
export const IN_APP_AGENT_ACTIVE_RUN_STATUSES: readonly InAppAgentRunStatus[] =
  [InAppAgentRunStatus.QUEUED, InAppAgentRunStatus.RUNNING];

export function isActiveInAppAgentRunStatus(
  status: InAppAgentRunStatus,
): boolean {
  return IN_APP_AGENT_ACTIVE_RUN_STATUSES.includes(status);
}

/**
 * Statuses a user can still stop. Deliberately wider than "active": a parked
 * run occupies no worker and no conversation slot, but its decision is still
 * outstanding, and discarding it is a real action (`approval_cancelled`) rather
 * than a no-op. Conflating the two makes the stop control silently do nothing
 * on exactly the state where the user is most likely to press it.
 */
export function isCancellableInAppAgentRunStatus(
  status: InAppAgentRunStatus,
): boolean {
  return (
    isActiveInAppAgentRunStatus(status) ||
    status === InAppAgentRunStatus.AWAITING_APPROVAL
  );
}

/**
 * `FAILED` is never one thing: the code decides what the user is told. An
 * unknown code falls back to the generic message rather than leaking a raw
 * enum value — historical rows may carry codes this build has never heard of.
 */
export function getInAppAgentRunFailureMessage(
  errorCode: string | null,
): string {
  switch (errorCode) {
    case InAppAgentRunErrorCode.ENQUEUE_FAILED:
      return "Couldn't start the run. Try again.";
    case InAppAgentRunErrorCode.QUEUE_TIMEOUT:
      return "No worker picked this up. Try again.";
    case InAppAgentRunErrorCode.WORKER_LOST:
      return "The run was interrupted. Try again.";
    case InAppAgentRunErrorCode.RUN_TIMEOUT:
      return "The run exceeded the maximum duration.";
    case InAppAgentRunErrorCode.WORKER_SHUTDOWN:
      return "The run was interrupted by a deploy. Try again.";
    case InAppAgentRunErrorCode.OUTCOME_UNKNOWN:
      return "The approved action may have completed. Verify before retrying.";
    case InAppAgentRunErrorCode.APPROVAL_EXPIRED:
      return "The approval request expired.";
    case InAppAgentRunErrorCode.APPROVAL_SUPERSEDED:
      return "Replaced by a newer message.";
    case InAppAgentRunErrorCode.APPROVAL_CANCELLED:
      return "Approval cancelled.";
    case InAppAgentRunErrorCode.CANCELLED:
      return "You stopped this run.";
    case InAppAgentRunErrorCode.STALE:
      return "The run was interrupted. Try again.";
    default:
      return "The run failed. Try again.";
  }
}
