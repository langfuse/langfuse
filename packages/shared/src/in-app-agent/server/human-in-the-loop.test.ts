import { EventType } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";

import type { AgUiRunAgentInput } from "../schema";
import { createManualToolApprovalBatchRunInput } from "./human-in-the-loop";

describe("manual batched tool approval", () => {
  it("executes approved calls in order and exposes only their original results", async () => {
    const approvalRequests = ["tool-call-1", "tool-call-2", "tool-call-3"].map(
      (toolCallId, index) => ({
        type: "tool_approval_request" as const,
        toolCallId,
        toolName: `langfuse_tool${index + 1}`,
        args: { index },
        runId: "run-parent",
      }),
    );
    const input = {
      threadId: "conversation-1",
      runId: "run-continuation",
      state: null,
      messages: [],
      tools: [],
      context: [],
      resume: approvalRequests.map((approval, index) => ({
        interruptId: `${approval.runId}::${approval.toolCallId}`,
        status: "resolved" as const,
        payload: {
          approved: index < 2,
          approvalScope: "once" as const,
        },
      })),
    } satisfies AgUiRunAgentInput;
    const executionOrder: string[] = [];
    const onApprovedToolCallExecuted = vi.fn();

    const result = await createManualToolApprovalBatchRunInput({
      input,
      approvalRequests,
      executeToolCall: async (approval) => {
        executionOrder.push(approval.toolCallId);
        if (approval.toolCallId === "tool-call-2") {
          throw new Error("second call failed");
        }
        return { result: { ok: true }, modelResult: { ok: true } };
      },
      onApprovedToolCallExecuted,
    });

    expect(executionOrder).toEqual(["tool-call-1", "tool-call-2"]);
    expect(onApprovedToolCallExecuted).toHaveBeenCalledTimes(2);
    expect(result.syntheticEvents).toEqual([
      expect.objectContaining({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-call-1",
      }),
      expect.objectContaining({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-call-2",
      }),
      expect.objectContaining({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-call-3",
      }),
    ]);
    expect(
      result.syntheticEvents.some((event) =>
        [
          EventType.TOOL_CALL_START,
          EventType.TOOL_CALL_ARGS,
          EventType.TOOL_CALL_END,
        ].includes(event.type),
      ),
    ).toBe(false);
    expect(result.input.resume).toBeUndefined();
    expect(
      result.input.messages.filter((message) => message.role === "assistant"),
    ).toEqual([
      expect.objectContaining({
        toolCalls: approvalRequests.map((approval) =>
          expect.objectContaining({ id: approval.toolCallId }),
        ),
      }),
    ]);
    expect(
      result.input.messages
        .filter((message) => message.role === "tool")
        .map((message) =>
          message.role === "tool" ? message.toolCallId : null,
        ),
    ).toEqual(["tool-call-1", "tool-call-2", "tool-call-3"]);
  });
});
