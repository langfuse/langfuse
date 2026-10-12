import { describe, expect, it, vi } from "vitest";

import { applyEvaluatorInAppAgentToolResult } from "./applyEvaluatorInAppAgentToolResult";

const callbacks = () => ({
  applyFilter: vi.fn(),
  applyTestResult: vi.fn(),
  evaluatorCreated: vi.fn(),
  evaluatorUpdated: vi.fn(() => Promise.resolve()),
});

describe("applyEvaluatorInAppAgentToolResult", () => {
  it("applies a matching workbench filter to the mounted evaluator", async () => {
    const handlers = callbacks();

    await applyEvaluatorInAppAgentToolResult({
      evaluatorId: "evaluator-a",
      result: {
        projectId: "project-a",
        conversationId: "conversation-a",
        toolCallId: "tool-call",
        toolName: "langfuse_setEvaluatorWorkbenchFilter",
        toolArguments: JSON.stringify({
          evaluatorId: "evaluator-a",
          filter: [],
        }),
        toolResultContent: "{}",
      },
      ...handlers,
    });

    expect(handlers.applyFilter).toHaveBeenCalledWith([], "tool-call");
  });

  it("shows a matching evaluator test result", async () => {
    const handlers = callbacks();

    await applyEvaluatorInAppAgentToolResult({
      evaluatorId: "evaluator-a",
      result: {
        projectId: "project-a",
        conversationId: "conversation-a",
        toolCallId: "tool-call",
        toolName: "langfuse_testEvaluator",
        toolArguments: JSON.stringify({ evaluatorId: "evaluator-a" }),
        toolResultContent: JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                result: { score: 1 },
              }),
            },
          ],
        }),
      },
      ...handlers,
    });

    expect(handlers.applyTestResult).toHaveBeenCalledWith(
      { success: true, result: { score: 1 } },
      "tool-call",
    );
  });

  it("ignores tools for another evaluator", async () => {
    const handlers = callbacks();

    await applyEvaluatorInAppAgentToolResult({
      evaluatorId: "evaluator-a",
      result: {
        projectId: "project-a",
        conversationId: "conversation-a",
        toolCallId: "tool-call",
        toolName: "langfuse_updateEvaluator",
        toolArguments: JSON.stringify({ evaluatorId: "evaluator-b" }),
        toolResultContent: "{}",
      },
      ...handlers,
    });

    expect(handlers.evaluatorUpdated).not.toHaveBeenCalled();
  });
});
