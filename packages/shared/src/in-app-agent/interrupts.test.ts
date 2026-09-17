import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import { IN_APP_AGENT_ASK_USER_TOOL_NAME } from "./constants";
import {
  isInAppAgentToolApprovalRequest,
  isInAppAgentUserInputRequest,
  isValidInAppAgentUserInputPayload,
  parseInAppAgentInterruptEvent,
} from "./interrupts";

const baseCustomEvent = {
  type: EventType.CUSTOM,
  name: "on_interrupt",
} as const;

describe("parseInAppAgentInterruptEvent", () => {
  it("maps a mutating tool suspend onto a tool approval request", () => {
    const interrupt = parseInAppAgentInterruptEvent({
      ...baseCustomEvent,
      value: {
        type: "mastra_suspend",
        toolCallId: "tc-1",
        toolName: "langfuse_createTextPrompt",
        args: { name: "p" },
        runId: "run-1",
      },
    });

    expect(isInAppAgentToolApprovalRequest(interrupt)).toBe(true);
    expect(interrupt).toMatchObject({
      type: "tool_approval_request",
      toolCallId: "tc-1",
      toolName: "langfuse_createTextPrompt",
      runId: "run-1",
    });
  });

  it("maps ask_user suspend onto an AG-UI input_required interrupt", () => {
    const interrupt = parseInAppAgentInterruptEvent({
      ...baseCustomEvent,
      value: {
        type: "mastra_suspend",
        toolCallId: "tc-ask",
        toolName: IN_APP_AGENT_ASK_USER_TOOL_NAME,
        args: {
          question: "Which environment should I query?",
          options: [{ label: "production" }, { label: "staging" }],
          selectionMode: "single_select",
        },
        runId: "run-2",
      },
    });

    expect(isInAppAgentUserInputRequest(interrupt)).toBe(true);
    expect(interrupt).toMatchObject({
      type: "user_input_request",
      id: "tc-ask",
      reason: "input_required",
      message: "Which environment should I query?",
      toolCallId: "tc-ask",
      toolName: IN_APP_AGENT_ASK_USER_TOOL_NAME,
      runId: "run-2",
    });
    expect(interrupt && "responseSchema" in interrupt).toBe(true);
  });
});

describe("isValidInAppAgentUserInputPayload", () => {
  it("requires a listed option when choices are offered", () => {
    const args = {
      question: "Pick one",
      options: [{ label: "production" }, { label: "staging" }],
      selectionMode: "single_select" as const,
    };

    expect(
      isValidInAppAgentUserInputPayload({ answer: "production" }, args),
    ).toBe(true);
    expect(
      isValidInAppAgentUserInputPayload({ answer: "development" }, args),
    ).toBe(false);
    expect(
      isValidInAppAgentUserInputPayload({ answer: ["production"] }, args),
    ).toBe(false);
  });
});
