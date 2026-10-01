import { type ComponentProps } from "react";
import { type SessionConversationTimelineTrace } from "./components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
type TraceProps = ComponentProps<typeof SessionConversationTimelineTrace>;
type TranscriptState = Extract<TraceProps["state"], { type: "transcript" }>;
type WorkflowTrace = Pick<TraceProps, "trace" | "turnNumber"> & {
  state: Omit<TranscriptState, "observations"> & {
    observations: Array<
      Pick<
        TranscriptState["observations"][number],
        "id" | "traceId" | "name" | "startTime" | "environment"
      >
    >;
  };
};

// Generated from the pre-transcript workflow observations at d50d19c5f8.
export const supportAgentWorkflow: WorkflowTrace[] = [
  {
    trace: {
      id: "trace-order-support-8f3a2",
      name: "Resolve delivery address request",
      timestamp: new Date("2026-01-01T12:14:03.000Z"),
      environment: "production",
      userId: "customer-48291",
      observationCount: 5,
      latencyMs: 4260,
      scores: [],
    },
    turnNumber: 1,
    state: {
      type: "transcript",
      result: {
        state: "loaded",
        cutoff: false,
        transcript: {
          threads: [
            {
              conversationHistory: [],
              currentTurn: {
                messages: [
                  {
                    role: "system",
                    parts: [
                      {
                        type: "text",
                        text: "You are Acme's customer support agent. Verify order details before making changes. Never promise an address update after an order has shipped.",
                      },
                    ],
                    source: "input",
                    observationId: "generation-1",
                    traceId: "trace-order-support-8f3a2",
                    startTime: new Date("2026-01-01T12:14:03.000Z"),
                    endTime: new Date("2026-01-01T12:14:03.810Z"),
                  },
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "Hi, I just noticed order #LF-20481 is going to my old address. Can you send it to 12 Market Street, San Francisco, CA 94105 instead?",
                      },
                    ],
                    source: "input",
                    observationId: "generation-1",
                    traceId: "trace-order-support-8f3a2",
                    startTime: new Date("2026-01-01T12:14:03.000Z"),
                    endTime: new Date("2026-01-01T12:14:03.810Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "I'll check whether the order can still be updated.",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-order-lookup",
                        toolName: "Get order",
                        input: { orderId: "LF-20481" },
                        toolType: "function",
                      },
                    ],
                    source: "output",
                    observationId: "generation-1",
                    traceId: "trace-order-support-8f3a2",
                    startTime: new Date("2026-01-01T12:14:03.000Z"),
                    endTime: new Date("2026-01-01T12:14:03.810Z"),
                  },
                  {
                    observationId: "tool-order-lookup",
                    traceId: "trace-order-support-8f3a2",
                    startTime: new Date("2026-01-01T12:14:03.810Z"),
                    endTime: new Date("2026-01-01T12:14:04.150Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-order-lookup",
                        toolName: "Get order",
                        output: {
                          orderId: "LF-20481",
                          status: "processing",
                          carrier: "UPS",
                          estimatedDelivery: "2026-01-04",
                          shippingAddress: {
                            line1: "800 Pine Street",
                            city: "Seattle",
                            state: "WA",
                            postalCode: "98101",
                          },
                        },
                      },
                    ],
                  },
                ],
                nestingLevel: 0,
                observations: [
                  { id: "generation-1", traceId: "trace-order-support-8f3a2" },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-order-lookup",
                      output: {
                        orderId: "LF-20481",
                        status: "processing",
                        addressCanBeChanged: true,
                      },
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "reasoning",
                        content: {
                          kind: "text",
                          text: "The order is still processing and permits address changes, so it is safe to update it.",
                        },
                      },
                      {
                        type: "text",
                        text: "The order is still processing, so I can update the delivery address.",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-address-update",
                        toolName: "Update shipping address",
                        input: {
                          orderId: "LF-20481",
                          address: "12 Market Street, San Francisco, CA 94105",
                        },
                        toolType: "function",
                      },
                    ],
                    source: "output",
                    observationId: "generation-2",
                    traceId: "trace-order-support-8f3a2",
                    startTime: new Date("2026-01-01T12:14:04.150Z"),
                    endTime: new Date("2026-01-01T12:14:05.080Z"),
                  },
                  {
                    observationId: "tool-address-update",
                    traceId: "trace-order-support-8f3a2",
                    startTime: new Date("2026-01-01T12:14:05.080Z"),
                    endTime: new Date("2026-01-01T12:14:05.410Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-address-update",
                        toolName: "Update shipping address",
                        output: {
                          success: true,
                          confirmationId: "addr_7b19c2",
                          updatedAt: "2026-01-01T12:14:05.410Z",
                        },
                      },
                    ],
                  },
                ],
                nestingLevel: 0,
                observations: [
                  { id: "generation-2", traceId: "trace-order-support-8f3a2" },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-address-update",
                      output: { success: true, confirmationId: "addr_7b19c2" },
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "Your shipping address has been updated to **12 Market Street, San Francisco, CA 94105**.\n\nOrder **#LF-20481** is still expected by **January 4**. You'll receive tracking details by email once it ships.",
                      },
                    ],
                    source: "output",
                    observationId: "generation-3",
                    traceId: "trace-order-support-8f3a2",
                    startTime: new Date("2026-01-01T12:14:05.410Z"),
                    endTime: new Date("2026-01-01T12:14:06.260Z"),
                  },
                ],
                nestingLevel: 0,
                observations: [
                  { id: "generation-3", traceId: "trace-order-support-8f3a2" },
                ],
              },
            },
          ],
        },
      },
      observations: [
        {
          id: "generation-1",
          traceId: "trace-order-support-8f3a2",
          name: "Plan support response",
          startTime: new Date("2026-01-01T12:14:03.000Z"),
          environment: "production",
        },
        {
          id: "tool-order-lookup",
          traceId: "trace-order-support-8f3a2",
          name: "Get order",
          startTime: new Date("2026-01-01T12:14:03.810Z"),
          environment: "production",
        },
        {
          id: "generation-2",
          traceId: "trace-order-support-8f3a2",
          name: "Decide next action",
          startTime: new Date("2026-01-01T12:14:04.150Z"),
          environment: "production",
        },
        {
          id: "tool-address-update",
          traceId: "trace-order-support-8f3a2",
          name: "Update shipping address",
          startTime: new Date("2026-01-01T12:14:05.080Z"),
          environment: "production",
        },
        {
          id: "generation-3",
          traceId: "trace-order-support-8f3a2",
          name: "Compose final response",
          startTime: new Date("2026-01-01T12:14:05.410Z"),
          environment: "production",
        },
      ],
      filtered: false,
    },
  },
];
export const codingAgentWorkflow: WorkflowTrace[] = [
  {
    trace: {
      id: "trace-demo-research-turn",
      name: "Research recipe dashboard density setting",
      timestamp: new Date("2026-01-02T09:30:00.000Z"),
      environment: "storybook",
      userId: "demo-user",
      observationCount: 26,
      latencyMs: 87347,
      scores: [],
    },
    turnNumber: 2,
    state: {
      type: "transcript",
      result: {
        state: "loaded",
        cutoff: false,
        transcript: {
          threads: [
            {
              conversationHistory: [],
              currentTurn: {
                messages: [
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "Build a fictional recipe planner dashboard with a compact density option. Inspect the codebase, update the existing component and tests, then verify the change.",
                      },
                    ],
                    source: "input",
                    observationId: "research-generation-1",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:00.006Z"),
                    endTime: new Date("2026-01-02T09:30:13.230Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "I will load the frontend and Storybook guidance, index the fictional repository, and locate the dashboard entry points.",
                      },
                    ],
                    source: "output",
                    observationId: "research-generation-1",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:00.006Z"),
                    endTime: new Date("2026-01-02T09:30:13.230Z"),
                  },
                  {
                    observationId: "research-tool-1",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.230Z"),
                    endTime: new Date("2026-01-02T09:30:13.294Z"),
                    role: "assistant",
                    source: "output",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "call-research-tool-1",
                        toolName: "skill",
                        input: { name: "typescript" },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-1",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.230Z"),
                    endTime: new Date("2026-01-02T09:30:13.294Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-research-tool-1",
                        toolName: "skill",
                        output: { loaded: true },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-2",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.232Z"),
                    endTime: new Date("2026-01-02T09:30:13.293Z"),
                    role: "assistant",
                    source: "output",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "call-research-tool-2",
                        toolName: "skill",
                        input: { name: "storybook" },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-2",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.232Z"),
                    endTime: new Date("2026-01-02T09:30:13.293Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-research-tool-2",
                        toolName: "skill",
                        output: { loaded: true },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-3",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.234Z"),
                    endTime: new Date("2026-01-02T09:30:13.285Z"),
                    role: "assistant",
                    source: "output",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "call-research-tool-3",
                        toolName: "skill",
                        input: { name: "frontend-guidelines" },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-3",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.234Z"),
                    endTime: new Date("2026-01-02T09:30:13.285Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-research-tool-3",
                        toolName: "skill",
                        output: { loaded: true },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-4",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.236Z"),
                    endTime: new Date("2026-01-02T09:30:17.828Z"),
                    role: "assistant",
                    source: "output",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "call-research-tool-4",
                        toolName: "grepika_add_workspace",
                        input: { path: "~/demo/recipe-planner" },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-4",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.236Z"),
                    endTime: new Date("2026-01-02T09:30:17.828Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-research-tool-4",
                        toolName: "grepika_add_workspace",
                        output: { indexedFiles: 214 },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-5",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.238Z"),
                    endTime: new Date("2026-01-02T09:30:13.334Z"),
                    role: "assistant",
                    source: "output",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "call-research-tool-5",
                        toolName: "tilth_tilth_search",
                        input: { query: "RecipeDashboard" },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-5",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.238Z"),
                    endTime: new Date("2026-01-02T09:30:13.334Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-research-tool-5",
                        toolName: "tilth_tilth_search",
                        output: { matches: 6 },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-6",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.240Z"),
                    endTime: new Date("2026-01-02T09:30:13.629Z"),
                    role: "assistant",
                    source: "output",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "call-research-tool-6",
                        toolName: "tilth_tilth_files",
                        input: { patterns: ["src/features/recipes/**/*"] },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-6",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:13.240Z"),
                    endTime: new Date("2026-01-02T09:30:13.629Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-research-tool-6",
                        toolName: "tilth_tilth_files",
                        output: { files: 12 },
                      },
                    ],
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "research-generation-1",
                    traceId: "trace-demo-research-turn",
                  },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: "I will inspect the matching files.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-research-tool-1",
                      output: "TypeScript guidance loaded.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-research-tool-2",
                      output: "Storybook guidance loaded.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-research-tool-3",
                      output: "Frontend guidance loaded.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-research-tool-4",
                      output: "The demo workspace is indexed.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-research-tool-5",
                      output: "Found the dashboard and tests.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-research-tool-6",
                      output: "Found twelve recipe feature files.",
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "call-read-component",
                        toolName: "tilth_tilth_read",
                        input: {
                          path: "src/features/recipes/RecipeDashboard.tsx",
                        },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-read-test",
                        toolName: "tilth_tilth_read",
                        input: {
                          path: "src/features/recipes/RecipeDashboard.test.tsx",
                        },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-package",
                        toolName: "bash",
                        input: {
                          command: "pnpm --filter demo-app test --help",
                        },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-search-state",
                        toolName: "tilth_tilth_search",
                        input: { query: "sessionStorage" },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-list-stories",
                        toolName: "tilth_tilth_files",
                        input: { patterns: ["src/**/*.stories.tsx"] },
                        toolType: "function",
                      },
                    ],
                    source: "output",
                    observationId: "research-generation-2",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:17.828Z"),
                    endTime: new Date("2026-01-02T09:31:01.021Z"),
                  },
                  {
                    observationId: "research-tool-7",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:01.021Z"),
                    endTime: new Date("2026-01-02T09:31:01.031Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-read-component",
                        toolName: "tilth_tilth_read",
                        output: {
                          lines: 186,
                          summary:
                            "Dashboard component with toolbar and task cards.",
                        },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-8",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:01.023Z"),
                    endTime: new Date("2026-01-02T09:31:01.026Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-read-test",
                        toolName: "tilth_tilth_read",
                        output: {
                          lines: 122,
                          summary: "Existing rendering and filtering tests.",
                        },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-9",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:01.025Z"),
                    endTime: new Date("2026-01-02T09:31:35.012Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-package",
                        toolName: "bash",
                        output:
                          "Usage: test [filters]\nAll command examples are fictional.",
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-10",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:01.027Z"),
                    endTime: new Date("2026-01-02T09:31:07.889Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-search-state",
                        toolName: "tilth_tilth_search",
                        output: { matches: 4 },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-11",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:01.029Z"),
                    endTime: new Date("2026-01-02T09:31:08.138Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-list-stories",
                        toolName: "tilth_tilth_files",
                        output: { files: 19 },
                      },
                    ],
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "research-generation-2",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-7",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-8",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-9",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-10",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-11",
                    traceId: "trace-demo-research-turn",
                  },
                ],
              },
            },
            {
              conversationHistory: [],
              currentTurn: {
                messages: [
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "The dashboard uses local state and has an established toolbar checkbox pattern.",
                      },
                    ],
                    source: "input",
                    observationId: "research-generation-3",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:01.031Z"),
                    endTime: new Date("2026-01-02T09:31:10.691Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "call-index",
                        toolName: "grepika_index",
                        input: { force: false },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-read-storage",
                        toolName: "tilth_tilth_read",
                        input: { path: "src/hooks/useSessionPreference.ts" },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-find-tests",
                        toolName: "tilth_tilth_files",
                        input: {
                          patterns: ["src/features/recipes/*.test.tsx"],
                        },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-find-config",
                        toolName: "tilth_tilth_files",
                        input: { patterns: ["**/vitest.config.*"] },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-search-checkbox",
                        toolName: "tilth_tilth_search",
                        input: { query: "Hide archived" },
                        toolType: "function",
                      },
                    ],
                    source: "output",
                    observationId: "research-generation-3",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:01.031Z"),
                    endTime: new Date("2026-01-02T09:31:10.691Z"),
                  },
                  {
                    observationId: "research-tool-12",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:10.691Z"),
                    endTime: new Date("2026-01-02T09:31:10.918Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-index",
                        toolName: "grepika_index",
                        output: { indexedFiles: 214 },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-13",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:10.693Z"),
                    endTime: new Date("2026-01-02T09:31:10.698Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-read-storage",
                        toolName: "tilth_tilth_read",
                        output: { lines: 48 },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-14",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:10.695Z"),
                    endTime: new Date("2026-01-02T09:31:10.697Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-find-tests",
                        toolName: "tilth_tilth_files",
                        output: { files: 2 },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-15",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:10.697Z"),
                    endTime: new Date("2026-01-02T09:31:10.703Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-find-config",
                        toolName: "tilth_tilth_files",
                        output: { files: 1 },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-16",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:10.699Z"),
                    endTime: new Date("2026-01-02T09:31:10.835Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-search-checkbox",
                        toolName: "tilth_tilth_search",
                        output: { matches: 1 },
                      },
                    ],
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "research-generation-3",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-12",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-13",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-14",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-15",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-16",
                    traceId: "trace-demo-research-turn",
                  },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-index",
                      output: "Index refreshed.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-read-storage",
                      output: "A session preference hook already exists.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-find-tests",
                      output: "Two nearby test files found.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-find-config",
                      output: "One Vitest config found.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-search-checkbox",
                      output: "Found an analogous toolbar checkbox.",
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "I have the implementation pattern and will confirm its callers before editing.",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-final-search",
                        toolName: "tilth_tilth_search",
                        input: { query: "useSessionPreference" },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-final-files",
                        toolName: "tilth_tilth_files",
                        input: { patterns: ["src/features/recipes/*"] },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-related",
                        toolName: "grepika_search",
                        input: { query: "recipe filtering toolbar" },
                        toolType: "function",
                      },
                    ],
                    source: "output",
                    observationId: "research-generation-4",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:10.701Z"),
                    endTime: new Date("2026-01-02T09:31:24.651Z"),
                  },
                  {
                    observationId: "research-tool-17",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:24.651Z"),
                    endTime: new Date("2026-01-02T09:31:24.787Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-final-search",
                        toolName: "tilth_tilth_search",
                        output: { matches: 7 },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-18",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:24.653Z"),
                    endTime: new Date("2026-01-02T09:31:24.997Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-final-files",
                        toolName: "tilth_tilth_files",
                        output: { files: 9 },
                      },
                    ],
                  },
                  {
                    observationId: "research-tool-19",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:24.655Z"),
                    endTime: new Date("2026-01-02T09:31:24.661Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-related",
                        toolName: "grepika_search",
                        output: { matches: 3 },
                      },
                    ],
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "research-generation-4",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-17",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-18",
                    traceId: "trace-demo-research-turn",
                  },
                  {
                    id: "research-tool-19",
                    traceId: "trace-demo-research-turn",
                  },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: "I will confirm the final integration points.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-final-search",
                      output: "The hook is already used by seven components.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-final-files",
                      output: "The dashboard and test are colocated.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-related",
                      output: "The toolbar owns all recipe filters.",
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "Research complete. I will add the compact-density checkbox to the existing toolbar, persist it with the session preference hook, and extend the colocated interaction test.",
                      },
                    ],
                    source: "output",
                    observationId: "research-generation-5",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:31:24.657Z"),
                    endTime: new Date("2026-01-02T09:31:31.951Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "I mapped the dashboard, its state ownership, and the closest interaction tests. The implementation can stay local to the existing component.",
                      },
                    ],
                    source: "output",
                    observationId: "research-agent-turn",
                    traceId: "trace-demo-research-turn",
                    startTime: new Date("2026-01-02T09:30:00.000Z"),
                    endTime: new Date("2026-01-02T09:31:27.347Z"),
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "research-generation-5",
                    traceId: "trace-demo-research-turn",
                  },
                ],
              },
            },
          ],
        },
      },
      observations: [
        {
          id: "research-agent-turn",
          traceId: "trace-demo-research-turn",
          name: "opencode.turn",
          startTime: new Date("2026-01-02T09:30:00.000Z"),
          environment: "storybook",
        },
        {
          id: "research-user-message",
          traceId: "trace-demo-research-turn",
          name: "opencode.message.user",
          startTime: new Date("2026-01-02T09:30:00.001Z"),
          environment: "storybook",
        },
        {
          id: "research-generation-1",
          traceId: "trace-demo-research-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:30:00.006Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-1",
          traceId: "trace-demo-research-turn",
          name: "skill",
          startTime: new Date("2026-01-02T09:30:13.230Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-2",
          traceId: "trace-demo-research-turn",
          name: "skill",
          startTime: new Date("2026-01-02T09:30:13.232Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-3",
          traceId: "trace-demo-research-turn",
          name: "skill",
          startTime: new Date("2026-01-02T09:30:13.234Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-4",
          traceId: "trace-demo-research-turn",
          name: "grepika_add_workspace",
          startTime: new Date("2026-01-02T09:30:13.236Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-5",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_search",
          startTime: new Date("2026-01-02T09:30:13.238Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-6",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_files",
          startTime: new Date("2026-01-02T09:30:13.240Z"),
          environment: "storybook",
        },
        {
          id: "research-generation-2",
          traceId: "trace-demo-research-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:30:17.828Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-7",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_read",
          startTime: new Date("2026-01-02T09:31:01.021Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-8",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_read",
          startTime: new Date("2026-01-02T09:31:01.023Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-9",
          traceId: "trace-demo-research-turn",
          name: "bash",
          startTime: new Date("2026-01-02T09:31:01.025Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-10",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_search",
          startTime: new Date("2026-01-02T09:31:01.027Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-11",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_files",
          startTime: new Date("2026-01-02T09:31:01.029Z"),
          environment: "storybook",
        },
        {
          id: "research-generation-3",
          traceId: "trace-demo-research-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:31:01.031Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-12",
          traceId: "trace-demo-research-turn",
          name: "grepika_index",
          startTime: new Date("2026-01-02T09:31:10.691Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-13",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_read",
          startTime: new Date("2026-01-02T09:31:10.693Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-14",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_files",
          startTime: new Date("2026-01-02T09:31:10.695Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-15",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_files",
          startTime: new Date("2026-01-02T09:31:10.697Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-16",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_search",
          startTime: new Date("2026-01-02T09:31:10.699Z"),
          environment: "storybook",
        },
        {
          id: "research-generation-4",
          traceId: "trace-demo-research-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:31:10.701Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-17",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_search",
          startTime: new Date("2026-01-02T09:31:24.651Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-18",
          traceId: "trace-demo-research-turn",
          name: "tilth_tilth_files",
          startTime: new Date("2026-01-02T09:31:24.653Z"),
          environment: "storybook",
        },
        {
          id: "research-tool-19",
          traceId: "trace-demo-research-turn",
          name: "grepika_search",
          startTime: new Date("2026-01-02T09:31:24.655Z"),
          environment: "storybook",
        },
        {
          id: "research-generation-5",
          traceId: "trace-demo-research-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:31:24.657Z"),
          environment: "storybook",
        },
      ],
      filtered: false,
    },
  },
  {
    trace: {
      id: "trace-demo-implementation-turn",
      name: "Implement recipe dashboard density setting",
      timestamp: new Date("2026-01-02T09:32:00.000Z"),
      environment: "storybook",
      userId: "demo-user",
      observationCount: 20,
      latencyMs: 167662,
      scores: [],
    },
    turnNumber: 3,
    state: {
      type: "transcript",
      result: {
        state: "loaded",
        cutoff: false,
        transcript: {
          threads: [
            {
              conversationHistory: [],
              currentTurn: {
                messages: [
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "Build a fictional recipe planner dashboard with a compact density option. Inspect the codebase, update the existing component and tests, then verify the change.",
                      },
                    ],
                    source: "input",
                    observationId: "implementation-generation-1",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:32:00.006Z"),
                    endTime: new Date("2026-01-02T09:32:20.469Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "I will make the smallest component and test change.",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-patch-1",
                        toolName: "apply_patch",
                        input: {
                          patch:
                            "Synthetic dashboard patch with no source code.",
                        },
                        toolType: "function",
                      },
                    ],
                    source: "output",
                    observationId: "implementation-generation-1",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:32:00.006Z"),
                    endTime: new Date("2026-01-02T09:32:20.469Z"),
                  },
                  {
                    observationId: "implementation-tool-1",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:32:20.469Z"),
                    endTime: new Date("2026-01-02T09:32:20.492Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-patch-1",
                        toolName: "apply_patch",
                        output: { success: true, filesChanged: 1 },
                      },
                    ],
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "implementation-generation-1",
                    traceId: "trace-demo-implementation-turn",
                  },
                  {
                    id: "implementation-tool-1",
                    traceId: "trace-demo-implementation-turn",
                  },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "assistant",
                  parts: [
                    { type: "text", text: "The component change is applied." },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-patch-1",
                      output: "Updated one fictional file.",
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "call-diff",
                        toolName: "tilth_tilth_diff",
                        input: {
                          scope: "src/features/recipes/RecipeDashboard.tsx",
                        },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-search-tests",
                        toolName: "tilth_tilth_search",
                        input: { query: "RecipeDashboard tests" },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-read-tests",
                        toolName: "tilth_tilth_read",
                        input: {
                          path: "src/features/recipes/RecipeDashboard.test.tsx",
                        },
                        toolType: "function",
                      },
                    ],
                    source: "output",
                    observationId: "implementation-generation-2",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:32:20.492Z"),
                    endTime: new Date("2026-01-02T09:32:25.733Z"),
                  },
                  {
                    observationId: "implementation-tool-2",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:32:25.733Z"),
                    endTime: new Date("2026-01-02T09:32:25.816Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-diff",
                        toolName: "tilth_tilth_diff",
                        output: { additions: 18, deletions: 2 },
                      },
                    ],
                  },
                  {
                    observationId: "implementation-tool-3",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:32:25.735Z"),
                    endTime: new Date("2026-01-02T09:32:25.932Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-search-tests",
                        toolName: "tilth_tilth_search",
                        output: { matches: 4 },
                      },
                    ],
                  },
                  {
                    observationId: "implementation-tool-4",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:32:25.737Z"),
                    endTime: new Date("2026-01-02T09:32:25.933Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-read-tests",
                        toolName: "tilth_tilth_read",
                        output: { lines: 122 },
                      },
                    ],
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "implementation-generation-2",
                    traceId: "trace-demo-implementation-turn",
                  },
                  {
                    id: "implementation-tool-2",
                    traceId: "trace-demo-implementation-turn",
                  },
                  {
                    id: "implementation-tool-3",
                    traceId: "trace-demo-implementation-turn",
                  },
                  {
                    id: "implementation-tool-4",
                    traceId: "trace-demo-implementation-turn",
                  },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-diff",
                      output: "The component diff is scoped.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-search-tests",
                      output: "Found the colocated tests.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-read-tests",
                      output: "The test uses user-visible queries.",
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "call-patch-tests",
                        toolName: "apply_patch",
                        input: { patch: "Synthetic interaction test patch." },
                        toolType: "function",
                      },
                    ],
                    source: "output",
                    observationId: "implementation-generation-3",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:32:25.739Z"),
                    endTime: new Date("2026-01-02T09:32:36.057Z"),
                  },
                  {
                    observationId: "implementation-tool-5",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:32:36.057Z"),
                    endTime: new Date("2026-01-02T09:32:36.061Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-patch-tests",
                        toolName: "apply_patch",
                        output: { success: true, filesChanged: 1 },
                      },
                    ],
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "implementation-generation-3",
                    traceId: "trace-demo-implementation-turn",
                  },
                  {
                    id: "implementation-tool-5",
                    traceId: "trace-demo-implementation-turn",
                  },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-patch-tests",
                      output: "Updated one fictional test file.",
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "The implementation and test are ready. I will run both targeted checks in parallel.",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-test",
                        toolName: "bash",
                        input: {
                          command:
                            "pnpm --filter demo-app test RecipeDashboard.test.tsx",
                        },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-lint",
                        toolName: "bash",
                        input: {
                          command:
                            "pnpm --filter demo-app lint RecipeDashboard.tsx",
                        },
                        toolType: "function",
                      },
                    ],
                    source: "output",
                    observationId: "implementation-generation-4",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:32:36.061Z"),
                    endTime: new Date("2026-01-02T09:33:37.348Z"),
                  },
                  {
                    observationId: "implementation-tool-6",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:33:37.348Z"),
                    endTime: new Date("2026-01-02T09:33:52.200Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-test",
                        toolName: "bash",
                        output: {
                          testFiles: 1,
                          testsPassed: 6,
                          testsFailed: 0,
                        },
                      },
                    ],
                  },
                  {
                    observationId: "implementation-tool-7",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:33:37.350Z"),
                    endTime: new Date("2026-01-02T09:34:29.162Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-lint",
                        toolName: "bash",
                        output: "Lint completed successfully with no warnings.",
                      },
                    ],
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "implementation-generation-4",
                    traceId: "trace-demo-implementation-turn",
                  },
                  {
                    id: "implementation-tool-6",
                    traceId: "trace-demo-implementation-turn",
                  },
                  {
                    id: "implementation-tool-7",
                    traceId: "trace-demo-implementation-turn",
                  },
                ],
              },
            },
            {
              conversationHistory: [],
              currentTurn: {
                messages: [
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "Targeted tests and lint passed. Inspect the final diff and repository status.",
                      },
                    ],
                    source: "input",
                    observationId: "implementation-generation-5",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:33:37.352Z"),
                    endTime: new Date("2026-01-02T09:34:01.037Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "call-status",
                        toolName: "bash",
                        input: { command: "git status --short" },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-format",
                        toolName: "bash",
                        input: {
                          command:
                            "pnpm prettier --check src/features/recipes/RecipeDashboard.tsx",
                        },
                        toolType: "function",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-diff-stat",
                        toolName: "bash",
                        input: { command: "git diff --stat" },
                        toolType: "function",
                      },
                    ],
                    source: "output",
                    observationId: "implementation-generation-5",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:33:37.352Z"),
                    endTime: new Date("2026-01-02T09:34:01.037Z"),
                  },
                  {
                    observationId: "implementation-tool-8",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:34:01.037Z"),
                    endTime: new Date("2026-01-02T09:34:01.176Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-status",
                        toolName: "bash",
                        output: {
                          modified: [
                            "RecipeDashboard.tsx",
                            "RecipeDashboard.test.tsx",
                          ],
                        },
                      },
                    ],
                  },
                  {
                    observationId: "implementation-tool-9",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:34:01.039Z"),
                    endTime: new Date("2026-01-02T09:34:15.318Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-format",
                        toolName: "bash",
                        output: { checked: 1, formatted: true },
                      },
                    ],
                  },
                  {
                    observationId: "implementation-tool-10",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:34:01.041Z"),
                    endTime: new Date("2026-01-02T09:34:01.640Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-diff-stat",
                        toolName: "bash",
                        output: {
                          filesChanged: 2,
                          insertions: 37,
                          deletions: 4,
                        },
                      },
                    ],
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "implementation-generation-5",
                    traceId: "trace-demo-implementation-turn",
                  },
                  {
                    id: "implementation-tool-8",
                    traceId: "trace-demo-implementation-turn",
                  },
                  {
                    id: "implementation-tool-9",
                    traceId: "trace-demo-implementation-turn",
                  },
                  {
                    id: "implementation-tool-10",
                    traceId: "trace-demo-implementation-turn",
                  },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-status",
                      output: "Only the two intended files changed.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-format",
                      output: "Formatting passed.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-diff-stat",
                      output: "The diff is compact.",
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "I will run the final focused Storybook check.",
                      },
                      {
                        type: "tool-call",
                        toolCallId: "call-storybook",
                        toolName: "bash",
                        input: {
                          command:
                            "pnpm --filter demo-app test-storybook RecipeDashboard.stories.tsx",
                        },
                        toolType: "function",
                      },
                    ],
                    source: "output",
                    observationId: "implementation-generation-6",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:34:01.043Z"),
                    endTime: new Date("2026-01-02T09:34:36.907Z"),
                  },
                  {
                    observationId: "implementation-tool-11",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:34:36.907Z"),
                    endTime: new Date("2026-01-02T09:35:05.901Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "call-storybook",
                        toolName: "bash",
                        output: {
                          storyFiles: 1,
                          testsPassed: 8,
                          testsFailed: 0,
                        },
                      },
                    ],
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "implementation-generation-6",
                    traceId: "trace-demo-implementation-turn",
                  },
                  {
                    id: "implementation-tool-11",
                    traceId: "trace-demo-implementation-turn",
                  },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: "I will run the final focused Storybook check.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: "call-storybook",
                      output: "Eight Storybook tests passed.",
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "Implemented a compact density option for the fictional recipe dashboard, persisted it for the browser tab, and added interaction coverage. Targeted tests, Storybook, formatting, and lint all pass.",
                      },
                    ],
                    source: "output",
                    observationId: "implementation-generation-7",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:34:36.909Z"),
                    endTime: new Date("2026-01-02T09:34:47.684Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "Implemented the compact recipe cards, added coverage, and verified tests and lint.",
                      },
                    ],
                    source: "output",
                    observationId: "implementation-agent-turn",
                    traceId: "trace-demo-implementation-turn",
                    startTime: new Date("2026-01-02T09:32:00.000Z"),
                    endTime: new Date("2026-01-02T09:34:47.662Z"),
                  },
                ],
                nestingLevel: 1,
                observations: [
                  {
                    id: "implementation-generation-7",
                    traceId: "trace-demo-implementation-turn",
                  },
                ],
              },
            },
          ],
        },
      },
      observations: [
        {
          id: "implementation-agent-turn",
          traceId: "trace-demo-implementation-turn",
          name: "opencode.turn",
          startTime: new Date("2026-01-02T09:32:00.000Z"),
          environment: "storybook",
        },
        {
          id: "implementation-user-message",
          traceId: "trace-demo-implementation-turn",
          name: "opencode.message.user",
          startTime: new Date("2026-01-02T09:32:00.001Z"),
          environment: "storybook",
        },
        {
          id: "implementation-generation-1",
          traceId: "trace-demo-implementation-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:32:00.006Z"),
          environment: "storybook",
        },
        {
          id: "implementation-tool-1",
          traceId: "trace-demo-implementation-turn",
          name: "apply_patch",
          startTime: new Date("2026-01-02T09:32:20.469Z"),
          environment: "storybook",
        },
        {
          id: "implementation-generation-2",
          traceId: "trace-demo-implementation-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:32:20.492Z"),
          environment: "storybook",
        },
        {
          id: "implementation-tool-2",
          traceId: "trace-demo-implementation-turn",
          name: "tilth_tilth_diff",
          startTime: new Date("2026-01-02T09:32:25.733Z"),
          environment: "storybook",
        },
        {
          id: "implementation-tool-3",
          traceId: "trace-demo-implementation-turn",
          name: "tilth_tilth_search",
          startTime: new Date("2026-01-02T09:32:25.735Z"),
          environment: "storybook",
        },
        {
          id: "implementation-tool-4",
          traceId: "trace-demo-implementation-turn",
          name: "tilth_tilth_read",
          startTime: new Date("2026-01-02T09:32:25.737Z"),
          environment: "storybook",
        },
        {
          id: "implementation-generation-3",
          traceId: "trace-demo-implementation-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:32:25.739Z"),
          environment: "storybook",
        },
        {
          id: "implementation-tool-5",
          traceId: "trace-demo-implementation-turn",
          name: "apply_patch",
          startTime: new Date("2026-01-02T09:32:36.057Z"),
          environment: "storybook",
        },
        {
          id: "implementation-generation-4",
          traceId: "trace-demo-implementation-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:32:36.061Z"),
          environment: "storybook",
        },
        {
          id: "implementation-tool-6",
          traceId: "trace-demo-implementation-turn",
          name: "bash",
          startTime: new Date("2026-01-02T09:33:37.348Z"),
          environment: "storybook",
        },
        {
          id: "implementation-tool-7",
          traceId: "trace-demo-implementation-turn",
          name: "bash",
          startTime: new Date("2026-01-02T09:33:37.350Z"),
          environment: "storybook",
        },
        {
          id: "implementation-generation-5",
          traceId: "trace-demo-implementation-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:33:37.352Z"),
          environment: "storybook",
        },
        {
          id: "implementation-tool-8",
          traceId: "trace-demo-implementation-turn",
          name: "bash",
          startTime: new Date("2026-01-02T09:34:01.037Z"),
          environment: "storybook",
        },
        {
          id: "implementation-tool-9",
          traceId: "trace-demo-implementation-turn",
          name: "bash",
          startTime: new Date("2026-01-02T09:34:01.039Z"),
          environment: "storybook",
        },
        {
          id: "implementation-tool-10",
          traceId: "trace-demo-implementation-turn",
          name: "bash",
          startTime: new Date("2026-01-02T09:34:01.041Z"),
          environment: "storybook",
        },
        {
          id: "implementation-generation-6",
          traceId: "trace-demo-implementation-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:34:01.043Z"),
          environment: "storybook",
        },
        {
          id: "implementation-tool-11",
          traceId: "trace-demo-implementation-turn",
          name: "bash",
          startTime: new Date("2026-01-02T09:34:36.907Z"),
          environment: "storybook",
        },
        {
          id: "implementation-generation-7",
          traceId: "trace-demo-implementation-turn",
          name: "opencode.generation",
          startTime: new Date("2026-01-02T09:34:36.909Z"),
          environment: "storybook",
        },
      ],
      filtered: false,
    },
  },
];
export const langfuseAssistantWorkflow: WorkflowTrace[] = [
  {
    trace: {
      id: "trace-demo-error-analysis",
      name: "Analyze fictional travel-assistant failures",
      timestamp: new Date("2026-01-02T09:35:00.000Z"),
      environment: "storybook",
      userId: "user-demo-analyst",
      observationCount: 43,
      latencyMs: 205058,
      scores: [],
    },
    turnNumber: 4,
    state: {
      type: "transcript",
      result: {
        state: "loaded",
        cutoff: false,
        transcript: {
          threads: [
            {
              conversationHistory: [],
              currentTurn: {
                messages: [
                  {
                    role: "system",
                    parts: [
                      {
                        type: "text",
                        text: "You are a demo observability analyst. Use only fictional project data.",
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:00.000Z"),
                    endTime: new Date("2026-01-02T09:35:06.370Z"),
                  },
                  {
                    role: "system",
                    parts: [
                      {
                        type: "text",
                        text: "Inspect representative failures before proposing a taxonomy or remediation.",
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:00.000Z"),
                    endTime: new Date("2026-01-02T09:35:06.370Z"),
                  },
                  {
                    role: "system",
                    parts: [
                      {
                        type: "text",
                        text: "Never expose identifiers or payloads from real users.",
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:00.000Z"),
                    endTime: new Date("2026-01-02T09:35:06.370Z"),
                  },
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "Analyze failed traces for a fictional travel assistant. Sample representative failures, group recurring causes into a taxonomy, recommend what to fix first, and suggest how to track the top issue.",
                        providerMetadata: {
                          demo: { cacheControl: "temporary" },
                        },
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:00.000Z"),
                    endTime: new Date("2026-01-02T09:35:06.370Z"),
                  },
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "<screen_context>\nCurrent page: /project/project-demo-travel-assistant/traces\nActive filter: level is ERROR\n  Saved view: booking-assistant, route-planner, fare-checker\n  </screen_context>\n  <current_time>2026-01-02T09:35:00.000Z</current_time>",
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:00.000Z"),
                    endTime: new Date("2026-01-02T09:35:06.370Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-1-1",
                        toolName: "skill",
                        input: { name: "error-analysis" },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:00.000Z"),
                    endTime: new Date("2026-01-02T09:35:06.370Z"),
                  },
                  {
                    observationId: "error-analysis-tool-1-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:06.370Z"),
                    endTime: new Date("2026-01-02T09:35:06.371Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-1-1",
                        toolName: "skill",
                        output:
                          "Use representative samples, separate symptoms from root causes, and quantify each recurring category.",
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-1-1","toolName":"skill","output":"Use representative samples, separate symptoms from root causes, and quantify each recurring category."}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-2",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:07.000Z"),
                    endTime: new Date("2026-01-02T09:35:12.345Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-2-1",
                        toolName: "langfuseDocs_getLangfuseDocsPage",
                        input: {
                          pathOrUrl: "/docs/observability/errors",
                          silent: false,
                        },
                      },
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-2-2",
                        toolName: "langfuse_listObservations",
                        input: {
                          fields: ["id", "name", "level", "statusMessage"],
                          fromStartTime: "2026-01-01T00:00:00Z",
                          toStartTime: "2026-01-08T00:00:00Z",
                          level: "ERROR",
                          limit: 25,
                          silent: false,
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-2",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:07.000Z"),
                    endTime: new Date("2026-01-02T09:35:12.345Z"),
                  },
                  {
                    observationId: "error-analysis-tool-2-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:12.345Z"),
                    endTime: new Date("2026-01-02T09:35:12.635Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-2-1",
                        toolName: "langfuseDocs_getLangfuseDocsPage",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-2-1",
                          toolName: "langfuseDocs_getLangfuseDocsPage",
                          output: {
                            type: "tool-result",
                            toolName: "langfuseDocs_getLangfuseDocsPage",
                            content:
                              "Synthetic guidance for investigating failed traces.",
                          },
                        },
                      },
                    ],
                  },
                  {
                    observationId: "error-analysis-tool-2-2",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:12.345Z"),
                    endTime: new Date("2026-01-02T09:35:12.578Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-2-2",
                        toolName: "langfuse_listObservations",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-2-2",
                          toolName: "langfuse_listObservations",
                          output: {
                            type: "tool-result",
                            toolName: "langfuse_listObservations",
                            output: { count: 25, cursor: "cursor-demo-page-2" },
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-2-1","toolName":"langfuseDocs_getLangfuseDocsPage","output":{"type":"tool-result","toolName":"langfuseDocs_getLangfuseDocsPage","content":"Synthetic guidance for investigating failed traces."}},{"toolCallId":"error-analysis-call-2-2","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":25,"cursor":"cursor-demo-page-2"}}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-3",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:13.000Z"),
                    endTime: new Date("2026-01-02T09:35:15.759Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-3-1",
                        toolName: "bash",
                        input: {
                          command: "jq 'group_by(.name)' synthetic-errors.json",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-3",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:13.000Z"),
                    endTime: new Date("2026-01-02T09:35:15.759Z"),
                  },
                  {
                    observationId: "error-analysis-tool-3-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:15.759Z"),
                    endTime: new Date("2026-01-02T09:35:17.300Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-3-1",
                        toolName: "bash",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-3-1",
                          toolName: "bash",
                          output: {
                            startedAt: "2026-01-08T09:00:13Z",
                            completedAt: "2026-01-08T09:00:14Z",
                            exitCode: 0,
                            stdout:
                              "booking-assistant: 11\nroute-planner: 8\nfare-checker: 6",
                            stderr: "",
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-3-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:13Z","completedAt":"2026-01-08T09:00:14Z","exitCode":0,"stdout":"booking-assistant: 11\\nroute-planner: 8\\nfare-checker: 6","stderr":""}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-4",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:17.000Z"),
                    endTime: new Date("2026-01-02T09:35:22.457Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-4-1",
                        toolName: "bash",
                        input: {
                          command:
                            "jq 'group_by(.statusMessage)' synthetic-errors.json",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-4",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:17.000Z"),
                    endTime: new Date("2026-01-02T09:35:22.457Z"),
                  },
                  {
                    observationId: "error-analysis-tool-4-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:22.457Z"),
                    endTime: new Date("2026-01-02T09:35:22.652Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-4-1",
                        toolName: "bash",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-4-1",
                          toolName: "bash",
                          output: {
                            startedAt: "2026-01-08T09:00:17Z",
                            completedAt: "2026-01-08T09:00:17Z",
                            exitCode: 0,
                            stdout:
                              "timeout: 9\ninvalid itinerary: 7\nmissing fare: 5\nother: 4",
                            stderr: "",
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-4-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:17Z","completedAt":"2026-01-08T09:00:17Z","exitCode":0,"stdout":"timeout: 9\\ninvalid itinerary: 7\\nmissing fare: 5\\nother: 4","stderr":""}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-5",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:23.000Z"),
                    endTime: new Date("2026-01-02T09:35:28.896Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-5-1",
                        toolName: "langfuse_listObservations",
                        input: {
                          fields: [
                            "id",
                            "traceId",
                            "input",
                            "output",
                            "statusMessage",
                          ],
                          filter: [
                            {
                              column: "statusMessage",
                              operator: "contains",
                              value: "timeout",
                            },
                          ],
                          fromStartTime: "2026-01-01T00:00:00Z",
                          toStartTime: "2026-01-08T00:00:00Z",
                          level: "ERROR",
                          limit: 10,
                          silent: false,
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-5",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:23.000Z"),
                    endTime: new Date("2026-01-02T09:35:28.896Z"),
                  },
                  {
                    observationId: "error-analysis-tool-5-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:28.896Z"),
                    endTime: new Date("2026-01-02T09:35:29.115Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-5-1",
                        toolName: "langfuse_listObservations",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-5-1",
                          toolName: "langfuse_listObservations",
                          output: {
                            type: "tool-result",
                            toolName: "langfuse_listObservations",
                            output: {
                              count: 10,
                              sample: "synthetic timeout observations",
                            },
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-5-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":10,"sample":"synthetic timeout observations"}}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-6",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:29.000Z"),
                    endTime: new Date("2026-01-02T09:35:31.974Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-6-1",
                        toolName: "bash",
                        input: {
                          command:
                            "jq '.[] | [.name, .statusMessage]' synthetic-timeouts.json",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-6",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:29.000Z"),
                    endTime: new Date("2026-01-02T09:35:31.974Z"),
                  },
                  {
                    observationId: "error-analysis-tool-6-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:31.974Z"),
                    endTime: new Date("2026-01-02T09:35:32.181Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-6-1",
                        toolName: "bash",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-6-1",
                          toolName: "bash",
                          output: {
                            startedAt: "2026-01-08T09:00:29Z",
                            completedAt: "2026-01-08T09:00:29Z",
                            exitCode: 0,
                            stdout:
                              "upstream timeout: 6\nretry exhausted: 3\nclient cancelled: 1",
                            stderr: "",
                          },
                        },
                      },
                    ],
                  },
                ],
                nestingLevel: 0,
                observations: [
                  {
                    id: "error-analysis-generation-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-1-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-2",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-2-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-2-2",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-3",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-3-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-4",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-4-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-5",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-5-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-6",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-6-1",
                    traceId: "trace-demo-error-analysis",
                  },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "system",
                  parts: [
                    {
                      type: "text",
                      text: "You are a demo observability analyst. Use only fictional project data.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "system",
                  parts: [
                    {
                      type: "text",
                      text: "Inspect representative failures before proposing a taxonomy or remediation.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "system",
                  parts: [
                    {
                      type: "text",
                      text: "Never expose identifiers or payloads from real users.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "user",
                  parts: [
                    {
                      type: "text",
                      text: "Analyze failed traces for a fictional travel assistant. Sample representative failures, group recurring causes into a taxonomy, recommend what to fix first, and suggest how to track the top issue.",
                      providerMetadata: { demo: { cacheControl: "temporary" } },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-1-1",
                      toolName: "skill",
                      input: { name: "error-analysis" },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-1-1","toolName":"skill","output":"Use representative samples, separate symptoms from root causes, and quantify each recurring category."}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-2-1",
                      toolName: "langfuseDocs_getLangfuseDocsPage",
                      input: {
                        pathOrUrl: "/docs/observability/errors",
                        silent: false,
                      },
                    },
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-2-2",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: ["id", "name", "level", "statusMessage"],
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        level: "ERROR",
                        limit: 25,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-2-1","toolName":"langfuseDocs_getLangfuseDocsPage","output":{"type":"tool-result","toolName":"langfuseDocs_getLangfuseDocsPage","content":"Synthetic guidance for investigating failed traces."}},{"toolCallId":"error-analysis-call-2-2","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":25,"cursor":"cursor-demo-page-2"}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-3-1",
                      toolName: "bash",
                      input: {
                        command: "jq 'group_by(.name)' synthetic-errors.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-3-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:13Z","completedAt":"2026-01-08T09:00:14Z","exitCode":0,"stdout":"booking-assistant: 11\\nroute-planner: 8\\nfare-checker: 6","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-4-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq 'group_by(.statusMessage)' synthetic-errors.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-4-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:17Z","completedAt":"2026-01-08T09:00:17Z","exitCode":0,"stdout":"timeout: 9\\ninvalid itinerary: 7\\nmissing fare: 5\\nother: 4","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-5-1",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: [
                          "id",
                          "traceId",
                          "input",
                          "output",
                          "statusMessage",
                        ],
                        filter: [
                          {
                            column: "statusMessage",
                            operator: "contains",
                            value: "timeout",
                          },
                        ],
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        level: "ERROR",
                        limit: 10,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-5-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":10,"sample":"synthetic timeout observations"}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-6-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq '.[] | [.name, .statusMessage]' synthetic-timeouts.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-6-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:29Z","completedAt":"2026-01-08T09:00:29Z","exitCode":0,"stdout":"upstream timeout: 6\\nretry exhausted: 3\\nclient cancelled: 1","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "<screen_context>\nCurrent page: /project/project-demo-travel-assistant/traces\nActive filter: level is ERROR\n  Saved view: booking-assistant, route-planner, fare-checker\n  </screen_context>\n  <current_time>2026-01-02T09:35:32.000Z</current_time>",
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-7",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:32.000Z"),
                    endTime: new Date("2026-01-02T09:35:40.043Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-7-1",
                        toolName: "langfuse_getObservationFilterValues",
                        input: {
                          column: "model",
                          fromStartTime: "2026-01-01T00:00:00Z",
                          toStartTime: "2026-01-08T00:00:00Z",
                          limit: 20,
                          silent: false,
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-7",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:32.000Z"),
                    endTime: new Date("2026-01-02T09:35:40.043Z"),
                  },
                  {
                    observationId: "error-analysis-tool-7-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:40.043Z"),
                    endTime: new Date("2026-01-02T09:35:40.327Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-7-1",
                        toolName: "langfuse_getObservationFilterValues",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-7-1",
                          toolName: "langfuse_getObservationFilterValues",
                          output: {
                            type: "tool-result",
                            toolName: "langfuse_getObservationFilterValues",
                            output: [
                              "demo-chat-large",
                              "demo-chat-fast",
                              "demo-embed-small",
                            ],
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-7-1","toolName":"langfuse_getObservationFilterValues","output":{"type":"tool-result","toolName":"langfuse_getObservationFilterValues","output":["demo-chat-large","demo-chat-fast","demo-embed-small"]}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-8",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:41.000Z"),
                    endTime: new Date("2026-01-02T09:35:44.716Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-8-1",
                        toolName: "bash",
                        input: {
                          command:
                            "jq 'group_by([.model,.name])' synthetic-errors.json",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-8",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:41.000Z"),
                    endTime: new Date("2026-01-02T09:35:44.716Z"),
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-8-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:41Z","completedAt":"2026-01-08T09:00:41Z","exitCode":0,"stdout":"demo-chat-fast / route-planner: 8\\ndemo-chat-large / booking-assistant: 11","stderr":""}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-9",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:44.000Z"),
                    endTime: new Date("2026-01-02T09:35:59.801Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-9-1",
                        toolName: "langfuse_listObservations",
                        input: {
                          fields: [
                            "id",
                            "traceId",
                            "input",
                            "output",
                            "metadata",
                          ],
                          filter: [
                            {
                              column: "statusMessage",
                              operator: "contains",
                              value: "invalid itinerary",
                            },
                          ],
                          fromStartTime: "2026-01-01T00:00:00Z",
                          toStartTime: "2026-01-08T00:00:00Z",
                          level: "ERROR",
                          limit: 10,
                          silent: false,
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-9",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:44.000Z"),
                    endTime: new Date("2026-01-02T09:35:59.801Z"),
                  },
                  {
                    observationId: "error-analysis-tool-8-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:44.716Z"),
                    endTime: new Date("2026-01-02T09:35:44.916Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-8-1",
                        toolName: "bash",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-8-1",
                          toolName: "bash",
                          output: {
                            startedAt: "2026-01-08T09:00:41Z",
                            completedAt: "2026-01-08T09:00:41Z",
                            exitCode: 0,
                            stdout:
                              "demo-chat-fast / route-planner: 8\ndemo-chat-large / booking-assistant: 11",
                            stderr: "",
                          },
                        },
                      },
                    ],
                  },
                  {
                    observationId: "error-analysis-tool-9-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:35:59.801Z"),
                    endTime: new Date("2026-01-02T09:36:00.003Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-9-1",
                        toolName: "langfuse_listObservations",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-9-1",
                          toolName: "langfuse_listObservations",
                          output: {
                            type: "tool-result",
                            toolName: "langfuse_listObservations",
                            output: {
                              count: 7,
                              sample: "synthetic itinerary validation failures",
                            },
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-9-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":7,"sample":"synthetic itinerary validation failures"}}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-10",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:01.000Z"),
                    endTime: new Date("2026-01-02T09:36:06.819Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-10-1",
                        toolName: "bash",
                        input: {
                          command:
                            "jq '.[] | .metadata.validationReason' synthetic-itineraries.json",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-10",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:01.000Z"),
                    endTime: new Date("2026-01-02T09:36:06.819Z"),
                  },
                  {
                    observationId: "error-analysis-tool-10-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:06.819Z"),
                    endTime: new Date("2026-01-02T09:36:07.002Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-10-1",
                        toolName: "bash",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-10-1",
                          toolName: "bash",
                          output: {
                            startedAt: "2026-01-08T09:01:01Z",
                            completedAt: "2026-01-08T09:01:01Z",
                            exitCode: 0,
                            stdout:
                              "impossible connection: 4\nmissing airport: 2\ndate ordering: 1",
                            stderr: "",
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-10-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:01Z","completedAt":"2026-01-08T09:01:01Z","exitCode":0,"stdout":"impossible connection: 4\\nmissing airport: 2\\ndate ordering: 1","stderr":""}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-11",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:07.000Z"),
                    endTime: new Date("2026-01-02T09:36:21.948Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-11-1",
                        toolName: "langfuse_listObservations",
                        input: {
                          fields: [
                            "id",
                            "traceId",
                            "input",
                            "output",
                            "metadata",
                          ],
                          filter: [
                            {
                              column: "statusMessage",
                              operator: "contains",
                              value: "missing fare",
                            },
                          ],
                          fromStartTime: "2026-01-01T00:00:00Z",
                          toStartTime: "2026-01-08T00:00:00Z",
                          limit: 10,
                          silent: false,
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-11",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:07.000Z"),
                    endTime: new Date("2026-01-02T09:36:21.948Z"),
                  },
                  {
                    observationId: "error-analysis-tool-11-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:21.948Z"),
                    endTime: new Date("2026-01-02T09:36:22.623Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-11-1",
                        toolName: "langfuse_listObservations",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-11-1",
                          toolName: "langfuse_listObservations",
                          output: {
                            type: "tool-result",
                            toolName: "langfuse_listObservations",
                            output: {
                              count: 5,
                              sample: "synthetic pricing lookup failures",
                            },
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-11-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":5,"sample":"synthetic pricing lookup failures"}}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-12",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:22.000Z"),
                    endTime: new Date("2026-01-02T09:36:29.054Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-12-1",
                        toolName: "bash",
                        input: {
                          command:
                            "jq 'group_by([.metadata.provider,.metadata.cache])' synthetic-fares.json",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-12",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:22.000Z"),
                    endTime: new Date("2026-01-02T09:36:29.054Z"),
                  },
                  {
                    observationId: "error-analysis-tool-12-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:29.054Z"),
                    endTime: new Date("2026-01-02T09:36:29.253Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-12-1",
                        toolName: "bash",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-12-1",
                          toolName: "bash",
                          output: {
                            startedAt: "2026-01-08T09:01:22Z",
                            completedAt: "2026-01-08T09:01:22Z",
                            exitCode: 0,
                            stdout:
                              "provider unavailable / cache miss: 4\nmalformed response: 1",
                            stderr: "",
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-12-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:22Z","completedAt":"2026-01-08T09:01:22Z","exitCode":0,"stdout":"provider unavailable / cache miss: 4\\nmalformed response: 1","stderr":""}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-13",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:30.000Z"),
                    endTime: new Date("2026-01-02T09:36:39.036Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-13-1",
                        toolName: "bash",
                        input: {
                          command:
                            "node scripts/summarize-synthetic-errors.mjs",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-13",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:30.000Z"),
                    endTime: new Date("2026-01-02T09:36:39.036Z"),
                  },
                  {
                    observationId: "error-analysis-tool-13-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:39.036Z"),
                    endTime: new Date("2026-01-02T09:36:39.235Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-13-1",
                        toolName: "bash",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-13-1",
                          toolName: "bash",
                          output: {
                            startedAt: "2026-01-08T09:01:30Z",
                            completedAt: "2026-01-08T09:01:30Z",
                            exitCode: 0,
                            stdout:
                              "upstream reliability 36%\nvalidation 28%\ndata availability 20%\nother 16%",
                            stderr: "",
                          },
                        },
                      },
                    ],
                  },
                ],
                nestingLevel: 0,
                observations: [
                  {
                    id: "error-analysis-generation-7",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-7-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-8",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-9",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-8-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-9-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-10",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-10-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-11",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-11-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-12",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-12-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-13",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-13-1",
                    traceId: "trace-demo-error-analysis",
                  },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "system",
                  parts: [
                    {
                      type: "text",
                      text: "You are a demo observability analyst. Use only fictional project data.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "system",
                  parts: [
                    {
                      type: "text",
                      text: "Inspect representative failures before proposing a taxonomy or remediation.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "system",
                  parts: [
                    {
                      type: "text",
                      text: "Never expose identifiers or payloads from real users.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "user",
                  parts: [
                    {
                      type: "text",
                      text: "Analyze failed traces for a fictional travel assistant. Sample representative failures, group recurring causes into a taxonomy, recommend what to fix first, and suggest how to track the top issue.",
                      providerMetadata: { demo: { cacheControl: "temporary" } },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-1-1",
                      toolName: "skill",
                      input: { name: "error-analysis" },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-1-1","toolName":"skill","output":"Use representative samples, separate symptoms from root causes, and quantify each recurring category."}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-2-1",
                      toolName: "langfuseDocs_getLangfuseDocsPage",
                      input: {
                        pathOrUrl: "/docs/observability/errors",
                        silent: false,
                      },
                    },
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-2-2",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: ["id", "name", "level", "statusMessage"],
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        level: "ERROR",
                        limit: 25,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-2-1","toolName":"langfuseDocs_getLangfuseDocsPage","output":{"type":"tool-result","toolName":"langfuseDocs_getLangfuseDocsPage","content":"Synthetic guidance for investigating failed traces."}},{"toolCallId":"error-analysis-call-2-2","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":25,"cursor":"cursor-demo-page-2"}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-3-1",
                      toolName: "bash",
                      input: {
                        command: "jq 'group_by(.name)' synthetic-errors.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-3-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:13Z","completedAt":"2026-01-08T09:00:14Z","exitCode":0,"stdout":"booking-assistant: 11\\nroute-planner: 8\\nfare-checker: 6","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-4-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq 'group_by(.statusMessage)' synthetic-errors.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-4-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:17Z","completedAt":"2026-01-08T09:00:17Z","exitCode":0,"stdout":"timeout: 9\\ninvalid itinerary: 7\\nmissing fare: 5\\nother: 4","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-5-1",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: [
                          "id",
                          "traceId",
                          "input",
                          "output",
                          "statusMessage",
                        ],
                        filter: [
                          {
                            column: "statusMessage",
                            operator: "contains",
                            value: "timeout",
                          },
                        ],
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        level: "ERROR",
                        limit: 10,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-5-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":10,"sample":"synthetic timeout observations"}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-6-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq '.[] | [.name, .statusMessage]' synthetic-timeouts.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-6-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:29Z","completedAt":"2026-01-08T09:00:29Z","exitCode":0,"stdout":"upstream timeout: 6\\nretry exhausted: 3\\nclient cancelled: 1","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-7-1",
                      toolName: "langfuse_getObservationFilterValues",
                      input: {
                        column: "model",
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        limit: 20,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-7-1","toolName":"langfuse_getObservationFilterValues","output":{"type":"tool-result","toolName":"langfuse_getObservationFilterValues","output":["demo-chat-large","demo-chat-fast","demo-embed-small"]}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-8-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq 'group_by([.model,.name])' synthetic-errors.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-8-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:41Z","completedAt":"2026-01-08T09:00:41Z","exitCode":0,"stdout":"demo-chat-fast / route-planner: 8\\ndemo-chat-large / booking-assistant: 11","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-9-1",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: [
                          "id",
                          "traceId",
                          "input",
                          "output",
                          "metadata",
                        ],
                        filter: [
                          {
                            column: "statusMessage",
                            operator: "contains",
                            value: "invalid itinerary",
                          },
                        ],
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        level: "ERROR",
                        limit: 10,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-9-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":7,"sample":"synthetic itinerary validation failures"}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-10-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq '.[] | .metadata.validationReason' synthetic-itineraries.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-10-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:01Z","completedAt":"2026-01-08T09:01:01Z","exitCode":0,"stdout":"impossible connection: 4\\nmissing airport: 2\\ndate ordering: 1","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-11-1",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: [
                          "id",
                          "traceId",
                          "input",
                          "output",
                          "metadata",
                        ],
                        filter: [
                          {
                            column: "statusMessage",
                            operator: "contains",
                            value: "missing fare",
                          },
                        ],
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        limit: 10,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-11-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":5,"sample":"synthetic pricing lookup failures"}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-12-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq 'group_by([.metadata.provider,.metadata.cache])' synthetic-fares.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-12-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:22Z","completedAt":"2026-01-08T09:01:22Z","exitCode":0,"stdout":"provider unavailable / cache miss: 4\\nmalformed response: 1","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-13-1",
                      toolName: "bash",
                      input: {
                        command: "node scripts/summarize-synthetic-errors.mjs",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-13-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:30Z","completedAt":"2026-01-08T09:01:30Z","exitCode":0,"stdout":"upstream reliability 36%\\nvalidation 28%\\ndata availability 20%\\nother 16%","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "<screen_context>\nCurrent page: /project/project-demo-travel-assistant/traces\nActive filter: level is ERROR\n  Saved view: booking-assistant, route-planner, fare-checker\n  </screen_context>\n  <current_time>2026-01-02T09:36:39.000Z</current_time>",
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-14",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:39.000Z"),
                    endTime: new Date("2026-01-02T09:36:51.964Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-14-1",
                        toolName: "langfuse_listObservations",
                        input: {
                          cursor: "cursor-demo-page-2",
                          environment: "production-demo",
                          fields: ["id", "name", "level", "statusMessage"],
                          fromStartTime: "2026-01-01T00:00:00Z",
                          toStartTime: "2026-01-08T00:00:00Z",
                          level: "ERROR",
                          limit: 25,
                          silent: false,
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-14",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:39.000Z"),
                    endTime: new Date("2026-01-02T09:36:51.964Z"),
                  },
                  {
                    observationId: "error-analysis-tool-14-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:51.964Z"),
                    endTime: new Date("2026-01-02T09:36:52.156Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-14-1",
                        toolName: "langfuse_listObservations",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-14-1",
                          toolName: "langfuse_listObservations",
                          output: {
                            type: "tool-result",
                            toolName: "langfuse_listObservations",
                            output: { count: 25, cursor: null },
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-14-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":25,"cursor":null}}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-15",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:52.000Z"),
                    endTime: new Date("2026-01-02T09:36:57.249Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-15-1",
                        toolName: "bash",
                        input: {
                          command: "node scripts/merge-synthetic-samples.mjs",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-15",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:52.000Z"),
                    endTime: new Date("2026-01-02T09:36:57.249Z"),
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-15-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:52Z","completedAt":"2026-01-08T09:01:52Z","exitCode":0,"stdout":"50 observations classified; 46 matched the draft taxonomy","stderr":""}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-16",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:57.000Z"),
                    endTime: new Date("2026-01-02T09:37:06.648Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-16-1",
                        toolName: "bash",
                        input: {
                          command:
                            "node scripts/select-synthetic-representatives.mjs",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-16",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:57.000Z"),
                    endTime: new Date("2026-01-02T09:37:06.648Z"),
                  },
                  {
                    observationId: "error-analysis-tool-15-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:36:57.249Z"),
                    endTime: new Date("2026-01-02T09:36:57.446Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-15-1",
                        toolName: "bash",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-15-1",
                          toolName: "bash",
                          output: {
                            startedAt: "2026-01-08T09:01:52Z",
                            completedAt: "2026-01-08T09:01:52Z",
                            exitCode: 0,
                            stdout:
                              "50 observations classified; 46 matched the draft taxonomy",
                            stderr: "",
                          },
                        },
                      },
                    ],
                  },
                  {
                    observationId: "error-analysis-tool-16-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:06.648Z"),
                    endTime: new Date("2026-01-02T09:37:07.078Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-16-1",
                        toolName: "bash",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-16-1",
                          toolName: "bash",
                          output: {
                            startedAt: "2026-01-08T09:01:57Z",
                            completedAt: "2026-01-08T09:01:57Z",
                            exitCode: 0,
                            stdout:
                              "trace-demo-timeout\ntrace-demo-validation\ntrace-demo-fare\ntrace-demo-other",
                            stderr: "",
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-16-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:57Z","completedAt":"2026-01-08T09:01:57Z","exitCode":0,"stdout":"trace-demo-timeout\\ntrace-demo-validation\\ntrace-demo-fare\\ntrace-demo-other","stderr":""}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-17",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:08.000Z"),
                    endTime: new Date("2026-01-02T09:37:26.765Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-17-1",
                        toolName: "langfuse_listObservations",
                        input: {
                          fields: ["*"],
                          limit: 100,
                          silent: false,
                          traceId: "trace-demo-timeout",
                        },
                      },
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-17-2",
                        toolName: "langfuse_listObservations",
                        input: {
                          fields: ["*"],
                          limit: 100,
                          silent: false,
                          traceId: "trace-demo-validation",
                        },
                      },
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-17-3",
                        toolName: "langfuse_listObservations",
                        input: {
                          fields: ["*"],
                          limit: 100,
                          silent: false,
                          traceId: "trace-demo-fare",
                        },
                      },
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-17-4",
                        toolName: "langfuse_listObservations",
                        input: {
                          fields: ["*"],
                          limit: 100,
                          silent: false,
                          traceId: "trace-demo-other",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-17",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:08.000Z"),
                    endTime: new Date("2026-01-02T09:37:26.765Z"),
                  },
                  {
                    observationId: "error-analysis-tool-17-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:26.765Z"),
                    endTime: new Date("2026-01-02T09:37:27.972Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-17-1",
                        toolName: "langfuse_listObservations",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-17-1",
                          toolName: "langfuse_listObservations",
                          output: {
                            type: "tool-result",
                            toolName: "langfuse_listObservations",
                            output: {
                              observations: 14,
                              category: "upstream timeout",
                            },
                          },
                        },
                      },
                    ],
                  },
                  {
                    observationId: "error-analysis-tool-17-2",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:26.765Z"),
                    endTime: new Date("2026-01-02T09:37:26.903Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-17-2",
                        toolName: "langfuse_listObservations",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-17-2",
                          toolName: "langfuse_listObservations",
                          output: {
                            type: "tool-result",
                            toolName: "langfuse_listObservations",
                            output: {
                              observations: 9,
                              category: "itinerary validation",
                            },
                          },
                        },
                      },
                    ],
                  },
                  {
                    observationId: "error-analysis-tool-17-3",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:26.765Z"),
                    endTime: new Date("2026-01-02T09:37:26.904Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-17-3",
                        toolName: "langfuse_listObservations",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-17-3",
                          toolName: "langfuse_listObservations",
                          output: {
                            type: "tool-result",
                            toolName: "langfuse_listObservations",
                            output: {
                              observations: 11,
                              category: "fare unavailable",
                            },
                          },
                        },
                      },
                    ],
                  },
                  {
                    observationId: "error-analysis-tool-17-4",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:26.765Z"),
                    endTime: new Date("2026-01-02T09:37:26.885Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-17-4",
                        toolName: "langfuse_listObservations",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-17-4",
                          toolName: "langfuse_listObservations",
                          output: {
                            type: "tool-result",
                            toolName: "langfuse_listObservations",
                            output: {
                              observations: 7,
                              category: "uncategorized",
                            },
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-17-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"observations":14,"category":"upstream timeout"}}},{"toolCallId":"error-analysis-call-17-2","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"observations":9,"category":"itinerary validation"}}},{"toolCallId":"error-analysis-call-17-3","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"observations":11,"category":"fare unavailable"}}},{"toolCallId":"error-analysis-call-17-4","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"observations":7,"category":"uncategorized"}}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-18",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:28.000Z"),
                    endTime: new Date("2026-01-02T09:37:35.902Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-18-1",
                        toolName: "bash",
                        input: {
                          command: "node scripts/compare-synthetic-traces.mjs",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-18",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:28.000Z"),
                    endTime: new Date("2026-01-02T09:37:35.902Z"),
                  },
                  {
                    observationId: "error-analysis-tool-18-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:35.902Z"),
                    endTime: new Date("2026-01-02T09:37:37.826Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-18-1",
                        toolName: "bash",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-18-1",
                          toolName: "bash",
                          output: {
                            startedAt: "2026-01-08T09:02:28Z",
                            completedAt: "2026-01-08T09:02:30Z",
                            exitCode: 0,
                            stdout:
                              "timeouts originate at the inventory provider; validation failures originate before model invocation; missing fares follow cache misses",
                            stderr: "",
                          },
                        },
                      },
                    ],
                  },
                ],
                nestingLevel: 0,
                observations: [
                  {
                    id: "error-analysis-generation-14",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-14-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-15",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-16",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-15-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-16-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-17",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-17-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-17-2",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-17-3",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-17-4",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-18",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-18-1",
                    traceId: "trace-demo-error-analysis",
                  },
                ],
              },
            },
            {
              conversationHistory: [
                {
                  role: "system",
                  parts: [
                    {
                      type: "text",
                      text: "You are a demo observability analyst. Use only fictional project data.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "system",
                  parts: [
                    {
                      type: "text",
                      text: "Inspect representative failures before proposing a taxonomy or remediation.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "system",
                  parts: [
                    {
                      type: "text",
                      text: "Never expose identifiers or payloads from real users.",
                    },
                  ],
                  source: "input",
                },
                {
                  role: "user",
                  parts: [
                    {
                      type: "text",
                      text: "Analyze failed traces for a fictional travel assistant. Sample representative failures, group recurring causes into a taxonomy, recommend what to fix first, and suggest how to track the top issue.",
                      providerMetadata: { demo: { cacheControl: "temporary" } },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-1-1",
                      toolName: "skill",
                      input: { name: "error-analysis" },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-1-1","toolName":"skill","output":"Use representative samples, separate symptoms from root causes, and quantify each recurring category."}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-2-1",
                      toolName: "langfuseDocs_getLangfuseDocsPage",
                      input: {
                        pathOrUrl: "/docs/observability/errors",
                        silent: false,
                      },
                    },
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-2-2",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: ["id", "name", "level", "statusMessage"],
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        level: "ERROR",
                        limit: 25,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-2-1","toolName":"langfuseDocs_getLangfuseDocsPage","output":{"type":"tool-result","toolName":"langfuseDocs_getLangfuseDocsPage","content":"Synthetic guidance for investigating failed traces."}},{"toolCallId":"error-analysis-call-2-2","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":25,"cursor":"cursor-demo-page-2"}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-3-1",
                      toolName: "bash",
                      input: {
                        command: "jq 'group_by(.name)' synthetic-errors.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-3-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:13Z","completedAt":"2026-01-08T09:00:14Z","exitCode":0,"stdout":"booking-assistant: 11\\nroute-planner: 8\\nfare-checker: 6","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-4-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq 'group_by(.statusMessage)' synthetic-errors.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-4-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:17Z","completedAt":"2026-01-08T09:00:17Z","exitCode":0,"stdout":"timeout: 9\\ninvalid itinerary: 7\\nmissing fare: 5\\nother: 4","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-5-1",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: [
                          "id",
                          "traceId",
                          "input",
                          "output",
                          "statusMessage",
                        ],
                        filter: [
                          {
                            column: "statusMessage",
                            operator: "contains",
                            value: "timeout",
                          },
                        ],
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        level: "ERROR",
                        limit: 10,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-5-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":10,"sample":"synthetic timeout observations"}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-6-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq '.[] | [.name, .statusMessage]' synthetic-timeouts.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-6-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:29Z","completedAt":"2026-01-08T09:00:29Z","exitCode":0,"stdout":"upstream timeout: 6\\nretry exhausted: 3\\nclient cancelled: 1","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-7-1",
                      toolName: "langfuse_getObservationFilterValues",
                      input: {
                        column: "model",
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        limit: 20,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-7-1","toolName":"langfuse_getObservationFilterValues","output":{"type":"tool-result","toolName":"langfuse_getObservationFilterValues","output":["demo-chat-large","demo-chat-fast","demo-embed-small"]}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-8-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq 'group_by([.model,.name])' synthetic-errors.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-8-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:00:41Z","completedAt":"2026-01-08T09:00:41Z","exitCode":0,"stdout":"demo-chat-fast / route-planner: 8\\ndemo-chat-large / booking-assistant: 11","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-9-1",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: [
                          "id",
                          "traceId",
                          "input",
                          "output",
                          "metadata",
                        ],
                        filter: [
                          {
                            column: "statusMessage",
                            operator: "contains",
                            value: "invalid itinerary",
                          },
                        ],
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        level: "ERROR",
                        limit: 10,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-9-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":7,"sample":"synthetic itinerary validation failures"}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-10-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq '.[] | .metadata.validationReason' synthetic-itineraries.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-10-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:01Z","completedAt":"2026-01-08T09:01:01Z","exitCode":0,"stdout":"impossible connection: 4\\nmissing airport: 2\\ndate ordering: 1","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-11-1",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: [
                          "id",
                          "traceId",
                          "input",
                          "output",
                          "metadata",
                        ],
                        filter: [
                          {
                            column: "statusMessage",
                            operator: "contains",
                            value: "missing fare",
                          },
                        ],
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        limit: 10,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-11-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":5,"sample":"synthetic pricing lookup failures"}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-12-1",
                      toolName: "bash",
                      input: {
                        command:
                          "jq 'group_by([.metadata.provider,.metadata.cache])' synthetic-fares.json",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-12-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:22Z","completedAt":"2026-01-08T09:01:22Z","exitCode":0,"stdout":"provider unavailable / cache miss: 4\\nmalformed response: 1","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-13-1",
                      toolName: "bash",
                      input: {
                        command: "node scripts/summarize-synthetic-errors.mjs",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-13-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:30Z","completedAt":"2026-01-08T09:01:30Z","exitCode":0,"stdout":"upstream reliability 36%\\nvalidation 28%\\ndata availability 20%\\nother 16%","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-14-1",
                      toolName: "langfuse_listObservations",
                      input: {
                        cursor: "cursor-demo-page-2",
                        environment: "production-demo",
                        fields: ["id", "name", "level", "statusMessage"],
                        fromStartTime: "2026-01-01T00:00:00Z",
                        toStartTime: "2026-01-08T00:00:00Z",
                        level: "ERROR",
                        limit: 25,
                        silent: false,
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-14-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"count":25,"cursor":null}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-15-1",
                      toolName: "bash",
                      input: {
                        command: "node scripts/merge-synthetic-samples.mjs",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-15-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:52Z","completedAt":"2026-01-08T09:01:52Z","exitCode":0,"stdout":"50 observations classified; 46 matched the draft taxonomy","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-16-1",
                      toolName: "bash",
                      input: {
                        command:
                          "node scripts/select-synthetic-representatives.mjs",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-16-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:01:57Z","completedAt":"2026-01-08T09:01:57Z","exitCode":0,"stdout":"trace-demo-timeout\\ntrace-demo-validation\\ntrace-demo-fare\\ntrace-demo-other","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-17-1",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: ["*"],
                        limit: 100,
                        silent: false,
                        traceId: "trace-demo-timeout",
                      },
                    },
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-17-2",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: ["*"],
                        limit: 100,
                        silent: false,
                        traceId: "trace-demo-validation",
                      },
                    },
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-17-3",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: ["*"],
                        limit: 100,
                        silent: false,
                        traceId: "trace-demo-fare",
                      },
                    },
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-17-4",
                      toolName: "langfuse_listObservations",
                      input: {
                        fields: ["*"],
                        limit: 100,
                        silent: false,
                        traceId: "trace-demo-other",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-17-1","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"observations":14,"category":"upstream timeout"}}},{"toolCallId":"error-analysis-call-17-2","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"observations":9,"category":"itinerary validation"}}},{"toolCallId":"error-analysis-call-17-3","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"observations":11,"category":"fare unavailable"}}},{"toolCallId":"error-analysis-call-17-4","toolName":"langfuse_listObservations","output":{"type":"tool-result","toolName":"langfuse_listObservations","output":{"observations":7,"category":"uncategorized"}}}]',
                    },
                  ],
                  source: "input",
                },
                {
                  role: "assistant",
                  parts: [
                    {
                      type: "tool-call",
                      toolCallId: "error-analysis-call-18-1",
                      toolName: "bash",
                      input: {
                        command: "node scripts/compare-synthetic-traces.mjs",
                      },
                    },
                  ],
                  source: "input",
                },
                {
                  role: "tool",
                  parts: [
                    {
                      type: "tool-result",
                      toolCallId: null,
                      output:
                        '[{"toolCallId":"error-analysis-call-18-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:02:28Z","completedAt":"2026-01-08T09:02:30Z","exitCode":0,"stdout":"timeouts originate at the inventory provider; validation failures originate before model invocation; missing fares follow cache misses","stderr":""}}]',
                    },
                  ],
                  source: "input",
                },
              ],
              currentTurn: {
                messages: [
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "<screen_context>\nCurrent page: /project/project-demo-travel-assistant/traces\nActive filter: level is ERROR\n  Saved view: booking-assistant, route-planner, fare-checker\n  </screen_context>\n  <current_time>2026-01-02T09:37:39.000Z</current_time>",
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-19",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:39.000Z"),
                    endTime: new Date("2026-01-02T09:38:00.138Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "tool-call",
                        toolCallId: "error-analysis-call-19-1",
                        toolName: "bash",
                        input: {
                          command: "node scripts/rank-synthetic-fixes.mjs",
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-19",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:37:39.000Z"),
                    endTime: new Date("2026-01-02T09:38:00.138Z"),
                  },
                  {
                    observationId: "error-analysis-tool-19-1",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:38:00.138Z"),
                    endTime: new Date("2026-01-02T09:38:01.921Z"),
                    role: "tool",
                    source: "output",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: "error-analysis-call-19-1",
                        toolName: "bash",
                        output: {
                          type: "tool-result",
                          toolCallId: "error-analysis-call-19-1",
                          toolName: "bash",
                          output: {
                            startedAt: "2026-01-08T09:02:39Z",
                            completedAt: "2026-01-08T09:02:41Z",
                            exitCode: 0,
                            stdout:
                              "1 provider timeout handling\n2 itinerary pre-validation\n3 fare cache fallback\n4 improve unknown-error metadata",
                            stderr: "",
                          },
                        },
                      },
                    ],
                  },
                  {
                    role: "tool",
                    parts: [
                      {
                        type: "tool-result",
                        toolCallId: null,
                        output:
                          '[{"toolCallId":"error-analysis-call-19-1","toolName":"bash","output":{"startedAt":"2026-01-08T09:02:39Z","completedAt":"2026-01-08T09:02:41Z","exitCode":0,"stdout":"1 provider timeout handling\\n2 itinerary pre-validation\\n3 fare cache fallback\\n4 improve unknown-error metadata","stderr":""}}]',
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-20",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:38:02.000Z"),
                    endTime: new Date("2026-01-02T09:38:24.149Z"),
                  },
                  {
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "Summarize the taxonomy, recommend the first fix, and suggest a durable way to track it.",
                      },
                    ],
                    source: "input",
                    observationId: "error-analysis-generation-20",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:38:02.000Z"),
                    endTime: new Date("2026-01-02T09:38:24.149Z"),
                  },
                  {
                    role: "assistant",
                    parts: [
                      {
                        type: "data",
                        value: {
                          taxonomy: {
                            primaryIssue: "tool-timeout",
                            affectedWorkflow: "booking-assistant",
                            recommendedFix: "Add bounded retries with backoff",
                          },
                          tracking: {
                            metric: "tool_error_rate",
                            owner: "agent-platform",
                          },
                        },
                      },
                    ],
                    source: "output",
                    observationId: "error-analysis-generation-20",
                    traceId: "trace-demo-error-analysis",
                    startTime: new Date("2026-01-02T09:38:02.000Z"),
                    endTime: new Date("2026-01-02T09:38:24.149Z"),
                  },
                ],
                nestingLevel: 0,
                observations: [
                  {
                    id: "error-analysis-generation-19",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-tool-19-1",
                    traceId: "trace-demo-error-analysis",
                  },
                  {
                    id: "error-analysis-generation-20",
                    traceId: "trace-demo-error-analysis",
                  },
                ],
              },
            },
          ],
        },
      },
      observations: [
        {
          id: "error-analysis-generation-1",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:35:00.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-1-1",
          traceId: "trace-demo-error-analysis",
          name: "skill",
          startTime: new Date("2026-01-02T09:35:06.370Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-2",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:35:07.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-2-1",
          traceId: "trace-demo-error-analysis",
          name: "langfuseDocs_getLangfuseDocsPage",
          startTime: new Date("2026-01-02T09:35:12.345Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-2-2",
          traceId: "trace-demo-error-analysis",
          name: "langfuse_listObservations",
          startTime: new Date("2026-01-02T09:35:12.345Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-3",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:35:13.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-3-1",
          traceId: "trace-demo-error-analysis",
          name: "bash",
          startTime: new Date("2026-01-02T09:35:15.759Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-4",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:35:17.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-4-1",
          traceId: "trace-demo-error-analysis",
          name: "bash",
          startTime: new Date("2026-01-02T09:35:22.457Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-5",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:35:23.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-5-1",
          traceId: "trace-demo-error-analysis",
          name: "langfuse_listObservations",
          startTime: new Date("2026-01-02T09:35:28.896Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-6",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:35:29.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-6-1",
          traceId: "trace-demo-error-analysis",
          name: "bash",
          startTime: new Date("2026-01-02T09:35:31.974Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-7",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:35:32.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-7-1",
          traceId: "trace-demo-error-analysis",
          name: "langfuse_getObservationFilterValues",
          startTime: new Date("2026-01-02T09:35:40.043Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-8",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:35:41.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-8-1",
          traceId: "trace-demo-error-analysis",
          name: "bash",
          startTime: new Date("2026-01-02T09:35:44.716Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-9",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:35:44.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-9-1",
          traceId: "trace-demo-error-analysis",
          name: "langfuse_listObservations",
          startTime: new Date("2026-01-02T09:35:59.801Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-10",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:36:01.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-10-1",
          traceId: "trace-demo-error-analysis",
          name: "bash",
          startTime: new Date("2026-01-02T09:36:06.819Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-11",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:36:07.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-11-1",
          traceId: "trace-demo-error-analysis",
          name: "langfuse_listObservations",
          startTime: new Date("2026-01-02T09:36:21.948Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-12",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:36:22.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-12-1",
          traceId: "trace-demo-error-analysis",
          name: "bash",
          startTime: new Date("2026-01-02T09:36:29.054Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-13",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:36:30.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-13-1",
          traceId: "trace-demo-error-analysis",
          name: "bash",
          startTime: new Date("2026-01-02T09:36:39.036Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-14",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:36:39.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-14-1",
          traceId: "trace-demo-error-analysis",
          name: "langfuse_listObservations",
          startTime: new Date("2026-01-02T09:36:51.964Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-15",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:36:52.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-15-1",
          traceId: "trace-demo-error-analysis",
          name: "bash",
          startTime: new Date("2026-01-02T09:36:57.249Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-16",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:36:57.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-16-1",
          traceId: "trace-demo-error-analysis",
          name: "bash",
          startTime: new Date("2026-01-02T09:37:06.648Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-17",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:37:08.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-17-1",
          traceId: "trace-demo-error-analysis",
          name: "langfuse_listObservations",
          startTime: new Date("2026-01-02T09:37:26.765Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-17-2",
          traceId: "trace-demo-error-analysis",
          name: "langfuse_listObservations",
          startTime: new Date("2026-01-02T09:37:26.765Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-17-3",
          traceId: "trace-demo-error-analysis",
          name: "langfuse_listObservations",
          startTime: new Date("2026-01-02T09:37:26.765Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-17-4",
          traceId: "trace-demo-error-analysis",
          name: "langfuse_listObservations",
          startTime: new Date("2026-01-02T09:37:26.765Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-18",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:37:28.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-18-1",
          traceId: "trace-demo-error-analysis",
          name: "bash",
          startTime: new Date("2026-01-02T09:37:35.902Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-19",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:37:39.000Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-tool-19-1",
          traceId: "trace-demo-error-analysis",
          name: "bash",
          startTime: new Date("2026-01-02T09:38:00.138Z"),
          environment: "storybook",
        },
        {
          id: "error-analysis-generation-20",
          traceId: "trace-demo-error-analysis",
          name: "invoke-model",
          startTime: new Date("2026-01-02T09:38:02.000Z"),
          environment: "storybook",
        },
      ],
      filtered: false,
    },
  },
];
