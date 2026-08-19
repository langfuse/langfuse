import { EventType } from "@ag-ui/core";
import { z } from "zod";

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
