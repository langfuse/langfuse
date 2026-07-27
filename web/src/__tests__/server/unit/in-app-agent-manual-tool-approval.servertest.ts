import { describe, expect, it } from "vitest";

import { EventType } from "@ag-ui/core";

import type { AgUiRunAgentInput } from "@/src/ee/features/in-app-agent/schema";
import { createManualToolApprovalRunInput } from "@/src/ee/features/in-app-agent/server/human-in-the-loop";

// The AG-UI -> Mastra message conversion forwards only assistant/user/tool
// roles, so guidance must travel inside the tool-result content (which also
// persists it for replay). These tests pin that transport: no dropped roles
// in the resume input, and in-memory message content identical to the
// persisted TOOL_CALL_RESULT event content.

function createResumeInput(approved: boolean): AgUiRunAgentInput {
  return {
    threadId: "thread-1",
    runId: "run-2",
    state: null,
    messages: [],
    tools: [],
    context: [],
    forwardedProps: {
      command: {
        resume: {
          approved,
          approvalRequest: {
            type: "tool_approval_request",
            toolCallId: "tool-call-1",
            toolName: "langfuse_createTextPrompt",
            args: { name: "test-prompt" },
            runId: "run-1",
          },
        },
      },
    },
  };
}

function getPersistedToolResultContent(
  syntheticEvents: { type: EventType; content?: unknown }[],
) {
  const resultEvent = syntheticEvents.find(
    (event) => event.type === EventType.TOOL_CALL_RESULT,
  );
  return resultEvent?.content;
}

describe("createManualToolApprovalRunInput", () => {
  it("folds rejection guidance into the tool result and emits no model-invisible roles", async () => {
    const runInput = await createManualToolApprovalRunInput({
      input: createResumeInput(false),
      executeToolCall: async () => {
        throw new Error("must not execute rejected tool calls");
      },
    });

    const roles = runInput.input.messages.map((message) => message.role);
    expect(roles).toEqual(["assistant", "tool"]);

    const toolMessage = runInput.input.messages.at(-1);
    expect(toolMessage?.role).toBe("tool");
    expect(toolMessage).toMatchObject({
      content: expect.stringContaining("Tool call was not approved"),
    });
    expect(toolMessage).toMatchObject({
      content: expect.stringContaining("Do not retry this tool call"),
    });

    expect(getPersistedToolResultContent(runInput.syntheticEvents)).toBe(
      toolMessage && "content" in toolMessage ? toolMessage.content : undefined,
    );
  });

  it("folds tool-error guidance into the tool result on failed approved execution", async () => {
    const runInput = await createManualToolApprovalRunInput({
      input: createResumeInput(true),
      executeToolCall: async () => {
        throw new Error("database exploded");
      },
    });

    const roles = runInput.input.messages.map((message) => message.role);
    expect(roles).toEqual(["assistant", "tool"]);

    const toolMessage = runInput.input.messages.at(-1);
    expect(toolMessage).toMatchObject({
      role: "tool",
      error: "database exploded",
      content: expect.stringContaining("database exploded"),
    });
    expect(toolMessage).toMatchObject({
      content: expect.stringContaining(
        "Do not call the same tool again with identical arguments",
      ),
    });

    expect(getPersistedToolResultContent(runInput.syntheticEvents)).toBe(
      toolMessage && "content" in toolMessage ? toolMessage.content : undefined,
    );
  });
});
