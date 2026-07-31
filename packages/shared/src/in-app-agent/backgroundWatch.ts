// Browser-safe approval and watch contracts shared by web and worker code.

import { EventType } from "@ag-ui/core";
import { z } from "zod";

import {
  InAppAgentRunStatus,
  InAppAgentRunStatusSchema,
} from "../features/inAppAgent/types";
import type { AgUiCustomEvent, AgUiEvent } from "./schema";

/** Render-only approval history stored in the append-only event stream. */
export const IN_APP_AGENT_APPROVAL_DECISION_EVENT_NAME =
  "langfuse_approval_decision";

export const InAppAgentApprovalDecisionSchema = z.object({
  toolCallId: z.string().min(1),
  approved: z.boolean(),
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

/** Conversation-scoped watch frames keyed by persisted sequence number. */
export const InAppAgentWatchStatusFrameSchema = z.object({
  type: z.literal("status"),
  runId: z.string(),
  status: InAppAgentRunStatusSchema,
  errorCode: z.string().nullable().optional(),
  /** Cancellation is cooperative, so this may be true while status is RUNNING. */
  cancelRequested: z.boolean().optional(),
});

export const InAppAgentWatchEventFrameSchema = z.object({
  type: z.literal("event"),
  sequenceNumber: z.number().int(),
  event: z.record(z.string(), z.unknown()),
});

export const InAppAgentWatchErrorFrameSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});

/** Only this frame tells clients to stop reconnecting. */
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

/** A parked approval occupies neither a worker nor the conversation slot. */
export const IN_APP_AGENT_ACTIVE_RUN_STATUSES: readonly InAppAgentRunStatus[] =
  [InAppAgentRunStatus.QUEUED, InAppAgentRunStatus.RUNNING];

export function isActiveInAppAgentRunStatus(
  status: InAppAgentRunStatus,
): boolean {
  return IN_APP_AGENT_ACTIVE_RUN_STATUSES.includes(status);
}
