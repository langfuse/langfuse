import {
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
  type AgUiMessage,
} from "@langfuse/shared/in-app-agent";
import {
  IN_APP_AGENT_LANGFUSE_MCP_TOOL_NAMES,
  IN_APP_AGENT_SANDBOX_TOOL_NAMES,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import {
  getInAppAgentToolDisplayName,
  getInAppAgentActivityProgressLabel,
  getInAppAgentToolProgressLabel,
  getInAppAgentToolProgressLabelResolution,
  getDrawerMessages,
  getInAppAgentError,
  isInAppAgentRateLimited,
  type InAppAiAgentMessage,
} from "./utils";

describe("getInAppAgentToolDisplayName", () => {
  it.each([
    ["docs_search", "search"],
    ["langfuse_getTraces", "getTraces"],
    ["langfuseDocs_search", "search"],
    ["read", "read"],
  ])("strips a display-only namespace from %s", (toolName, expected) => {
    expect(getInAppAgentToolDisplayName(toolName)).toBe(expected);
  });
});

const KNOWN_IN_APP_AGENT_PROGRESS_TOOLS = [
  ...[...IN_APP_AGENT_LANGFUSE_MCP_TOOL_NAMES].map(
    (toolName) => `langfuse_${toolName}`,
  ),
  ...IN_APP_AGENT_SANDBOX_TOOL_NAMES,
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
  "langfuseDocs_search",
  "langfuseDocs_fetch",
  "skill",
];

// Auto-parsed headlines that a human has reviewed. Add a new tool here only
// after reading the suggested label in the failure output. Prefer an override
// in utils.ts when the auto label is wrong.
const ACCEPTED_AUTO_IN_APP_AGENT_PROGRESS_LABELS: Record<string, string> = {
  langfuse_createAnnotationQueue: "Creating annotation queue",
  langfuse_createComment: "Creating comment",
  langfuse_createDashboard: "Creating dashboard",
  langfuse_createDatasetRunItem: "Creating dataset run item",
  langfuse_createEvaluationRule: "Creating evaluation rule",
  langfuse_createModel: "Creating model",
  langfuse_createScore: "Creating score",
  langfuse_createScoreConfig: "Creating score config",
  langfuse_deleteAnnotationQueueItem: "Deleting annotation queue item",
  langfuse_deleteDashboard: "Deleting dashboard",
  langfuse_deleteDatasetItem: "Deleting dataset item",
  langfuse_deleteDatasetRun: "Deleting dataset run",
  langfuse_deleteEvaluationRule: "Deleting evaluation rule",
  langfuse_deleteEvaluator: "Deleting evaluator",
  langfuse_deleteModel: "Deleting model",
  langfuse_deleteScoreConfig: "Deleting score config",
  langfuse_getAlert: "Inspecting alert",
  langfuse_getAnnotationQueue: "Inspecting annotation queue",
  langfuse_getAnnotationQueueItem: "Inspecting annotation queue item",
  langfuse_getComment: "Inspecting comment",
  langfuse_getDashboard: "Inspecting dashboard",
  langfuse_getDataset: "Inspecting dataset",
  langfuse_getDatasetItem: "Inspecting dataset item",
  langfuse_getDatasetRun: "Inspecting dataset run",
  langfuse_getEvaluationRule: "Inspecting evaluation rule",
  langfuse_getEvaluator: "Inspecting evaluator",
  langfuse_getMedia: "Inspecting media",
  langfuse_getModel: "Inspecting model",
  langfuse_getObservation: "Inspecting observation",
  langfuse_getPrompt: "Inspecting prompt",
  langfuse_getScore: "Inspecting score",
  langfuse_getScoreConfig: "Inspecting score config",
  langfuse_getV4MigrationData: "Inspecting v4 migration data",
  langfuse_listAlerts: "Browsing alerts",
  langfuse_listAnnotationQueueItems: "Browsing annotation queue items",
  langfuse_listAnnotationQueues: "Browsing annotation queues",
  langfuse_listComments: "Browsing comments",
  langfuse_listDashboards: "Browsing dashboards",
  langfuse_listDatasetItems: "Browsing dataset items",
  langfuse_listDatasetRunItems: "Browsing dataset run items",
  langfuse_listDatasetRuns: "Browsing dataset runs",
  langfuse_listDatasets: "Browsing datasets",
  langfuse_listEvaluationRules: "Browsing evaluation rules",
  langfuse_listEvaluators: "Browsing evaluators",
  langfuse_listManagedEvaluatorTemplates:
    "Browsing managed evaluator templates",
  langfuse_listExperimentItems: "Browsing experiment items",
  langfuse_listExperiments: "Browsing experiments",
  langfuse_listModels: "Browsing models",
  langfuse_listObservations: "Browsing observations",
  langfuse_listPrompts: "Browsing prompts",
  langfuse_listScoreConfigs: "Browsing score configs",
  langfuse_listScores: "Browsing scores",
  langfuse_updateAnnotationQueueItem: "Updating annotation queue item",
  langfuse_updateDashboard: "Updating dashboard",
  langfuse_updateEvaluationRule: "Updating evaluation rule",
  langfuse_updateScoreConfig: "Updating score config",
  langfuse_upsertDataset: "Saving dataset",
  langfuse_upsertDatasetItem: "Saving dataset item",
  langfuse_createEvaluator: "Creating evaluator",
  langfuse_updateEvaluator: "Updating evaluator",
  langfuse_attachEvaluatorToEvaluationRule:
    "Attach Evaluator To Evaluation Rule",
  langfuse_detachEvaluatorFromEvaluationRule:
    "Detach Evaluator From Evaluation Rule",
};

describe("getInAppAgentToolProgressLabel", () => {
  it("requires a reviewed headline for every known tool", () => {
    const unresolved: string[] = [];
    const staleAccepted: string[] = [];

    for (const toolName of KNOWN_IN_APP_AGENT_PROGRESS_TOOLS) {
      const resolution = getInAppAgentToolProgressLabelResolution(toolName);
      const acceptedAutoLabel =
        ACCEPTED_AUTO_IN_APP_AGENT_PROGRESS_LABELS[toolName];

      if (resolution.source !== "auto") {
        if (acceptedAutoLabel !== undefined) {
          staleAccepted.push(
            `${toolName} is ${resolution.source} ("${resolution.label}") but still listed as accepted auto`,
          );
        }
        continue;
      }

      if (acceptedAutoLabel === undefined) {
        unresolved.push(`${toolName} → "${resolution.label}"`);
        continue;
      }

      if (acceptedAutoLabel !== resolution.label) {
        unresolved.push(
          `${toolName} auto label is now "${resolution.label}" (accepted "${acceptedAutoLabel}")`,
        );
      }
    }

    const extraAccepted = Object.keys(
      ACCEPTED_AUTO_IN_APP_AGENT_PROGRESS_LABELS,
    ).filter(
      (toolName) => !KNOWN_IN_APP_AGENT_PROGRESS_TOOLS.includes(toolName),
    );

    expect({
      unresolved,
      staleAccepted,
      extraAccepted,
    }).toEqual({
      unresolved: [],
      staleAccepted: [],
      extraAccepted: [],
    });
  });

  it.each([
    ["docs_search", "Reading Langfuse docs"],
    ["skill", "Learning skill"],
    ["customThing", "Custom Thing"],
  ])("labels %s as %s", (toolName, expected) => {
    expect(getInAppAgentToolProgressLabel(toolName)).toBe(expected);
  });

  it("keeps one headline for consecutive tools that share a noun", () => {
    expect(
      getInAppAgentActivityProgressLabel([
        "langfuse_getObservation",
        "langfuse_listObservations",
      ]),
    ).toBe("Looking at observations");
    expect(
      getInAppAgentActivityProgressLabel(["langfuse_listObservations"]),
    ).toBe("Browsing observations");
    expect(
      getInAppAgentActivityProgressLabel([
        "langfuseDocs_search",
        "langfuse_listObservations",
      ]),
    ).toBe("Browsing observations");
    expect(
      getInAppAgentActivityProgressLabel([
        "langfuse_getObservationFilterValues",
        "langfuse_getObservationFilterValues",
      ]),
    ).toBe("Looking up observation filters");
  });

  it("keeps a readable headline for every known tool", () => {
    const awkward = /Looking at up\b|Propose Redirect/;
    const labels = KNOWN_IN_APP_AGENT_PROGRESS_TOOLS.flatMap((toolName) => [
      `${toolName} → ${getInAppAgentActivityProgressLabel([toolName])}`,
      `${toolName}×2 → ${getInAppAgentActivityProgressLabel([toolName, toolName])}`,
    ]);

    expect(labels.filter((label) => awkward.test(label))).toEqual([]);
  });
});

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

  it("forwards text timestamps and streaming state to the message renderer", () => {
    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: true,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "Partial answer",
          isLoading: true,
          timestamp: 1_723_111_753_000,
        },
      ] satisfies InAppAiAgentMessage[],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "assistant-1",
        timestamp: 1_723_111_753_000,
        content: {
          type: "text",
          text: "Partial answer",
          isStreaming: true,
        },
      },
    ]);
  });

  it("keeps consecutive reasoning messages as separate thought blocks", () => {
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
        {
          id: "reasoning-2",
          role: "reasoning",
          content: "The p95 spike lines up with one endpoint.",
        },
        {
          id: "reasoning-3",
          role: "reasoning",
          content: "",
          isLoading: true,
        },
      ] satisfies InAppAiAgentMessage[],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "user-1",
        role: "user",
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
      {
        id: "reasoning-2",
        role: "assistant",
        content: {
          type: "reasoning",
          text: "The p95 spike lines up with one endpoint.",
          isStreaming: false,
        },
      },
      {
        id: "reasoning-3",
        role: "assistant",
        content: {
          type: "reasoning",
          text: "",
          isStreaming: true,
        },
      },
    ]);
    expect(mappedMessages).toHaveLength(4);
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
        content: { type: "toolGroup" },
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
        content: { type: "toolGroup" },
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
        content: { type: "toolGroup" },
      },
    ]);
    expect(completedMessages).toMatchObject([
      { id: "user-1" },
      {
        id: "tools-assistant-1",
        content: { type: "toolGroup" },
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
