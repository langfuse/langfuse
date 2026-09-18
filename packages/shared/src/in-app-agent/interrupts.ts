import { EventType } from "@ag-ui/core";
import { z } from "zod";

import { IN_APP_AGENT_ASK_USER_TOOL_NAME } from "./constants";
import { safeJsonParse } from "../utils/json";
import {
  InAppAgentAskUserArgsSchema,
  InAppAgentUserInputPayloadSchema,
  type InAppAgentAskUserArgs,
  type InAppAgentInterrupt,
  type InAppAgentToolApprovalRequest,
  type InAppAgentUserInputPayload,
  type InAppAgentUserInputRequest,
} from "./schema";

const MastraSuspendEventSchema = z.object({
  type: z.literal("mastra_suspend"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown().optional(),
  runId: z.string().min(1),
});

function buildAskUserResponseSchema(args: InAppAgentAskUserArgs) {
  const optionLabels = args.options?.map((option) => option.label) ?? [];
  const answerSchema =
    args.selectionMode === "multi_select" && optionLabels.length > 0
      ? {
          type: "array",
          items: { type: "string", enum: optionLabels },
          minItems: 1,
        }
      : optionLabels.length > 0
        ? { type: "string", enum: optionLabels }
        : { type: "string", minLength: 1 };

  return {
    type: "object",
    additionalProperties: false,
    required: ["answer"],
    properties: {
      answer: answerSchema,
      details: { type: "string" },
    },
  };
}

function toUserInputRequest(
  interrupt: z.infer<typeof MastraSuspendEventSchema>,
): InAppAgentUserInputRequest | undefined {
  const args = InAppAgentAskUserArgsSchema.safeParse(interrupt.args);
  if (!args.success) {
    return undefined;
  }

  return {
    type: "user_input_request",
    id: interrupt.toolCallId,
    reason: "input_required",
    message: args.data.question,
    responseSchema: buildAskUserResponseSchema(args.data),
    toolCallId: interrupt.toolCallId,
    toolName: interrupt.toolName,
    args: args.data,
    runId: interrupt.runId,
  };
}

/** Parses the durable interrupt event shape in browser and server runtimes. */
export function parseInAppAgentInterruptEvent(
  event: unknown,
): InAppAgentInterrupt | undefined {
  if (
    !event ||
    typeof event !== "object" ||
    !("type" in event) ||
    event.type !== EventType.CUSTOM ||
    !("name" in event) ||
    event.name !== "on_interrupt"
  ) {
    return undefined;
  }

  const value = "value" in event ? event.value : undefined;
  const parsedValue = typeof value === "string" ? safeJsonParse(value) : value;
  const interrupt = MastraSuspendEventSchema.safeParse(parsedValue);

  if (!interrupt.success) {
    return undefined;
  }

  if (interrupt.data.toolName === IN_APP_AGENT_ASK_USER_TOOL_NAME) {
    return toUserInputRequest(interrupt.data);
  }

  return { ...interrupt.data, type: "tool_approval_request" };
}

export function isInAppAgentToolApprovalRequest(
  interrupt: InAppAgentInterrupt | undefined,
): interrupt is InAppAgentToolApprovalRequest {
  return interrupt?.type === "tool_approval_request";
}

export function isInAppAgentUserInputRequest(
  interrupt: InAppAgentInterrupt | undefined,
): interrupt is InAppAgentUserInputRequest {
  return interrupt?.type === "user_input_request";
}

export function isValidInAppAgentUserInputPayload(
  payload: InAppAgentUserInputPayload,
  args: InAppAgentAskUserArgs,
): boolean {
  const parsed = InAppAgentUserInputPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return false;
  }

  const optionLabels = args.options?.map((option) => option.label) ?? [];
  if (optionLabels.length === 0) {
    return typeof parsed.data.answer === "string";
  }

  const answers = Array.isArray(parsed.data.answer)
    ? parsed.data.answer
    : [parsed.data.answer];
  const allowed = new Set(optionLabels);
  if (answers.some((answer) => !allowed.has(answer))) {
    return false;
  }

  if (args.selectionMode === "multi_select") {
    return Array.isArray(parsed.data.answer) && parsed.data.answer.length > 0;
  }

  return typeof parsed.data.answer === "string";
}
