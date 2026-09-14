import { EventType } from "@ag-ui/core";
import { z } from "zod";

import type { AgUiCustomEvent, AgUiEvent } from "./schema";

/** Render-only approval history stored in the append-only event stream. */
export const IN_APP_AGENT_APPROVAL_DECISION_EVENT_NAME =
  "langfuse_approval_decision";

export const IN_APP_AGENT_TOOL_APPROVAL_EVENT_NAME = "langfuse_tool_approval";

export const InAppAgentApprovalDecisionSchema = z.object({
  toolCallId: z.string().min(1),
  approved: z.boolean(),
  decidedByUserId: z.string().min(1),
  alwaysAllow: z.literal(true).optional(),
  toolName: z.string().min(1).optional(),
});

export type InAppAgentApprovalDecision = z.infer<
  typeof InAppAgentApprovalDecisionSchema
>;

export const InAppAgentToolApprovalSourceSchema = z.enum([
  "auto",
  "human",
  "conversation_grant",
]);

export type InAppAgentToolApprovalSource = z.infer<
  typeof InAppAgentToolApprovalSourceSchema
>;

export const InAppAgentToolApprovalSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  source: InAppAgentToolApprovalSourceSchema,
});

export type InAppAgentToolApproval = z.infer<
  typeof InAppAgentToolApprovalSchema
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

export function buildInAppAgentToolApprovalEvent(
  approval: InAppAgentToolApproval,
): AgUiCustomEvent {
  return {
    type: EventType.CUSTOM,
    name: IN_APP_AGENT_TOOL_APPROVAL_EVENT_NAME,
    toolCallId: approval.toolCallId,
    value: approval,
  };
}

export function parseInAppAgentToolApprovalEvent(
  event: AgUiEvent,
): InAppAgentToolApproval | undefined {
  if (
    event.type !== EventType.CUSTOM ||
    event.name !== IN_APP_AGENT_TOOL_APPROVAL_EVENT_NAME
  ) {
    return undefined;
  }

  const parsed = InAppAgentToolApprovalSchema.safeParse(event.value);
  return parsed.success ? parsed.data : undefined;
}
