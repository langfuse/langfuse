import type { AgUiMessage } from "@/src/ee/features/in-app-agent/schema";
import { extractLangfuseDocsSources, getDrawerMessages } from "./utils";

describe("extractLangfuseDocsSources", () => {
  it("extracts and deduplicates document sources from docs tool results", () => {
    const result = JSON.stringify({
      _meta: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                content: [
                  { type: "text", text: "Search result" },
                  {
                    type: "document",
                    title: "Core Concepts",
                    url: "https://langfuse.com/docs/evaluation/core-concepts",
                  },
                  {
                    type: "document",
                    title: "Scores",
                    url: "https://langfuse.com/docs/evaluation/scores/overview",
                  },
                ],
              }),
            },
          },
          {
            message: {
              content: JSON.stringify({
                content: [
                  {
                    type: "document",
                    title: "Datasets",
                    url: "https://langfuse.com/docs/datasets/overview",
                  },
                ],
              }),
            },
          },
          {
            message: {
              content: JSON.stringify({
                content: [
                  {
                    type: "document",
                    title: "Scores duplicate",
                    url: "https://langfuse.com/docs/evaluation/scores/overview",
                  },
                ],
              }),
            },
          },
        ],
      },
    });

    expect(
      extractLangfuseDocsSources([
        {
          type: "tool",
          name: "langfuseDocs_search",
          args: "{}",
          result,
        },
        {
          type: "tool",
          name: "langfuse_queryMetrics",
          args: "{}",
          result,
        },
      ]),
    ).toEqual([
      {
        title: "Core Concepts",
        url: "https://langfuse.com/docs/evaluation/core-concepts",
        faviconUrl: "https://langfuse.com/favicon.ico",
      },
      {
        title: "Scores",
        url: "https://langfuse.com/docs/evaluation/scores/overview",
        faviconUrl: "https://langfuse.com/favicon.ico",
      },
      {
        title: "Datasets",
        url: "https://langfuse.com/docs/datasets/overview",
        faviconUrl: "https://langfuse.com/favicon.ico",
      },
    ]);
  });

  it("ignores malformed structured sources", () => {
    const result = JSON.stringify({
      _meta: {
        choices: [
          { message: { content: "not json" } },
          { message: { content: JSON.stringify({ content: "not array" }) } },
          {
            message: {
              content: JSON.stringify({
                content: [
                  { type: "document", title: "Missing URL" },
                  { type: "document", title: "Blank URL", url: "   " },
                  {
                    type: "document",
                    title: "Unsafe protocol",
                    url: "javascript:alert(1)",
                  },
                ],
              }),
            },
          },
        ],
      },
    });

    expect(
      extractLangfuseDocsSources([
        {
          type: "tool",
          name: "langfuseDocs_search",
          args: "{}",
          result,
        },
      ]),
    ).toEqual([]);
  });
});

