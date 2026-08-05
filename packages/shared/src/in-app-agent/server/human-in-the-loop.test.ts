import { describe, expect, it, vi } from "vitest";

import type {
  AgUiMessage,
  AgUiRunAgentInput,
  InAppAgentToolApprovalRequest,
} from "../schema";
import { createManualToolApprovalRunInput } from "./human-in-the-loop";

const approvalRequest = {
  type: "tool_approval_request",
  toolCallId: "tool-call-1",
  toolName: "langfuse_createTextPrompt",
  args: { name: "approval-test" },
  runId: "run-1",
} satisfies InAppAgentToolApprovalRequest;

const input = {
  threadId: "conversation-1",
  runId: "run-2",
  state: null,
  messages: [],
  tools: [],
  context: [],
  forwardedProps: {
    command: {
      resume: {
        approved: false,
        approvalRequest,
      },
    },
  },
} satisfies AgUiRunAgentInput;

function getMessages(
  result: Awaited<ReturnType<typeof createManualToolApprovalRunInput>>,
) {
  return result.input.messages as AgUiMessage[];
}

describe("createManualToolApprovalRunInput", () => {
  it("passes rejected tool calls to the model as a user-visible decision", async () => {
    const executeToolCall = vi.fn().mockResolvedValue(undefined);

    const result = await createManualToolApprovalRunInput({
      input,
      executeToolCall,
    });

    expect(executeToolCall).not.toHaveBeenCalled();
    expect(getMessages(result)).toEqual([
      expect.objectContaining({
        role: "assistant",
        content: "",
        toolCalls: [
          expect.objectContaining({
            id: approvalRequest.toolCallId,
            function: expect.objectContaining({
              name: approvalRequest.toolName,
            }),
          }),
        ],
      }),
      expect.objectContaining({
        role: "tool",
        toolCallId: approvalRequest.toolCallId,
        content: "Tool call was not approved by the user.",
      }),
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("Do not retry this tool call"),
      }),
    ]);
  });

  it("passes approved tool calls to the model as completed decisions", async () => {
    const result = await createManualToolApprovalRunInput({
      input: {
        ...input,
        forwardedProps: {
          command: {
            resume: {
              approved: true,
              approvalRequest,
            },
          },
        },
      },
      executeToolCall: vi.fn().mockResolvedValue({ created: true }),
    });

    expect(getMessages(result)).toEqual([
      expect.objectContaining({ role: "assistant", content: "" }),
      expect.objectContaining({
        role: "tool",
        toolCallId: approvalRequest.toolCallId,
        content: JSON.stringify({ created: true }),
      }),
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("action was completed successfully"),
      }),
    ]);
  });
});
