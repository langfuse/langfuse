import type { AgUiMessage } from "@/src/ee/features/in-app-agent/schema";
import {
  extractLangfuseDocsSources,
  getDrawerMessages,
  getInAppAgentError,
  isInAppAgentRateLimited,
  type InAppAiAgentMessage,
} from "./utils";

describe("getInAppAgentError", () => {
  const now = new Date("2026-07-08T20:00:54.997Z").getTime();
  const rateLimitError = {
    message: "Rate limit exceeded",
    code: "rate_limited",
    details: {
      retryAfterSeconds: 12,
      limit: 30,
      remaining: 0,
      resetAt: "2026-07-08T20:01:06.997Z",
    },
  };

  it("extracts a rate limit from a streamed MCP error", () => {
    expect(
      getInAppAgentError(
        {
          message: `Failed to initialize Langfuse MCP: Streamable HTTP error: Error POSTing to endpoint: ${JSON.stringify(rateLimitError)}`,
        },
        now,
      ),
    ).toEqual({
      type: "rate_limit",
      retryAt: now + 12_000,
    });
  });

  it("extracts a rate limit from a direct HTTP error payload", () => {
    expect(getInAppAgentError({ payload: rateLimitError }, now)).toEqual({
      type: "rate_limit",
      retryAt: now + 12_000,
    });
  });

  it("checks rate limits against the current time", () => {
    const error = getInAppAgentError({ payload: rateLimitError }, now);

    expect(isInAppAgentRateLimited(error, now + 11_999)).toBe(true);
    expect(isInAppAgentRateLimited(error, now + 12_000)).toBe(false);
  });

  it("preserves unrelated errors as generic errors", () => {
    expect(
      getInAppAgentError({ message: "Assistant connection failed" }, now),
    ).toEqual({
      type: "generic",
      message: "Assistant connection failed",
    });
  });

  it("does not classify malformed embedded JSON as a rate limit", () => {
    const message = 'Failed to initialize Langfuse MCP: {"code":"rate_limited"';

    expect(getInAppAgentError({ message }, now)).toEqual({
      type: "generic",
      message,
    });
  });
});

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
          status: "succeeded",
          result,
        },
        {
          type: "tool",
          name: "langfuse_queryMetrics",
          args: "{}",
          status: "succeeded",
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
          status: "succeeded",
          result,
        },
      ]),
    ).toEqual([]);
  });
});

