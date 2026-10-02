import { EventType } from "@ag-ui/core";
import { z } from "zod";

import type { AgUiCustomEvent, AgUiEvent } from "./schema";
import { InAppAgentUserInputPayloadSchema } from "./schema";

/** Render-only user-input history stored in the append-only event stream. */
export const IN_APP_AGENT_USER_INPUT_DECISION_EVENT_NAME =
  "langfuse_user_input_decision";

export const InAppAgentUserInputDecisionSchema = z.object({
  toolCallId: z.string().min(1),
  status: z.enum(["resolved", "cancelled"]),
  decidedByUserId: z.string().min(1),
  payload: InAppAgentUserInputPayloadSchema.optional(),
});

export type InAppAgentUserInputDecision = z.infer<
  typeof InAppAgentUserInputDecisionSchema
>;

export function buildInAppAgentUserInputDecisionEvent(
  decision: InAppAgentUserInputDecision,
): AgUiCustomEvent {
  return {
    type: EventType.CUSTOM,
    name: IN_APP_AGENT_USER_INPUT_DECISION_EVENT_NAME,
    value: decision,
  };
}

export function parseInAppAgentUserInputDecisionEvent(
  event: AgUiEvent,
): InAppAgentUserInputDecision | undefined {
  if (
    event.type !== EventType.CUSTOM ||
    event.name !== IN_APP_AGENT_USER_INPUT_DECISION_EVENT_NAME
  ) {
    return undefined;
  }

  const parsed = InAppAgentUserInputDecisionSchema.safeParse(event.value);
  return parsed.success ? parsed.data : undefined;
}