describe("getDrawerMessages", () => {
  it("attaches docs sources to the answer after a search preamble", () => {
    const docsResult = JSON.stringify({
      _meta: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                content: [
                  {
                    type: "document",
                    url: "https://langfuse.com/docs/audit-logs",
                    title: "Audit Logs",
                  },
                ],
              }),
            },
          },
        ],
      },
    });

    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: false,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Does Langfuse have access logging?",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content:
            "I'll search the Langfuse documentation for information about access logging.",
          toolCalls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "langfuseDocs_search",
                arguments: "{}",
              },
            },
          ],
        },
        {
          id: "tool-result-1",
          role: "tool",
          toolCallId: "tool-call-1",
          content: docsResult,
        },
        {
          id: "assistant-2",
          role: "assistant",
          content: "Yes, Langfuse has audit logging available.",
        },
      ] satisfies AgUiMessage[],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "user-1",
        content: { type: "text" },
      },
      {
        id: "assistant-1",
        content: {
          type: "text",
          text: "I'll search the Langfuse documentation for information about access logging.",
        },
      },
      {
        id: "assistant-1-tools",
        content: { type: "toolGroup" },
      },
      {
        id: "assistant-2",
        content: {
          type: "text",
          text: "Yes, Langfuse has audit logging available.",
          sources: [
            {
              title: "Audit Logs",
              url: "https://langfuse.com/docs/audit-logs",
              faviconUrl: "https://langfuse.com/favicon.ico",
            },
          ],
        },
      },
    ]);

    expect(mappedMessages[1]?.content).not.toHaveProperty("sources");
  });

  it("shows live reasoning messages while the run is active", () => {
    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: true,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Investigate latency spikes",
        },
        {
          id: "reasoning-1",
          role: "reasoning",
          content: "Checking recent traces before querying metrics.",
        },
      ] satisfies AgUiMessage[],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Investigate latency spikes",
        },
      },
      {
        id: "reasoning-1",
        role: "assistant",
        content: {
          type: "reasoning",
          text: "Checking recent traces before querying metrics.",
          isStreaming: true,
        },
      },
    ]);
    expect(mappedMessages).toHaveLength(2);
  });

  it("keeps completed live reasoning messages when the run is no longer active", () => {
    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: false,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Investigate latency spikes",
        },
        {
          id: "reasoning-1",
          role: "reasoning",
          content: "This should stay visible until the drawer is reloaded.",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "Here is the final answer.",
        },
      ] satisfies AgUiMessage[],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Investigate latency spikes",
        },
      },
      {
        id: "reasoning-1",
        role: "assistant",
        content: {
          type: "reasoning",
          text: "This should stay visible until the drawer is reloaded.",
          isStreaming: false,
        },
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: {
          type: "text",
          text: "Here is the final answer.",
        },
      },
    ]);
    expect(mappedMessages).toHaveLength(3);
  });

  it("marks reasoning complete when a run stops before assistant text arrives", () => {
    const mappedMessages = getDrawerMessages({
      error: "The run was interrupted before an answer was generated.",
      isRunning: false,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Investigate latency spikes",
        },
        {
          id: "reasoning-1",
          role: "reasoning",
          content: "Checking recent traces before querying metrics.",
        },
      ] satisfies AgUiMessage[],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "user-1",
        role: "user",
        content: {
          type: "text",
          text: "Investigate latency spikes",
        },
      },
      {
        id: "reasoning-1",
        role: "assistant",
        content: {
          type: "reasoning",
          text: "Checking recent traces before querying metrics.",
          isStreaming: false,
        },
      },
    ]);
    expect(mappedMessages).toHaveLength(2);
  });

  it("keeps reasoning alongside later assistant and tool messages during an active run", () => {
    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: true,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Find failed traces",
        },
        {
          id: "reasoning-1",
          role: "reasoning",
          content: "Looking for error-level traces first.",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "langfuse_queryMetrics",
                arguments: JSON.stringify({ view: "traces" }),
              },
            },
          ],
        },
        {
          id: "tool-result-1",
          role: "tool",
          toolCallId: "tool-call-1",
          content: JSON.stringify({ data: [{ count_count: 12 }] }),
        },
        {
          id: "assistant-2",
          role: "assistant",
          content: "I found 12 failed traces in the selected window.",
        },
      ] satisfies AgUiMessage[],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "user-1",
        content: { type: "text" },
      },
      {
        id: "reasoning-1",
        content: {
          type: "reasoning",
          text: "Looking for error-level traces first.",
          isStreaming: false,
        },
      },
      {
        id: "tools-assistant-1",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_queryMetrics",
              result: JSON.stringify({ data: [{ count_count: 12 }] }),
            },
          ],
        },
      },
      {
        id: "assistant-2",
        content: {
          type: "text",
          text: "I found 12 failed traces in the selected window.",
        },
      },
    ]);
    expect(mappedMessages).toHaveLength(4);
  });

  it("keeps reasoning open while later tool calls run before the assistant response", () => {
    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: true,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Find failed traces",
        },
        {
          id: "reasoning-1",
          role: "reasoning",
          content: "Looking for error-level traces first.",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "langfuse_queryMetrics",
                arguments: JSON.stringify({ view: "traces" }),
              },
            },
          ],
        },
      ] satisfies AgUiMessage[],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "user-1",
        content: { type: "text" },
      },
      {
        id: "reasoning-1",
        content: {
          type: "reasoning",
          text: "Looking for error-level traces first.",
          isStreaming: true,
        },
      },
      {
        id: "tools-assistant-1",
        content: {
          type: "toolGroup",
          isLoading: true,
        },
      },
    ]);
  });

  it("adds pending tool approvals as approval tool groups", () => {
    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: false,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Create a dataset",
        },
      ] satisfies AgUiMessage[],
      pendingToolApprovals: [
        {
          id: "tool-call-1",
          approvalRequest: {
            type: "tool_approval_request",
            toolCallId: "tool-call-1",
            toolName: "langfuse_upsertDataset",
            args: { name: "regression-examples" },
            runId: "run-1",
          },
          status: "pending",
        },
      ],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "user-1",
        content: { type: "text" },
      },
      {
        id: "tool-approval-tool-call-1",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_upsertDataset",
              args: JSON.stringify({ name: "regression-examples" }),
              approval: {
                id: "tool-call-1",
                status: "pending",
              },
            },
          ],
        },
      },
    ]);
  });

  it("attaches pending approvals to matching persisted tool calls", () => {
    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: false,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Create a dataset",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "langfuse_upsertDataset",
                arguments: JSON.stringify({ name: "regression-examples" }),
              },
            },
          ],
        },
      ] satisfies AgUiMessage[],
      pendingToolApprovals: [
        {
          id: "tool-call-1",
          approvalRequest: {
            type: "tool_approval_request",
            toolCallId: "tool-call-1",
            toolName: "langfuse_upsertDataset",
            args: { name: "regression-examples" },
            runId: "run-1",
          },
          status: "pending",
        },
      ],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "user-1",
        content: { type: "text" },
      },
      {
        id: "tools-assistant-1",
        role: "assistant",
        content: {
          type: "toolGroup",
          tools: [
            {
              type: "tool",
              name: "langfuse_upsertDataset",
              args: JSON.stringify({ name: "regression-examples" }),
              approval: {
                id: "tool-call-1",
                status: "pending",
              },
            },
          ],
        },
      },
    ]);
    expect(
      mappedMessages.some(
        (message) => message.id === "tool-approval-tool-call-1",
      ),
    ).toBe(false);
  });

  it("does not show a stale pending approval for an errored tool result", () => {
    const toolError =
      "MCP error -32602: Validation failed: categories: Category must be an array of objects with label value pairs, where labels and values are unique.";
    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: true,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Create a score config",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "langfuse_createScoreConfig",
                arguments: JSON.stringify({
                  name: "readiness",
                  categories: ["invalid"],
                }),
              },
            },
          ],
        },
        {
          id: "tool-call-1-approval-tool-result",
          role: "tool",
          toolCallId: "tool-call-1",
          content: toolError,
          error: toolError,
        },
      ] satisfies AgUiMessage[],
      pendingToolApprovals: [
        {
          id: "tool-call-1",
          approvalRequest: {
            type: "tool_approval_request",
            toolCallId: "tool-call-1",
            toolName: "langfuse_createScoreConfig",
            args: {
              name: "readiness",
              categories: ["invalid"],
            },
            runId: "run-1",
          },
          status: "pending",
        },
      ],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "user-1",
        content: { type: "text" },
      },
      {
        id: "tools-assistant-1",
        role: "assistant",
        content: {
          type: "toolGroup",
          isLoading: true,
          tools: [
            {
              type: "tool",
              name: "langfuse_createScoreConfig",
              args: JSON.stringify({
                name: "readiness",
                categories: ["invalid"],
              }),
              result: toolError,
              error: toolError,
            },
          ],
        },
      },
    ]);
    expect(mappedMessages).toHaveLength(2);
    expect(
      mappedMessages.some(
        (message) => message.id === "tool-approval-tool-call-1",
      ),
    ).toBe(false);

    const toolGroup = mappedMessages[1];
    expect(toolGroup?.content.type).toBe("toolGroup");
    if (toolGroup?.content.type === "toolGroup") {
      expect(toolGroup.content.tools[0]).not.toHaveProperty("approval");
    }
  });

  it("does not show a stale pending approval for a completed tool result", () => {
    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: false,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "langfuse_upsertDataset",
                arguments: JSON.stringify({ name: "regression-examples" }),
              },
            },
          ],
        },
        {
          id: "tool-result-1",
          role: "tool",
          toolCallId: "tool-call-1",
          content: JSON.stringify({ id: "dataset-1" }),
        },
      ] satisfies AgUiMessage[],
      pendingToolApprovals: [
        {
          id: "tool-call-1",
          approvalRequest: {
            type: "tool_approval_request",
            toolCallId: "tool-call-1",
            toolName: "langfuse_upsertDataset",
            args: { name: "regression-examples" },
            runId: "run-1",
          },
          status: "pending",
        },
      ],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "tools-assistant-1",
        content: {
          type: "toolGroup",
          tools: [
            {
              result: JSON.stringify({ id: "dataset-1" }),
            },
          ],
        },
      },
    ]);
    expect(mappedMessages).toHaveLength(1);
    const toolGroup = mappedMessages[0];
    expect(toolGroup?.content.type).toBe("toolGroup");
    if (toolGroup?.content.type === "toolGroup") {
      expect(toolGroup.content.tools[0]).not.toHaveProperty("approval");
    }
  });
});