describe("getDrawerMessages", () => {
  it("maps tool results to explicit display statuses", () => {
    const rejectionMessage = "Tool call was not approved by the user.";
    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: true,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "tool-call-running",
              type: "function",
              function: { name: "running-tool", arguments: "{}" },
            },
            {
              id: "tool-call-succeeded",
              type: "function",
              function: { name: "succeeded-tool", arguments: "{}" },
            },
            {
              id: "tool-call-failed",
              type: "function",
              function: { name: "failed-tool", arguments: "{}" },
            },
            {
              id: "tool-call-denied",
              type: "function",
              function: { name: "denied-tool", arguments: "{}" },
            },
            {
              id: "tool-call-legacy-denied",
              type: "function",
              function: { name: "legacy-denied-tool", arguments: "{}" },
            },
          ],
        },
        {
          id: "result-succeeded",
          role: "tool",
          toolCallId: "tool-call-succeeded",
          content: JSON.stringify({ success: true }),
        },
        {
          id: "result-failed",
          role: "tool",
          toolCallId: "tool-call-failed",
          content: "Tool execution failed.",
          error: "Tool execution failed.",
        },
        {
          id: "result-denied",
          role: "tool",
          toolCallId: "tool-call-denied",
          content: rejectionMessage,
          error: JSON.stringify({
            code: "tool_call_rejected",
            message: rejectionMessage,
          }),
        },
        {
          id: "result-legacy-denied",
          role: "tool",
          toolCallId: "tool-call-legacy-denied",
          content: rejectionMessage,
          error: rejectionMessage,
        },
      ] satisfies AgUiMessage[],
    });

    expect(mappedMessages).toMatchObject([
      {
        content: {
          type: "toolGroup",
          tools: [
            { name: "running-tool", status: "running" },
            { name: "succeeded-tool", status: "succeeded" },
            {
              name: "failed-tool",
              status: "failed",
              error: "Tool execution failed.",
            },
            {
              name: "denied-tool",
              status: "denied",
              error: rejectionMessage,
            },
            {
              name: "legacy-denied-tool",
              status: "denied",
              error: rejectionMessage,
            },
          ],
        },
      },
    ]);
  });

  it.each([
    { error: null, isRunning: false, scenario: "the run stops" },
    {
      error: "The run was interrupted before the tool returned.",
      isRunning: true,
      scenario: "the run errors",
    },
  ])(
    "marks result-less tools failed when $scenario",
    ({ error, isRunning }) => {
      const mappedMessages = getDrawerMessages({
        error,
        isRunning,
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "tool-call-1",
                type: "function",
                function: { name: "interrupted-tool", arguments: "{}" },
              },
            ],
          },
        ] satisfies AgUiMessage[],
      });

      expect(mappedMessages).toMatchObject([
        {
          content: {
            type: "toolGroup",
            tools: [{ name: "interrupted-tool", status: "failed" }],
          },
        },
      ]);
    },
  );

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
          isLoading: true,
        },
      ] satisfies InAppAiAgentMessage[],
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

  it("completes reasoning while a later tool call runs before the assistant response", () => {
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
          isLoading: false,
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          isLoading: true,
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
      ] satisfies InAppAiAgentMessage[],
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
          isLoading: true,
        },
      },
    ]);
  });

  it("keeps only the active tool loading in a multi-step tool loop", () => {
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
          isLoading: false,
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          isLoading: false,
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
          content: JSON.stringify({ error: "Metrics API unavailable" }),
        },
        {
          id: "reasoning-2",
          role: "reasoning",
          content: "The metrics query failed, retrying with a smaller window.",
          isLoading: false,
        },
        {
          id: "assistant-2",
          role: "assistant",
          content: "",
          isLoading: true,
          toolCalls: [
            {
              id: "tool-call-2",
              type: "function",
              function: {
                name: "langfuse_queryMetrics",
                arguments: JSON.stringify({ view: "traces", limit: 10 }),
              },
            },
          ],
        },
      ] satisfies InAppAiAgentMessage[],
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
          isStreaming: false,
        },
      },
      {
        id: "tools-assistant-1",
        content: { type: "toolGroup", isLoading: false },
      },
      {
        id: "reasoning-2",
        content: {
          type: "reasoning",
          isStreaming: false,
        },
      },
      {
        id: "tools-assistant-2",
        content: { type: "toolGroup", isLoading: true },
      },
    ]);
  });

  it("keeps a tool group loading while any grouped tool call is active", () => {
    const messages = [
      {
        id: "user-1",
        role: "user",
        content: "Compare trace and observation metrics",
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
          {
            id: "tool-call-2",
            type: "function",
            function: {
              name: "langfuse_queryMetrics",
              arguments: JSON.stringify({ view: "observations" }),
            },
          },
        ],
      },
      {
        id: "tool-result-1",
        role: "tool",
        toolCallId: "tool-call-1",
        content: JSON.stringify({ count: 10 }),
      },
    ] satisfies AgUiMessage[];

    const activeMessages = getDrawerMessages({
      error: null,
      isRunning: true,
      messages: messages.map((message) =>
        message.id === "assistant-1"
          ? { ...message, isLoading: true }
          : message,
      ),
    });
    const completedMessages = getDrawerMessages({
      error: null,
      isRunning: true,
      messages: messages.map((message) =>
        message.id === "assistant-1"
          ? { ...message, isLoading: false }
          : message,
      ),
    });

    expect(activeMessages).toMatchObject([
      { id: "user-1" },
      {
        id: "tools-assistant-1",
        content: { type: "toolGroup", isLoading: true },
      },
    ]);
    expect(completedMessages).toMatchObject([
      { id: "user-1" },
      {
        id: "tools-assistant-1",
        content: { type: "toolGroup", isLoading: false },
      },
    ]);
  });

  it("drops completed reasoning messages without content but keeps streaming ones", () => {
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
          // Adaptive thinking can emit a reasoning start/end pair without any
          // content; once completed there is nothing to disclose.
          id: "reasoning-empty",
          role: "reasoning",
          content: "",
          isLoading: false,
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "I found 12 failed traces in the selected window.",
        },
        {
          id: "user-2",
          role: "user",
          content: "And in the week before?",
        },
        {
          id: "reasoning-live",
          role: "reasoning",
          content: "",
          isLoading: true,
        },
      ] satisfies InAppAiAgentMessage[],
    });

    expect(mappedMessages).toMatchObject([
      { id: "user-1" },
      { id: "assistant-1" },
      { id: "user-2" },
      {
        id: "reasoning-live",
        content: { type: "reasoning", text: "", isStreaming: true },
      },
    ]);
    expect(mappedMessages).toHaveLength(4);
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
          isLoading: false,
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
      ] satisfies InAppAiAgentMessage[],
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
          isLoading: false,
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
