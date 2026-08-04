import { IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE } from "@langfuse/shared/in-app-agent";
import type { AgUiMessage } from "@langfuse/shared/in-app-agent";

import {
  getCompletedToolCalls,
  performToolSideEffectsForMessages,
  performToolSideEffectsForToolCall,
} from "./side-effects";

function createUtils() {
  return {
    dashboard: { invalidate: vi.fn().mockResolvedValue(undefined) },
    dashboardWidgets: { invalidate: vi.fn().mockResolvedValue(undefined) },
    prompts: { invalidate: vi.fn().mockResolvedValue(undefined) },
  };
}

describe("in-app agent tool side effects", () => {
  it("replays targeted invalidations for prompt and dashboard mutations", async () => {
    const messages = [
      {
        id: "prompt-call",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "prompt-tool-call",
            type: "function",
            function: {
              name: "langfuse_createTextPrompt",
              arguments: "{}",
            },
          },
        ],
      },
      {
        id: "prompt-result",
        role: "tool",
        toolCallId: "prompt-tool-call",
        content: '{"id":"prompt-1"}',
      },
      {
        id: "widget-call",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "widget-tool-call",
            type: "function",
            function: {
              name: "langfuse_createDashboardWidget",
              arguments: "{}",
            },
          },
        ],
      },
      {
        id: "widget-result",
        role: "tool",
        toolCallId: "widget-tool-call",
        content: '{"id":"widget-1"}',
      },
      {
        id: "placement-call",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "placement-tool-call",
            type: "function",
            function: {
              name: "langfuse_addDashboardPlacement",
              arguments: "{}",
            },
          },
        ],
      },
      {
        id: "placement-result",
        role: "tool",
        toolCallId: "placement-tool-call",
        content: '{"id":"placement-1"}',
      },
    ] satisfies AgUiMessage[];

    expect(getCompletedToolCalls(messages)).toEqual([
      {
        toolCallId: "prompt-tool-call",
        toolName: "langfuse_createTextPrompt",
        toolError: undefined,
      },
      {
        toolCallId: "widget-tool-call",
        toolName: "langfuse_createDashboardWidget",
        toolError: undefined,
      },
      {
        toolCallId: "placement-tool-call",
        toolName: "langfuse_addDashboardPlacement",
        toolError: undefined,
      },
    ]);

    const utils = createUtils();
    await performToolSideEffectsForMessages({
      messages,
      handledToolCallIds: new Set(),
      utils: utils as never,
    });

    expect(utils.prompts.invalidate).toHaveBeenCalledOnce();
    expect(utils.dashboardWidgets.invalidate).toHaveBeenCalledOnce();
    expect(utils.dashboard.invalidate).toHaveBeenCalledTimes(2);
  });

  it("skips rejected mutations and does not invalidate a handled tool twice", async () => {
    const messages = [
      {
        id: "rejected-call",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "rejected-tool-call",
            type: "function",
            function: {
              name: "langfuse_createTextPrompt",
              arguments: "{}",
            },
          },
        ],
      },
      {
        id: "rejected-result",
        role: "tool",
        toolCallId: "rejected-tool-call",
        content: "rejected",
        error: JSON.stringify({ code: IN_APP_AGENT_TOOL_REJECTION_ERROR_CODE }),
      },
      {
        id: "success-call",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "success-tool-call",
            type: "function",
            function: {
              name: "langfuse_createTextPrompt",
              arguments: "{}",
            },
          },
        ],
      },
      {
        id: "success-result",
        role: "tool",
        toolCallId: "success-tool-call",
        content: '{"id":"prompt-1"}',
      },
    ] satisfies AgUiMessage[];
    const utils = createUtils();
    const handledToolCallIds = new Set<string>();

    await performToolSideEffectsForToolCall({
      toolCallId: "success-tool-call",
      toolName: "langfuse_createTextPrompt",
      handledToolCallIds,
      utils: utils as never,
    });
    await performToolSideEffectsForMessages({
      messages,
      handledToolCallIds,
      utils: utils as never,
    });

    expect(utils.prompts.invalidate).toHaveBeenCalledOnce();
    expect(utils.dashboard.invalidate).not.toHaveBeenCalled();
    expect(handledToolCallIds).toEqual(new Set(["success-tool-call"]));
  });
});
