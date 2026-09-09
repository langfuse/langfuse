import preview from "@/.storybook/preview";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { type ComponentProps } from "react";

import {
  SessionConversationTimeline,
  useSessionConversationTimelineController,
} from "@/src/components/session/SessionConversationTimeline/SessionConversationTimeline";

type TimelineProps = Omit<
  ComponentProps<typeof SessionConversationTimeline>,
  "controller"
>;
type Observation = NonNullable<
  TimelineProps["traces"][number]["observations"]
>[number];

function SessionConversationTimelineStory(props: TimelineProps) {
  const controller = useSessionConversationTimelineController(props.traces);

  return (
    <div className="bg-card dark:bg-background h-screen min-w-[320px]">
      <SessionConversationTimeline {...props} controller={controller} />
    </div>
  );
}

const trace = {
  id: "trace-order-support-8f3a2",
  name: "Resolve delivery address request",
  timestamp: new Date("2026-01-01T12:14:03.000Z"),
  environment: "production",
  userId: "customer-48291",
  observationCount: 5,
  latencyMs: 4260,
  scores: [],
} satisfies TimelineProps["traces"][number]["trace"];

const observations = [
  {
    id: "generation-1",
    name: "Plan support response",
    type: "GENERATION",
    startTime: new Date("2026-01-01T12:14:03.000Z"),
    input: JSON.stringify([
      {
        role: "system",
        content:
          "You are Acme's customer support agent. Verify order details before making changes. Never promise an address update after an order has shipped.",
      },
      {
        role: "user",
        content:
          "Hi, I just noticed order #LF-20481 is going to my old address. Can you send it to 12 Market Street, San Francisco, CA 94105 instead?",
      },
    ]),
    output: JSON.stringify({
      role: "assistant",
      content: "I'll check whether the order can still be updated.",
      tool_calls: [
        {
          id: "call-order-lookup",
          type: "function",
          function: {
            name: "get_order",
            arguments: '{"orderId":"LF-20481"}',
          },
        },
      ],
    }),
    metadata: { model: "gpt-4.1", region: "us-west-2" },
    latency: 0.81,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
  {
    id: "tool-order-lookup",
    name: "Get order",
    type: "TOOL",
    startTime: new Date("2026-01-01T12:14:03.810Z"),
    input: JSON.stringify({ orderId: "LF-20481" }),
    output: JSON.stringify({
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
    }),
    metadata: { cache: "miss", toolCallId: "call-order-lookup" },
    latency: 0.34,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
  {
    id: "generation-2",
    name: "Decide next action",
    type: "GENERATION",
    startTime: new Date("2026-01-01T12:14:04.150Z"),
    input: JSON.stringify({
      role: "tool",
      tool_call_id: "call-order-lookup",
      content: JSON.stringify({
        orderId: "LF-20481",
        status: "processing",
        addressCanBeChanged: true,
      }),
    }),
    output: JSON.stringify({
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "The order is still processing and permits address changes, so it is safe to update it.",
        },
        {
          type: "text",
          text: "The order is still processing, so I can update the delivery address.",
        },
      ],
      tool_calls: [
        {
          id: "call-address-update",
          type: "function",
          function: {
            name: "update_shipping_address",
            arguments: JSON.stringify({
              orderId: "LF-20481",
              address: {
                line1: "12 Market Street",
                city: "San Francisco",
                state: "CA",
                postalCode: "94105",
                country: "US",
              },
            }),
          },
        },
      ],
    }),
    metadata: { model: "gpt-4.1", finishReason: "tool_calls" },
    latency: 0.93,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
  {
    id: "tool-address-update",
    name: "Update shipping address",
    type: "TOOL",
    startTime: new Date("2026-01-01T12:14:05.080Z"),
    input: JSON.stringify({
      orderId: "LF-20481",
      address: "12 Market Street, San Francisco, CA 94105",
    }),
    output: JSON.stringify({
      success: true,
      confirmationId: "addr_7b19c2",
      updatedAt: "2026-01-01T12:14:05.410Z",
    }),
    metadata: {
      service: "order-management",
      toolCallId: "call-address-update",
    },
    latency: 0.33,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
  {
    id: "generation-3",
    name: "Compose final response",
    type: "GENERATION",
    startTime: new Date("2026-01-01T12:14:05.410Z"),
    input: JSON.stringify({
      role: "tool",
      tool_call_id: "call-address-update",
      content: JSON.stringify({ success: true, confirmationId: "addr_7b19c2" }),
    }),
    output: JSON.stringify({
      role: "assistant",
      content:
        "Your shipping address has been updated to **12 Market Street, San Francisco, CA 94105**.\n\nOrder **#LF-20481** is still expected by **January 4**. You'll receive tracking details by email once it ships.",
    }),
    metadata: { model: "gpt-4.1", finishReason: "stop" },
    latency: 0.85,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
] as unknown as Observation[];

const agentPrompt =
  "Build a fictional recipe planner dashboard with a compact density option. Inspect the codebase, update the existing component and tests, then verify the change.";
const researchTraceId = "trace-demo-research-turn";
const implementationTraceId = "trace-demo-implementation-turn";
const fixtureStart = new Date("2026-01-02T09:30:00.000Z").getTime();

const telemetryMetadata = {
  agent: "demo-coding-agent",
  "attributes.langfuse.environment": "storybook",
  "attributes.langfuse.internal.is_app_root": false,
  "attributes.langfuse.plugin.version": "0.0.0-demo",
  "attributes.langfuse.user.id": "demo-user",
  "attributes.session.id": "session-demo-recipe-planner",
  "resourceAttributes.service.name": "fictional-editor",
  "resourceAttributes.telemetry.sdk.language": "typescript",
  "resourceAttributes.telemetry.sdk.name": "demo-sdk",
  "resourceAttributes.telemetry.sdk.version": "0.0.0-demo",
  "scope.name": "demo-coding-agent",
  "scope.version": "0.0.0-demo",
};

function codingAgentObservation({
  traceId,
  id,
  parentObservationId,
  type,
  name,
  offsetMs,
  latency,
  input,
  output,
  metadata,
}: {
  traceId: string;
  id: string;
  parentObservationId: string | null;
  type: "AGENT" | "EVENT" | "GENERATION" | "TOOL";
  name: string;
  offsetMs: number;
  latency: number | null;
  input: string | null;
  output: string | null;
  metadata?: Record<string, unknown>;
}) {
  return {
    id,
    traceId,
    parentObservationId,
    name,
    type,
    startTime: new Date(fixtureStart + offsetMs),
    input,
    output,
    metadata: {
      ...telemetryMetadata,
      "attributes.langfuse.observation.type": type.toLowerCase(),
      ...(type === "GENERATION"
        ? {
            finish: "stop",
            messageID: `message-${id}`,
            mode: "build",
            modelID: "demo-model-1",
            providerID: "demo-provider",
          }
        : {}),
      ...(type === "AGENT"
        ? { modelID: "demo-model-1", providerID: "demo-provider" }
        : {}),
      ...(type === "TOOL" ? { callID: `call-${id}`, tool: name } : {}),
      ...metadata,
    },
    latency,
    model: type === "GENERATION" ? "demo-model-1" : null,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  } as unknown as Observation;
}

const userMessage = JSON.stringify([
  { role: "user", content: [{ type: "text", text: agentPrompt }] },
]);
const assistantMessage = (content: string) =>
  JSON.stringify([{ role: "assistant", content }]);
const toolResult = (toolCallId: string, content: string) => ({
  role: "tool",
  tool_call_id: toolCallId,
  content,
});
const assistantToolCalls = (
  content: string | null,
  calls: Array<{ id: string; name: string; arguments: object }>,
) =>
  JSON.stringify([
    {
      role: "assistant",
      content,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      })),
    },
  ]);

const researchTurnId = "research-agent-turn";
const researchCodingAgentObservations = [
  codingAgentObservation({
    traceId: researchTraceId,
    id: researchTurnId,
    parentObservationId: "session-root-demo",
    type: "AGENT",
    name: "opencode.turn",
    offsetMs: 0,
    latency: 87.347,
    input: userMessage,
    output: assistantMessage(
      "I mapped the dashboard, its state ownership, and the closest interaction tests. The implementation can stay local to the existing component.",
    ),
  }),
  codingAgentObservation({
    traceId: researchTraceId,
    id: "research-user-message",
    parentObservationId: researchTurnId,
    type: "EVENT",
    name: "opencode.message.user",
    offsetMs: 1,
    latency: 0,
    input: userMessage,
    output: null,
  }),
  codingAgentObservation({
    traceId: researchTraceId,
    id: "research-generation-1",
    parentObservationId: researchTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 6,
    latency: 13.224,
    input: userMessage,
    output: assistantMessage(
      "I will load the frontend and Storybook guidance, index the fictional repository, and locate the dashboard entry points.",
    ),
  }),
  ...[
    [
      "research-tool-1",
      "skill",
      13_230,
      0.064,
      { name: "typescript" },
      { loaded: true },
    ],
    [
      "research-tool-2",
      "skill",
      13_232,
      0.061,
      { name: "storybook" },
      { loaded: true },
    ],
    [
      "research-tool-3",
      "skill",
      13_234,
      0.051,
      { name: "frontend-guidelines" },
      { loaded: true },
    ],
    [
      "research-tool-4",
      "grepika_add_workspace",
      13_236,
      4.592,
      { path: "~/demo/recipe-planner" },
      { indexedFiles: 214 },
    ],
    [
      "research-tool-5",
      "tilth_tilth_search",
      13_238,
      0.096,
      { query: "RecipeDashboard" },
      { matches: 6 },
    ],
    [
      "research-tool-6",
      "tilth_tilth_files",
      13_240,
      0.389,
      { patterns: ["src/features/recipes/**/*"] },
      { files: 12 },
    ],
  ].map(([id, name, offsetMs, latency, input, output]) =>
    codingAgentObservation({
      traceId: researchTraceId,
      id: id as string,
      parentObservationId: "research-generation-1",
      type: "TOOL",
      name: name as string,
      offsetMs: offsetMs as number,
      latency: latency as number,
      input: JSON.stringify(input),
      output: JSON.stringify(output),
    }),
  ),
  codingAgentObservation({
    traceId: researchTraceId,
    id: "research-generation-2",
    parentObservationId: researchTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 17_828,
    latency: 43.193,
    input: JSON.stringify([
      { role: "assistant", content: "I will inspect the matching files." },
      toolResult("call-research-tool-1", "TypeScript guidance loaded."),
      toolResult("call-research-tool-2", "Storybook guidance loaded."),
      toolResult("call-research-tool-3", "Frontend guidance loaded."),
      toolResult("call-research-tool-4", "The demo workspace is indexed."),
      toolResult("call-research-tool-5", "Found the dashboard and tests."),
      toolResult("call-research-tool-6", "Found twelve recipe feature files."),
    ]),
    output: assistantToolCalls(null, [
      {
        id: "call-read-component",
        name: "tilth_tilth_read",
        arguments: { path: "src/features/recipes/RecipeDashboard.tsx" },
      },
      {
        id: "call-read-test",
        name: "tilth_tilth_read",
        arguments: { path: "src/features/recipes/RecipeDashboard.test.tsx" },
      },
      {
        id: "call-package",
        name: "bash",
        arguments: { command: "pnpm --filter demo-app test --help" },
      },
      {
        id: "call-search-state",
        name: "tilth_tilth_search",
        arguments: { query: "sessionStorage" },
      },
      {
        id: "call-list-stories",
        name: "tilth_tilth_files",
        arguments: { patterns: ["src/**/*.stories.tsx"] },
      },
    ]),
  }),
  ...[
    [
      "research-tool-7",
      "tilth_tilth_read",
      61_021,
      0.01,
      { path: "src/features/recipes/RecipeDashboard.tsx" },
      {
        lines: 186,
        summary: "Dashboard component with toolbar and task cards.",
      },
    ],
    [
      "research-tool-8",
      "tilth_tilth_read",
      61_023,
      0.003,
      { path: "src/features/recipes/RecipeDashboard.test.tsx" },
      { lines: 122, summary: "Existing rendering and filtering tests." },
    ],
    [
      "research-tool-9",
      "bash",
      61_025,
      33.987,
      { command: "pnpm --filter demo-app test --help" },
      "Usage: test [filters]\nAll command examples are fictional.",
    ],
    [
      "research-tool-10",
      "tilth_tilth_search",
      61_027,
      6.862,
      { query: "sessionStorage" },
      { matches: 4 },
    ],
    [
      "research-tool-11",
      "tilth_tilth_files",
      61_029,
      7.109,
      { patterns: ["src/**/*.stories.tsx"] },
      { files: 19 },
    ],
  ].map(([id, name, offsetMs, latency, input, output]) =>
    codingAgentObservation({
      traceId: researchTraceId,
      id: id as string,
      parentObservationId: "research-generation-2",
      type: "TOOL",
      name: name as string,
      offsetMs: offsetMs as number,
      latency: latency as number,
      input: JSON.stringify(input),
      output: typeof output === "string" ? output : JSON.stringify(output),
    }),
  ),
  codingAgentObservation({
    traceId: researchTraceId,
    id: "research-generation-3",
    parentObservationId: researchTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 61_031,
    latency: 9.66,
    input:
      "The dashboard uses local state and has an established toolbar checkbox pattern.",
    output: assistantToolCalls(null, [
      { id: "call-index", name: "grepika_index", arguments: { force: false } },
      {
        id: "call-read-storage",
        name: "tilth_tilth_read",
        arguments: { path: "src/hooks/useSessionPreference.ts" },
      },
      {
        id: "call-find-tests",
        name: "tilth_tilth_files",
        arguments: { patterns: ["src/features/recipes/*.test.tsx"] },
      },
      {
        id: "call-find-config",
        name: "tilth_tilth_files",
        arguments: { patterns: ["**/vitest.config.*"] },
      },
      {
        id: "call-search-checkbox",
        name: "tilth_tilth_search",
        arguments: { query: "Hide archived" },
      },
    ]),
  }),
  ...[
    [
      "research-tool-12",
      "grepika_index",
      70_691,
      0.227,
      { force: false },
      { indexedFiles: 214 },
    ],
    [
      "research-tool-13",
      "tilth_tilth_read",
      70_693,
      0.005,
      { path: "src/hooks/useSessionPreference.ts" },
      { lines: 48 },
    ],
    [
      "research-tool-14",
      "tilth_tilth_files",
      70_695,
      0.002,
      { patterns: ["src/features/recipes/*.test.tsx"] },
      { files: 2 },
    ],
    [
      "research-tool-15",
      "tilth_tilth_files",
      70_697,
      0.006,
      { patterns: ["**/vitest.config.*"] },
      { files: 1 },
    ],
    [
      "research-tool-16",
      "tilth_tilth_search",
      70_699,
      0.136,
      { query: "Hide archived" },
      { matches: 1 },
    ],
  ].map(([id, name, offsetMs, latency, input, output]) =>
    codingAgentObservation({
      traceId: researchTraceId,
      id: id as string,
      parentObservationId: "research-generation-3",
      type: "TOOL",
      name: name as string,
      offsetMs: offsetMs as number,
      latency: latency as number,
      input: JSON.stringify(input),
      output: JSON.stringify(output),
    }),
  ),
  codingAgentObservation({
    traceId: researchTraceId,
    id: "research-generation-4",
    parentObservationId: researchTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 70_701,
    latency: 13.95,
    input: JSON.stringify([
      { role: "assistant", content: null },
      toolResult("call-index", "Index refreshed."),
      toolResult(
        "call-read-storage",
        "A session preference hook already exists.",
      ),
      toolResult("call-find-tests", "Two nearby test files found."),
      toolResult("call-find-config", "One Vitest config found."),
      toolResult(
        "call-search-checkbox",
        "Found an analogous toolbar checkbox.",
      ),
    ]),
    output: assistantToolCalls(
      "I have the implementation pattern and will confirm its callers before editing.",
      [
        {
          id: "call-final-search",
          name: "tilth_tilth_search",
          arguments: { query: "useSessionPreference" },
        },
        {
          id: "call-final-files",
          name: "tilth_tilth_files",
          arguments: { patterns: ["src/features/recipes/*"] },
        },
        {
          id: "call-related",
          name: "grepika_search",
          arguments: { query: "recipe filtering toolbar" },
        },
      ],
    ),
  }),
  ...[
    [
      "research-tool-17",
      "tilth_tilth_search",
      84_651,
      0.136,
      { query: "useSessionPreference" },
      { matches: 7 },
    ],
    [
      "research-tool-18",
      "tilth_tilth_files",
      84_653,
      0.344,
      { patterns: ["src/features/recipes/*"] },
      { files: 9 },
    ],
    [
      "research-tool-19",
      "grepika_search",
      84_655,
      0.006,
      { query: "recipe filtering toolbar" },
      { matches: 3 },
    ],
  ].map(([id, name, offsetMs, latency, input, output]) =>
    codingAgentObservation({
      traceId: researchTraceId,
      id: id as string,
      parentObservationId: "research-generation-4",
      type: "TOOL",
      name: name as string,
      offsetMs: offsetMs as number,
      latency: latency as number,
      input: JSON.stringify(input),
      output: JSON.stringify(output),
    }),
  ),
  codingAgentObservation({
    traceId: researchTraceId,
    id: "research-generation-5",
    parentObservationId: researchTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 84_657,
    latency: 7.294,
    input: JSON.stringify([
      {
        role: "assistant",
        content: "I will confirm the final integration points.",
      },
      toolResult(
        "call-final-search",
        "The hook is already used by seven components.",
      ),
      toolResult("call-final-files", "The dashboard and test are colocated."),
      toolResult("call-related", "The toolbar owns all recipe filters."),
    ]),
    output: assistantMessage(
      "Research complete. I will add the compact-density checkbox to the existing toolbar, persist it with the session preference hook, and extend the colocated interaction test.",
    ),
  }),
];

const implementationTurnId = "implementation-agent-turn";
const implementationCodingAgentObservations = [
  codingAgentObservation({
    traceId: implementationTraceId,
    id: implementationTurnId,
    parentObservationId: "session-root-demo",
    type: "AGENT",
    name: "opencode.turn",
    offsetMs: 120_000,
    latency: 167.662,
    input: userMessage,
    output: assistantMessage(
      "Implemented the compact recipe cards, added coverage, and verified tests and lint.",
    ),
  }),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-user-message",
    parentObservationId: implementationTurnId,
    type: "EVENT",
    name: "opencode.message.user",
    offsetMs: 120_001,
    latency: 0,
    input: userMessage,
    output: null,
  }),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-generation-1",
    parentObservationId: implementationTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 120_006,
    latency: 20.463,
    input: userMessage,
    output: assistantToolCalls(
      "I will make the smallest component and test change.",
      [
        {
          id: "call-patch-1",
          name: "apply_patch",
          arguments: {
            file: "src/features/recipes/RecipeDashboard.tsx",
            change: "Add compact density preference.",
          },
        },
      ],
    ),
  }),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-tool-1",
    parentObservationId: "implementation-generation-1",
    type: "TOOL",
    name: "apply_patch",
    offsetMs: 140_469,
    latency: 0.023,
    input: JSON.stringify({
      patch: "Synthetic dashboard patch with no source code.",
    }),
    output: JSON.stringify({ success: true, filesChanged: 1 }),
  }),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-generation-2",
    parentObservationId: implementationTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 140_492,
    latency: 5.241,
    input: JSON.stringify([
      { role: "assistant", content: "The component change is applied." },
      toolResult("call-patch-1", "Updated one fictional file."),
    ]),
    output: assistantToolCalls(null, [
      {
        id: "call-diff",
        name: "tilth_tilth_diff",
        arguments: { scope: "src/features/recipes/RecipeDashboard.tsx" },
      },
      {
        id: "call-search-tests",
        name: "tilth_tilth_search",
        arguments: { query: "RecipeDashboard tests" },
      },
      {
        id: "call-read-tests",
        name: "tilth_tilth_read",
        arguments: { path: "src/features/recipes/RecipeDashboard.test.tsx" },
      },
    ]),
  }),
  ...[
    [
      "implementation-tool-2",
      "tilth_tilth_diff",
      145_733,
      0.083,
      { scope: "src/features/recipes/RecipeDashboard.tsx" },
      { additions: 18, deletions: 2 },
    ],
    [
      "implementation-tool-3",
      "tilth_tilth_search",
      145_735,
      0.197,
      { query: "RecipeDashboard tests" },
      { matches: 4 },
    ],
    [
      "implementation-tool-4",
      "tilth_tilth_read",
      145_737,
      0.196,
      { path: "src/features/recipes/RecipeDashboard.test.tsx" },
      { lines: 122 },
    ],
  ].map(([id, name, offsetMs, latency, input, output]) =>
    codingAgentObservation({
      traceId: implementationTraceId,
      id: id as string,
      parentObservationId: "implementation-generation-2",
      type: "TOOL",
      name: name as string,
      offsetMs: offsetMs as number,
      latency: latency as number,
      input: JSON.stringify(input),
      output: JSON.stringify(output),
    }),
  ),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-generation-3",
    parentObservationId: implementationTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 145_739,
    latency: 10.318,
    input: JSON.stringify([
      { role: "assistant", content: null },
      toolResult("call-diff", "The component diff is scoped."),
      toolResult("call-search-tests", "Found the colocated tests."),
      toolResult("call-read-tests", "The test uses user-visible queries."),
    ]),
    output: assistantToolCalls(null, [
      {
        id: "call-patch-tests",
        name: "apply_patch",
        arguments: {
          file: "src/features/recipes/RecipeDashboard.test.tsx",
          change: "Cover compact density persistence.",
        },
      },
    ]),
  }),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-tool-5",
    parentObservationId: "implementation-generation-3",
    type: "TOOL",
    name: "apply_patch",
    offsetMs: 156_057,
    latency: 0.004,
    input: JSON.stringify({ patch: "Synthetic interaction test patch." }),
    output: JSON.stringify({ success: true, filesChanged: 1 }),
  }),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-generation-4",
    parentObservationId: implementationTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 156_061,
    latency: 61.287,
    input: JSON.stringify([
      { role: "assistant", content: null },
      toolResult("call-patch-tests", "Updated one fictional test file."),
    ]),
    output: assistantToolCalls(
      "The implementation and test are ready. I will run both targeted checks in parallel.",
      [
        {
          id: "call-test",
          name: "bash",
          arguments: {
            command: "pnpm --filter demo-app test RecipeDashboard.test.tsx",
          },
        },
        {
          id: "call-lint",
          name: "bash",
          arguments: {
            command: "pnpm --filter demo-app lint RecipeDashboard.tsx",
          },
        },
      ],
    ),
  }),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-tool-6",
    parentObservationId: "implementation-generation-4",
    type: "TOOL",
    name: "bash",
    offsetMs: 217_348,
    latency: 14.852,
    input: JSON.stringify({
      command: "pnpm --filter demo-app test RecipeDashboard.test.tsx",
    }),
    output: JSON.stringify({ testFiles: 1, testsPassed: 6, testsFailed: 0 }),
  }),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-tool-7",
    parentObservationId: "implementation-generation-4",
    type: "TOOL",
    name: "bash",
    offsetMs: 217_350,
    latency: 51.812,
    input: JSON.stringify({
      command: "pnpm --filter demo-app lint RecipeDashboard.tsx",
    }),
    output: "Lint completed successfully with no warnings.",
  }),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-generation-5",
    parentObservationId: implementationTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 217_352,
    latency: 23.685,
    input:
      "Targeted tests and lint passed. Inspect the final diff and repository status.",
    output: assistantToolCalls(null, [
      {
        id: "call-status",
        name: "bash",
        arguments: { command: "git status --short" },
      },
      {
        id: "call-format",
        name: "bash",
        arguments: {
          command:
            "pnpm prettier --check src/features/recipes/RecipeDashboard.tsx",
        },
      },
      {
        id: "call-diff-stat",
        name: "bash",
        arguments: { command: "git diff --stat" },
      },
    ]),
  }),
  ...[
    [
      "implementation-tool-8",
      241_037,
      0.139,
      { command: "git status --short" },
      { modified: ["RecipeDashboard.tsx", "RecipeDashboard.test.tsx"] },
    ],
    [
      "implementation-tool-9",
      241_039,
      14.279,
      {
        command:
          "pnpm prettier --check src/features/recipes/RecipeDashboard.tsx",
      },
      { checked: 1, formatted: true },
    ],
    [
      "implementation-tool-10",
      241_041,
      0.599,
      { command: "git diff --stat" },
      { filesChanged: 2, insertions: 37, deletions: 4 },
    ],
  ].map(([id, offsetMs, latency, input, output]) =>
    codingAgentObservation({
      traceId: implementationTraceId,
      id: id as string,
      parentObservationId: "implementation-generation-5",
      type: "TOOL",
      name: "bash",
      offsetMs: offsetMs as number,
      latency: latency as number,
      input: JSON.stringify(input),
      output: JSON.stringify(output),
    }),
  ),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-generation-6",
    parentObservationId: implementationTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 241_043,
    latency: 35.864,
    input: JSON.stringify([
      { role: "assistant", content: null },
      toolResult("call-status", "Only the two intended files changed."),
      toolResult("call-format", "Formatting passed."),
      toolResult("call-diff-stat", "The diff is compact."),
    ]),
    output: assistantToolCalls(
      "I will run the final focused Storybook check.",
      [
        {
          id: "call-storybook",
          name: "bash",
          arguments: {
            command:
              "pnpm --filter demo-app test-storybook RecipeDashboard.stories.tsx",
          },
        },
      ],
    ),
  }),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-tool-11",
    parentObservationId: "implementation-generation-6",
    type: "TOOL",
    name: "bash",
    offsetMs: 276_907,
    latency: 28.994,
    input: JSON.stringify({
      command:
        "pnpm --filter demo-app test-storybook RecipeDashboard.stories.tsx",
    }),
    output: JSON.stringify({ storyFiles: 1, testsPassed: 8, testsFailed: 0 }),
  }),
  codingAgentObservation({
    traceId: implementationTraceId,
    id: "implementation-generation-7",
    parentObservationId: implementationTurnId,
    type: "GENERATION",
    name: "opencode.generation",
    offsetMs: 276_909,
    latency: 10.775,
    input: JSON.stringify([
      {
        role: "assistant",
        content: "I will run the final focused Storybook check.",
      },
      toolResult("call-storybook", "Eight Storybook tests passed."),
    ]),
    output: assistantMessage(
      "Implemented a compact density option for the fictional recipe dashboard, persisted it for the browser tab, and added interaction coverage. Targeted tests, Storybook, formatting, and lint all pass.",
    ),
  }),
];

const inAppAgentTraceId = "trace-demo-error-analysis";
const inAppAgentTurnId = "error-analysis-agent-turn";
const inAppAgentPrompt =
  "Analyze failed traces for a fictional travel assistant. Sample representative failures, group recurring causes into a taxonomy, recommend what to fix first, and suggest how to track the top issue.";
const inAppAgentMetadata = {
  cloud_region: "DEMO",
  conversation_id: "conversation-demo-error-analysis",
  execution_runtime: "worker",
  langfuse_ai_feature: "in-app-agent",
  langfuse_project_id: "project-demo-travel-assistant",
  langfuse_user_email: "redacted",
  langfuse_user_id: "user-demo-analyst",
  langfuse_user_is_admin: false,
  prompt_name: "demo-in-app-agent-system-prompt",
  prompt_version: 1,
  run_id: "run-demo-error-analysis",
};

const inAppAgentActions: Array<{
  offsetMs: number;
  latency: number;
  summary: string;
  tools: Array<{
    name: string;
    latency: number;
    input: Record<string, unknown>;
    output: unknown;
    outputAsText?: boolean;
  }>;
}> = [
  {
    offsetMs: 300_000,
    latency: 6.37,
    summary: "I will load the error-analysis workflow before inspecting data.",
    tools: [
      {
        name: "skill",
        latency: 0.001,
        input: { name: "error-analysis" },
        output:
          "Use representative samples, separate symptoms from root causes, and quantify each recurring category.",
        outputAsText: true,
      },
    ],
  },
  {
    offsetMs: 307_000,
    latency: 5.345,
    summary:
      "I will confirm the analysis guidance and retrieve a bounded sample of failed observations.",
    tools: [
      {
        name: "langfuseDocs_getLangfuseDocsPage",
        latency: 0.29,
        input: { pathOrUrl: "/docs/observability/errors", silent: false },
        output: {
          type: "tool-result",
          toolName: "langfuseDocs_getLangfuseDocsPage",
          content: "Synthetic guidance for investigating failed traces.",
        },
      },
      {
        name: "langfuse_listObservations",
        latency: 0.233,
        input: {
          fields: ["id", "name", "level", "statusMessage"],
          fromStartTime: "2026-01-01T00:00:00Z",
          toStartTime: "2026-01-08T00:00:00Z",
          level: "ERROR",
          limit: 25,
          silent: false,
        },
        output: {
          type: "tool-result",
          toolName: "langfuse_listObservations",
          output: { count: 25, cursor: "cursor-demo-page-2" },
        },
      },
    ],
  },
  {
    offsetMs: 313_000,
    latency: 2.759,
    summary:
      "I will summarize the first sample locally without exposing payloads.",
    tools: [
      {
        name: "bash",
        latency: 1.541,
        input: { command: "jq 'group_by(.name)' synthetic-errors.json" },
        output: {
          startedAt: "2026-01-08T09:00:13Z",
          completedAt: "2026-01-08T09:00:14Z",
          exitCode: 0,
          stdout: "booking-assistant: 11\nroute-planner: 8\nfare-checker: 6",
          stderr: "",
        },
      },
    ],
  },
  {
    offsetMs: 317_000,
    latency: 5.457,
    summary: "I will inspect status-message frequencies in the sample.",
    tools: [
      {
        name: "bash",
        latency: 0.195,
        input: {
          command: "jq 'group_by(.statusMessage)' synthetic-errors.json",
        },
        output: {
          startedAt: "2026-01-08T09:00:17Z",
          completedAt: "2026-01-08T09:00:17Z",
          exitCode: 0,
          stdout: "timeout: 9\ninvalid itinerary: 7\nmissing fare: 5\nother: 4",
          stderr: "",
        },
      },
    ],
  },
  {
    offsetMs: 323_000,
    latency: 5.896,
    summary: "I will fetch examples from the largest failure category.",
    tools: [
      {
        name: "langfuse_listObservations",
        latency: 0.219,
        input: {
          fields: ["id", "traceId", "input", "output", "statusMessage"],
          filter: [
            { column: "statusMessage", operator: "contains", value: "timeout" },
          ],
          fromStartTime: "2026-01-01T00:00:00Z",
          toStartTime: "2026-01-08T00:00:00Z",
          level: "ERROR",
          limit: 10,
          silent: false,
        },
        output: {
          type: "tool-result",
          toolName: "langfuse_listObservations",
          output: { count: 10, sample: "synthetic timeout observations" },
        },
      },
    ],
  },
  {
    offsetMs: 329_000,
    latency: 2.974,
    summary: "I will compare error signatures across those examples.",
    tools: [
      {
        name: "bash",
        latency: 0.207,
        input: {
          command: "jq '.[] | [.name, .statusMessage]' synthetic-timeouts.json",
        },
        output: {
          startedAt: "2026-01-08T09:00:29Z",
          completedAt: "2026-01-08T09:00:29Z",
          exitCode: 0,
          stdout:
            "upstream timeout: 6\nretry exhausted: 3\nclient cancelled: 1",
          stderr: "",
        },
      },
    ],
  },
  {
    offsetMs: 332_000,
    latency: 8.043,
    summary:
      "I will discover the available model values before filtering further.",
    tools: [
      {
        name: "langfuse_getObservationFilterValues",
        latency: 0.284,
        input: {
          column: "model",
          fromStartTime: "2026-01-01T00:00:00Z",
          toStartTime: "2026-01-08T00:00:00Z",
          limit: 20,
          silent: false,
        },
        output: {
          type: "tool-result",
          toolName: "langfuse_getObservationFilterValues",
          output: ["demo-chat-large", "demo-chat-fast", "demo-embed-small"],
        },
      },
    ],
  },
  {
    offsetMs: 341_000,
    latency: 3.716,
    summary: "I will quantify failures by model and operation.",
    tools: [
      {
        name: "bash",
        latency: 0.2,
        input: {
          command: "jq 'group_by([.model,.name])' synthetic-errors.json",
        },
        output: {
          startedAt: "2026-01-08T09:00:41Z",
          completedAt: "2026-01-08T09:00:41Z",
          exitCode: 0,
          stdout:
            "demo-chat-fast / route-planner: 8\ndemo-chat-large / booking-assistant: 11",
          stderr: "",
        },
      },
    ],
  },
  {
    offsetMs: 344_000,
    latency: 15.801,
    summary: "I will inspect invalid-itinerary failures as the second cluster.",
    tools: [
      {
        name: "langfuse_listObservations",
        latency: 0.202,
        input: {
          fields: ["id", "traceId", "input", "output", "metadata"],
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
        output: {
          type: "tool-result",
          toolName: "langfuse_listObservations",
          output: {
            count: 7,
            sample: "synthetic itinerary validation failures",
          },
        },
      },
    ],
  },
  {
    offsetMs: 361_000,
    latency: 5.819,
    summary: "I will extract the common validation causes.",
    tools: [
      {
        name: "bash",
        latency: 0.183,
        input: {
          command:
            "jq '.[] | .metadata.validationReason' synthetic-itineraries.json",
        },
        output: {
          startedAt: "2026-01-08T09:01:01Z",
          completedAt: "2026-01-08T09:01:01Z",
          exitCode: 0,
          stdout:
            "impossible connection: 4\nmissing airport: 2\ndate ordering: 1",
          stderr: "",
        },
      },
    ],
  },
  {
    offsetMs: 367_000,
    latency: 14.948,
    summary: "I will inspect missing-fare failures as the third cluster.",
    tools: [
      {
        name: "langfuse_listObservations",
        latency: 0.675,
        input: {
          fields: ["id", "traceId", "input", "output", "metadata"],
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
        output: {
          type: "tool-result",
          toolName: "langfuse_listObservations",
          output: { count: 5, sample: "synthetic pricing lookup failures" },
        },
      },
    ],
  },
  {
    offsetMs: 382_000,
    latency: 7.054,
    summary: "I will compare provider and cache behavior for missing fares.",
    tools: [
      {
        name: "bash",
        latency: 0.199,
        input: {
          command:
            "jq 'group_by([.metadata.provider,.metadata.cache])' synthetic-fares.json",
        },
        output: {
          startedAt: "2026-01-08T09:01:22Z",
          completedAt: "2026-01-08T09:01:22Z",
          exitCode: 0,
          stdout: "provider unavailable / cache miss: 4\nmalformed response: 1",
          stderr: "",
        },
      },
    ],
  },
  {
    offsetMs: 390_000,
    latency: 9.036,
    summary: "I will calculate an initial taxonomy and prevalence table.",
    tools: [
      {
        name: "bash",
        latency: 0.199,
        input: { command: "node scripts/summarize-synthetic-errors.mjs" },
        output: {
          startedAt: "2026-01-08T09:01:30Z",
          completedAt: "2026-01-08T09:01:30Z",
          exitCode: 0,
          stdout:
            "upstream reliability 36%\nvalidation 28%\ndata availability 20%\nother 16%",
          stderr: "",
        },
      },
    ],
  },
  {
    offsetMs: 399_000,
    latency: 12.964,
    summary:
      "I will page through additional failures to check whether the taxonomy holds.",
    tools: [
      {
        name: "langfuse_listObservations",
        latency: 0.192,
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
        output: {
          type: "tool-result",
          toolName: "langfuse_listObservations",
          output: { count: 25, cursor: null },
        },
      },
    ],
  },
  {
    offsetMs: 412_000,
    latency: 5.249,
    summary: "I will merge both pages and recompute category shares.",
    tools: [
      {
        name: "bash",
        latency: 0.197,
        input: { command: "node scripts/merge-synthetic-samples.mjs" },
        output: {
          startedAt: "2026-01-08T09:01:52Z",
          completedAt: "2026-01-08T09:01:52Z",
          exitCode: 0,
          stdout: "50 observations classified; 46 matched the draft taxonomy",
          stderr: "",
        },
      },
    ],
  },
  {
    offsetMs: 417_000,
    latency: 9.648,
    summary:
      "I will identify representative trace IDs for each major category.",
    tools: [
      {
        name: "bash",
        latency: 0.43,
        input: { command: "node scripts/select-synthetic-representatives.mjs" },
        output: {
          startedAt: "2026-01-08T09:01:57Z",
          completedAt: "2026-01-08T09:01:57Z",
          exitCode: 0,
          stdout:
            "trace-demo-timeout\ntrace-demo-validation\ntrace-demo-fare\ntrace-demo-other",
          stderr: "",
        },
      },
    ],
  },
  {
    offsetMs: 428_000,
    latency: 18.765,
    summary: "I will inspect four representative traces in parallel.",
    tools: [
      {
        name: "langfuse_listObservations",
        latency: 1.207,
        input: {
          fields: ["*"],
          limit: 100,
          silent: false,
          traceId: "trace-demo-timeout",
        },
        output: {
          type: "tool-result",
          toolName: "langfuse_listObservations",
          output: { observations: 14, category: "upstream timeout" },
        },
      },
      {
        name: "langfuse_listObservations",
        latency: 0.138,
        input: {
          fields: ["*"],
          limit: 100,
          silent: false,
          traceId: "trace-demo-validation",
        },
        output: {
          type: "tool-result",
          toolName: "langfuse_listObservations",
          output: { observations: 9, category: "itinerary validation" },
        },
      },
      {
        name: "langfuse_listObservations",
        latency: 0.139,
        input: {
          fields: ["*"],
          limit: 100,
          silent: false,
          traceId: "trace-demo-fare",
        },
        output: {
          type: "tool-result",
          toolName: "langfuse_listObservations",
          output: { observations: 11, category: "fare unavailable" },
        },
      },
      {
        name: "langfuse_listObservations",
        latency: 0.12,
        input: {
          fields: ["*"],
          limit: 100,
          silent: false,
          traceId: "trace-demo-other",
        },
        output: {
          type: "tool-result",
          toolName: "langfuse_listObservations",
          output: { observations: 7, category: "uncategorized" },
        },
      },
    ],
  },
  {
    offsetMs: 448_000,
    latency: 7.902,
    summary: "I will compare the causal chains in those representative traces.",
    tools: [
      {
        name: "bash",
        latency: 1.924,
        input: { command: "node scripts/compare-synthetic-traces.mjs" },
        output: {
          startedAt: "2026-01-08T09:02:28Z",
          completedAt: "2026-01-08T09:02:30Z",
          exitCode: 0,
          stdout:
            "timeouts originate at the inventory provider; validation failures originate before model invocation; missing fares follow cache misses",
          stderr: "",
        },
      },
    ],
  },
  {
    offsetMs: 459_000,
    latency: 21.138,
    summary:
      "I will calculate impact and confidence for the recommended priority order.",
    tools: [
      {
        name: "bash",
        latency: 1.783,
        input: { command: "node scripts/rank-synthetic-fixes.mjs" },
        output: {
          startedAt: "2026-01-08T09:02:39Z",
          completedAt: "2026-01-08T09:02:41Z",
          exitCode: 0,
          stdout:
            "1 provider timeout handling\n2 itinerary pre-validation\n3 fare cache fallback\n4 improve unknown-error metadata",
          stderr: "",
        },
      },
    ],
  },
  {
    offsetMs: 482_000,
    latency: 22.149,
    summary:
      "The dominant failure mode is upstream inventory timeout, followed by invalid itinerary construction and missing fare data. Fix timeout retries and circuit breaking first, then add deterministic itinerary validation before model invocation. Track the top category with a categorical evaluator or an annotation queue.",
    tools: [],
  },
];

const inAppAgentSystemMessages = [
  {
    role: "system",
    content:
      "You are a demo observability analyst. Use only fictional project data.",
  },
  {
    role: "system",
    content:
      "Inspect representative failures before proposing a taxonomy or remediation.",
  },
  {
    role: "system",
    content: "Never expose identifiers or payloads from real users.",
    providerOptions: { demo: { cacheControl: "temporary" } },
  },
];

const inAppAgentObservations = [
  ...inAppAgentActions.flatMap((action, actionIndex) => {
    const generationId = `error-analysis-generation-${actionIndex + 1}`;
    const previousMessages = inAppAgentActions
      .slice(0, actionIndex)
      .flatMap((previousAction, previousActionIndex) => [
        {
          role: "assistant",
          content: null,
          tool_calls: previousAction.tools.map((tool, toolIndex) => ({
            toolCallId: `error-analysis-call-${previousActionIndex + 1}-${toolIndex + 1}`,
            toolName: tool.name,
            args: tool.input,
          })),
        },
        {
          role: "tool",
          content: JSON.stringify(
            previousAction.tools.map((tool, toolIndex) => ({
              toolCallId: `error-analysis-call-${previousActionIndex + 1}-${toolIndex + 1}`,
              toolName: tool.name,
              output: tool.output,
            })),
          ),
        },
      ]);
    const runtimeContextOffsetMs =
      actionIndex < 6
        ? inAppAgentActions[0]!.offsetMs
        : actionIndex < 13
          ? inAppAgentActions[6]!.offsetMs
          : actionIndex < 18
            ? inAppAgentActions[13]!.offsetMs
            : inAppAgentActions[18]!.offsetMs;
    const generationInput = JSON.stringify({
      messages: [
        ...inAppAgentSystemMessages,
        {
          role: "user",
          content: [
            {
              type: "text",
              text: inAppAgentPrompt,
              providerOptions: { demo: { cacheControl: "temporary" } },
            },
          ],
          providerOptions: { demo: { cacheControl: "temporary" } },
        },
        ...previousMessages,
        ...(actionIndex === inAppAgentActions.length - 1
          ? [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Summarize the taxonomy, recommend the first fix, and suggest a durable way to track it.",
                  },
                ],
                providerOptions: {
                  demo: { cacheControl: "temporary" },
                },
              },
            ]
          : []),
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `<screen_context>
Current page: /project/project-demo-travel-assistant/traces
Active filter: level is ERROR
  Saved view: booking-assistant, route-planner, fare-checker
  </screen_context>
  <current_time>${new Date(fixtureStart + runtimeContextOffsetMs).toISOString()}</current_time>`,
            },
          ],
        },
      ],
      providerOptions: { demo: { region: "local" } },
      toolChoice: { type: "auto" },
      tools: [
        { name: "langfuse_listObservations" },
        { name: "langfuse_getObservationFilterValues" },
        { name: "langfuseDocs_getLangfuseDocsPage" },
        { name: "bash" },
      ],
    });
    const generationOutput = JSON.stringify(
      action.tools.length > 0
        ? {
            tool_calls: action.tools.map((tool, toolIndex) => ({
              args: tool.input,
              toolCallId: `error-analysis-call-${actionIndex + 1}-${toolIndex + 1}`,
              toolName: tool.name,
            })),
          }
        : { text: action.summary },
    );

    return [
      codingAgentObservation({
        traceId: inAppAgentTraceId,
        id: generationId,
        parentObservationId: inAppAgentTurnId,
        type: "GENERATION",
        name: "invoke-model",
        offsetMs: action.offsetMs,
        latency: action.latency,
        input: generationInput,
        output: generationOutput,
        metadata: { ...inAppAgentMetadata, finish_reason: "stop" },
      }),
      ...action.tools.map((tool, toolIndex) => {
        const toolCallId = `error-analysis-call-${actionIndex + 1}-${toolIndex + 1}`;
        return codingAgentObservation({
          traceId: inAppAgentTraceId,
          id: `error-analysis-tool-${actionIndex + 1}-${toolIndex + 1}`,
          parentObservationId: inAppAgentTurnId,
          type: "TOOL",
          name: tool.name,
          offsetMs: action.offsetMs + Math.round(action.latency * 1_000),
          latency: tool.latency,
          input: JSON.stringify(tool.input),
          output: tool.outputAsText
            ? String(tool.output)
            : JSON.stringify({
                type: "tool-result",
                toolCallId,
                toolName: tool.name,
                output: tool.output,
              }),
          metadata: {
            ...inAppAgentMetadata,
            parentMessageId: `message-demo-${actionIndex + 1}`,
            toolCallApprovalSource: "automatic",
            toolCallId,
          },
        });
      }),
    ];
  }),
];

const inAppAgentTrace = {
  id: inAppAgentTraceId,
  name: "Analyze fictional travel-assistant failures",
  timestamp: new Date(fixtureStart + 300_000),
  environment: "storybook",
  userId: "user-demo-analyst",
  observationCount: inAppAgentObservations.length,
  latencyMs: 205_058,
  scores: [],
} satisfies TimelineProps["traces"][number]["trace"];

const researchCodingAgentTrace = {
  id: researchTraceId,
  name: "Research recipe dashboard density setting",
  timestamp: new Date(fixtureStart),
  environment: "storybook",
  userId: "demo-user",
  observationCount: researchCodingAgentObservations.length,
  latencyMs: 87_347,
  scores: [],
} satisfies TimelineProps["traces"][number]["trace"];

const implementationCodingAgentTrace = {
  id: implementationTraceId,
  name: "Implement recipe dashboard density setting",
  timestamp: new Date(fixtureStart + 120_000),
  environment: "storybook",
  userId: "demo-user",
  observationCount: implementationCodingAgentObservations.length,
  latencyMs: 167_662,
  scores: [],
} satisfies TimelineProps["traces"][number]["trace"];

const observationActions = {
  onFilterByName: fn(),
} satisfies NonNullable<TimelineProps["observationActions"]>;

const loadedArgs = {
  traces: [{ trace, turnNumber: 1, observations }],
  filterMeasurementKey: "default",
  emptyMessage: "This trace has no observations.",
  onOpenTrace: fn(),
  onOpenObservation: fn(),
  observationActions,
} satisfies TimelineProps;

type ToolShape = {
  callId: string;
  name: string;
  input: Record<string, unknown>;
};

const toolShapePrompt =
  "Help me determine whether customer CUS-48291 can cancel their annual plan and receive a refund.";
const toolShapeGenerationMessage =
  "I'll review the customer account and refund policy.";

const toolShapeArgs = ({
  generationTool,
  observationTool,
  nestObservationTool,
}: {
  generationTool: ToolShape | null;
  observationTool: (ToolShape & { output: Record<string, unknown> }) | null;
  nestObservationTool: boolean;
}) => {
  const generationId = "tool-shape-generation";
  const shapeObservations = [
    codingAgentObservation({
      traceId: trace.id,
      id: generationId,
      parentObservationId: null,
      type: "GENERATION",
      name: "Tool shape generation",
      offsetMs: 0,
      latency: 1,
      input: JSON.stringify([{ role: "user", content: toolShapePrompt }]),
      output: generationTool
        ? assistantToolCalls(toolShapeGenerationMessage, [
            {
              id: generationTool.callId,
              name: generationTool.name,
              arguments: generationTool.input,
            },
          ])
        : assistantMessage(toolShapeGenerationMessage),
    }),
    ...(observationTool
      ? [
          codingAgentObservation({
            traceId: trace.id,
            id: "tool-shape-observation",
            parentObservationId: nestObservationTool ? generationId : null,
            type: "TOOL",
            name: observationTool.name,
            offsetMs: 1,
            latency: 1,
            input: JSON.stringify(observationTool.input),
            output: JSON.stringify(observationTool.output),
            metadata: { callID: observationTool.callId },
          }),
        ]
      : []),
  ];

  return {
    ...loadedArgs,
    traces: [
      {
        trace: {
          ...trace,
          observationCount: shapeObservations.length,
        },
        turnNumber: 1,
        observations: shapeObservations,
      },
    ],
  } satisfies TimelineProps;
};

const nestedObservation = ({
  id,
  parentObservationId,
  type,
  input,
  output,
  offset,
}: {
  id: string;
  parentObservationId: string | null;
  type: "AGENT" | "GENERATION" | "TOOL";
  input: unknown;
  output: unknown;
  offset: number;
}) =>
  ({
    id,
    traceId: trace.id,
    parentObservationId,
    type,
    name: id,
    startTime: new Date(offset),
    latency: 1,
    input,
    output,
    metadata: null,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  }) as Observation;

const nestedObservations = [
  nestedObservation({
    id: "opencode.turn",
    parentObservationId: null,
    type: "AGENT",
    input: [{ role: "user", content: "Build the dashboard" }],
    output: "Finished the dashboard",
    offset: 0,
  }),
  nestedObservation({
    id: "generation-1",
    parentObservationId: "opencode.turn",
    type: "GENERATION",
    input: [{ role: "user", content: "Build the dashboard" }],
    output: "Calling three tools",
    offset: 1,
  }),
  ...[1, 2, 3].map((toolNumber) =>
    nestedObservation({
      id: `tool-${toolNumber}`,
      parentObservationId: "generation-1",
      type: "TOOL",
      input: { toolNumber },
      output: { success: true },
      offset: 1 + toolNumber,
    }),
  ),
  nestedObservation({
    id: "generation-2",
    parentObservationId: "opencode.turn",
    type: "GENERATION",
    input: "Continue",
    output: "Calling two tools",
    offset: 5,
  }),
  ...[4, 5].map((toolNumber) =>
    nestedObservation({
      id: `tool-${toolNumber}`,
      parentObservationId: "generation-2",
      type: "TOOL",
      input: { toolNumber },
      output: { success: true },
      offset: 1 + toolNumber,
    }),
  ),
  nestedObservation({
    id: "leaf-generation",
    parentObservationId: null,
    type: "GENERATION",
    input: "Standalone prompt",
    output: "Standalone answer",
    offset: 8,
  }),
];

const meta = preview.meta({
  component: SessionConversationTimelineStory,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
});

export default meta;

export const SupportAgentWorkflow = meta.story({
  args: loadedArgs,
});

export const CodingAgentWorkflow = meta.story({
  args: {
    ...loadedArgs,
    traces: [
      {
        trace: researchCodingAgentTrace,
        turnNumber: 2,
        observations: researchCodingAgentObservations,
      },
      {
        trace: implementationCodingAgentTrace,
        turnNumber: 3,
        observations: implementationCodingAgentObservations,
      },
    ],
  },
});

export const LangfuseAssistantWorkflow = meta.story({
  args: {
    ...loadedArgs,
    traces: [
      {
        trace: inAppAgentTrace,
        turnNumber: 4,
        observations: inAppAgentObservations,
      },
    ],
  },
});

export const Loading = meta.story({
  args: {
    ...loadedArgs,
    traces: [{ trace, turnNumber: 1, observations: undefined }],
  },
});

export const Error = meta.story({
  args: {
    ...loadedArgs,
    traces: [{ trace, turnNumber: 1, observations: null }],
  },
});

export const Empty = meta.story({
  args: {
    ...loadedArgs,
    traces: [{ trace, turnNumber: 1, observations: [] }],
  },
});

export const FilteredEmpty = meta.story({
  args: {
    ...loadedArgs,
    traces: [{ trace, turnNumber: 1, observations: [] }],
    emptyMessage:
      "No observation matches the “Generations” view in this trace.",
  },
});

export const RenderLoadedConversation = meta.story({
  name: "(Test) Renders Loaded Conversation",
  args: SupportAgentWorkflow.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const traceButton = canvas.getByRole("button", {
      name: /1.*trace.*trace-order-support-8f3a2/i,
    });
    await expect(traceButton).toBeInTheDocument();
    await expect(within(traceButton).getByText("1")).toHaveClass("bg-tertiary");
    await expect(canvas.queryByText("+10 min idle")).not.toBeInTheDocument();

    const observationButton = canvas.getByRole("button", {
      name: "Plan support response",
    });
    await expect(
      within(observationButton).getByText("Plan support response"),
    ).toHaveClass("font-normal");
    await expect(
      canvas.getByText(/Hi, I just noticed order #LF-20481/),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("I'll check whether the order can still be updated."),
    ).toBeInTheDocument();
    const generation = canvasElement.querySelector(
      '[data-session-observation-id="generation-1"]',
    );
    await expect(generation).not.toBeNull();
    await expect(
      within(generation as HTMLElement).queryByRole("button", {
        name: "get_order",
      }),
    ).not.toBeInTheDocument();
    await expect(
      within(
        generation?.closest("[data-session-observation-depth]") as HTMLElement,
      ).queryByRole("button", { name: "Show 1 tool" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "get_order" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Get order" }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "update_shipping_address" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Update shipping address" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Expand Get order" }),
    ).toBeInTheDocument();
    expect(
      canvas.getByRole("button", { name: "Reasoning" }).closest("article"),
    ).toBeNull();
  },
});

export const TruncatedObservation = meta.story({
  name: "(Test) Renders Truncated Observation",
  args: {
    ...loadedArgs,
    traces: [
      {
        trace,
        turnNumber: 1,
        observations: [
          {
            ...observations[0]!,
            input: "First 4,000 characters of the input…",
            output: "First 4,000 characters of the output…",
            inputTruncated: true,
            outputTruncated: true,
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas
        .getByText("First 4,000 characters of the input…")
        .closest("article")?.parentElement,
    ).toHaveClass("justify-end");
    await expect(
      canvas
        .getByText("First 4,000 characters of the output…")
        .closest("article")?.parentElement,
    ).toHaveClass("justify-start");
    await expect(
      canvas.getByRole("img", { name: "Content truncated" }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByText(
        "This observation is too large to parse in the session timeline.",
      ),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Open in trace view" }),
    ).not.toBeInTheDocument();
    await expect(canvasElement.querySelector("pre")).toBeNull();
  },
});

export const UseObservationFilters = meta.story({
  name: "(Test) Uses Observation Filters",
  args: {
    ...loadedArgs,
    observationActions: {
      onFilterByName: fn(),
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const actionsButton = canvas.getByRole("button", {
      name: "Actions for Plan support response",
    });

    await userEvent.click(actionsButton);
    await expect(
      page.getByRole("menuitem", {
        name: "Only show observations with the same name",
      }),
    ).toBeInTheDocument();
    await expect(
      page.getByRole("menuitem", {
        name: "Exclude observations with the same name",
      }),
    ).toBeInTheDocument();
    await expect(
      page.queryByRole("menuitem", { name: "Annotate" }),
    ).not.toBeInTheDocument();
    await expect(
      page.queryByRole("menuitem", { name: "Add comment" }),
    ).not.toBeInTheDocument();
    await expect(
      page.queryByRole("menuitem", { name: "Add to dataset" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      page.getByRole("menuitem", {
        name: "Only show observations with the same name",
      }),
    );
    await expect(args.observationActions?.onFilterByName).toHaveBeenCalledWith(
      "Plan support response",
      "any of",
    );
    await waitFor(() =>
      expect(
        canvasElement.ownerDocument.getElementById("__next"),
      ).not.toHaveAttribute("aria-hidden", "true"),
    );
  },
});

export const MetadataOmitted = meta.story({
  name: "(Test) Renders Omitted Metadata",
  args: {
    ...loadedArgs,
    traces: [
      {
        trace,
        turnNumber: 1,
        observations: [{ ...observations[0]!, metadataTruncated: true }],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("img", {
        name: "Metadata omitted because it is too large",
      }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByText(/Messages are parsed from input and output only/i),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByText(/Hi, I just noticed order #LF-20481/),
    ).toBeInTheDocument();
  },
});

export const RenderFalsyTruncatedValues = meta.story({
  name: "(Test) Renders Falsy Truncated Values",
  args: {
    ...loadedArgs,
    traces: [
      {
        trace,
        turnNumber: 1,
        observations: [
          {
            ...observations[0]!,
            input: "0",
            output: "false",
            outputTruncated: true,
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("0")).toBeInTheDocument();
    await expect(canvas.getByText("false")).toBeInTheDocument();
  },
});

export const OpenObservation = meta.story({
  name: "(Test) Opens Observation",
  args: { ...loadedArgs, onOpenObservation: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Plan support response" }),
    );
    await expect(args.onOpenObservation).toHaveBeenCalledWith(
      trace,
      "generation-1",
    );
  },
});

export const ExpandToolObservation = meta.story({
  name: "(Test) Expands Tool Observation Without Moving Header",
  args: loadedArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole("button", { name: "Get order" });
    const initialTop = header.getBoundingClientRect().top;
    const expandButton = canvas.getByRole("button", {
      name: "Expand Get order",
    });
    await expect(expandButton.previousElementSibling).toBe(header);
    await expect(canvasElement.querySelectorAll("pre")).toHaveLength(0);

    await userEvent.click(expandButton);
    await expect(header.getBoundingClientRect().top).toBe(initialTop);
    const toolPreviews = canvasElement.querySelectorAll("pre");
    await expect(toolPreviews).toHaveLength(2);
    await expect(toolPreviews[0]).toHaveTextContent('{"orderId":"LF-20481"}');
    await expect(toolPreviews[1]).toHaveTextContent('"status":"processing"');

    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse Get order" }),
    );
    await expect(header.getBoundingClientRect().top).toBe(initialTop);
    await expect(canvasElement.querySelectorAll("pre")).toHaveLength(0);
  },
});

export const ExpandRolledUpTool = meta.story({
  name: "(Test) Expands Rolled-up Tool With Rail",
  args: {
    ...loadedArgs,
    traces: [
      {
        trace: { ...trace, observationCount: 1 },
        turnNumber: 1,
        observations: [observations[0]!],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const generation = canvasElement
      .querySelector('[data-session-observation-id="generation-1"]')
      ?.closest("[data-session-observation-depth]");
    await userEvent.click(
      within(generation as HTMLElement).getByRole("button", {
        name: "Show 1 tool",
      }),
    );
    const expandButton = canvas.getByRole("button", {
      name: "Expand get_order",
    });
    const toolRow = expandButton.closest("[data-session-observation-depth]");
    const toolIcon = expandButton.previousElementSibling?.querySelector("svg");
    const unavailableActionsIcon = within(toolRow as HTMLElement).getByRole(
      "img",
      {
        name: "Actions available on parent observation",
      },
    );

    await expect(toolRow).toHaveAttribute(
      "data-session-observation-depth",
      "1",
    );
    await expect(toolRow).toHaveStyle({ paddingLeft: "24px" });
    await expect(
      toolRow?.querySelector('[data-session-observation-rail-depth="0"]'),
    ).toBeInTheDocument();
    await expect(
      toolRow?.querySelector('[data-session-observation-rail-depth="1"]'),
    ).not.toBeInTheDocument();
    await expect(toolIcon).not.toBeNull();
    await userEvent.hover(unavailableActionsIcon);
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("tooltip"),
    ).toHaveTextContent("Actions are available on the parent observation");
    await userEvent.unhover(unavailableActionsIcon);

    await userEvent.click(expandButton);

    await expect(
      toolRow?.querySelector('[data-session-observation-rail-depth="1"]'),
    ).toBeInTheDocument();
    await expect(
      toolRow?.querySelector("[data-session-observation-rail-end]"),
    ).toBeInTheDocument();
  },
});

export const MergeSystemPrompts = meta.story({
  name: "(Test) Merges System Prompts",
  args: LangfuseAssistantWorkflow.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstGeneration = canvasElement.querySelector(
      '[data-session-observation-id="error-analysis-generation-1"]',
    );
    await expect(firstGeneration).not.toBeNull();

    const observation = within(firstGeneration as HTMLElement);
    await expect(
      observation.getAllByRole("button", { name: "System prompt" }),
    ).toHaveLength(1);

    await userEvent.click(
      observation.getByRole("button", { name: "System prompt" }),
    );
    await expect(
      observation.getByText(
        "You are a demo observability analyst. Use only fictional project data.",
      ),
    ).toBeInTheDocument();
    await expect(
      observation.getByText(
        "Inspect representative failures before proposing a taxonomy or remediation.",
      ),
    ).toBeInTheDocument();
    await expect(
      observation.getByText(
        "Never expose identifiers or payloads from real users.",
      ),
    ).toBeInTheDocument();
    await expect(
      observation.queryByRole("button", { name: "skill" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "skill" })).toHaveLength(
      1,
    );
    await expect(canvas.getAllByText(inAppAgentPrompt)).toHaveLength(1);
    await expect(
      canvas.getByText(
        "Summarize the taxonomy, recommend the first fix, and suggest a durable way to track it.",
      ),
    ).toBeInTheDocument();
  },
});

export const ExpandNestedObservations = meta.story({
  name: "(Test) Expands Nested Observations",
  args: {
    ...loadedArgs,
    traces: [{ trace, turnNumber: 1, observations: nestedObservations }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Build the dashboard")).toBeInTheDocument();
    await expect(
      canvas.getByText("Finished the dashboard"),
    ).toBeInTheDocument();
    const leafObservation = canvas
      .getByText("Standalone answer")
      .closest("[data-session-observation-depth]");
    await expect(
      leafObservation?.querySelector(
        '[data-session-observation-rail-depth="0"]',
      ),
    ).toBeInTheDocument();
    await expect(
      leafObservation?.querySelector("[data-session-observation-rail-end]"),
    ).toBeInTheDocument();
    await expect(canvas.queryByText("generation-1")).not.toBeInTheDocument();
    await expect(canvas.queryByText("tool-1")).not.toBeInTheDocument();

    const rootToggle = canvas.getByRole("button", {
      name: "Show 2 generations and 5 tools",
    });
    const rootStart = rootToggle.closest("[data-session-observation-depth]");
    await expect(
      rootStart?.querySelector('[data-session-observation-rail-depth="0"]'),
    ).toHaveClass("top-[22px]");
    const closingRailEnd = canvas
      .getByText("Finished the dashboard")
      .closest("[data-session-observation-depth]")
      ?.querySelector("[data-session-observation-rail-end]");
    await expect(closingRailEnd).toBeInTheDocument();
    await expect(closingRailEnd).toHaveClass("rounded-full");
    await expect(
      rootToggle.querySelector(".lucide-chevrons-up-down"),
    ).not.toBeNull();
    const initialRootToggleTop = rootToggle.getBoundingClientRect().top;

    // Expanding a parent reveals its direct children, but nested groups remain collapsed.
    await userEvent.click(rootToggle);

    // Expanding the rail must not move the toggle the user just clicked.
    await expect(rootToggle.getBoundingClientRect().top).toBe(
      initialRootToggleTop,
    );
    await expect(canvas.getByText("generation-1")).toBeInTheDocument();
    await expect(canvas.getByText("generation-2")).toBeInTheDocument();
    await expect(canvas.queryByText("tool-1")).not.toBeInTheDocument();
    await expect(rootToggle.parentElement).toHaveClass("h-0");
    await expect(
      rootToggle.querySelector(".lucide-chevrons-down-up"),
    ).not.toBeNull();
    const nestedGeneration = canvasElement
      .querySelector('[data-session-observation-id="generation-1"]')
      ?.closest("[data-session-observation-depth]");
    await expect(nestedGeneration).toHaveAttribute(
      "data-session-observation-depth",
      "1",
    );
    await expect(nestedGeneration).toHaveStyle({ paddingLeft: "24px" });
    await expect(
      nestedGeneration?.querySelectorAll(
        "[data-session-observation-rail-depth]",
      ),
    ).toHaveLength(2);
    const nestedObservationIcon = nestedGeneration?.querySelector(
      '[data-session-observation-id="generation-1"] button svg',
    );
    await expect(nestedObservationIcon).not.toBeNull();
    const rootToggleRect = rootToggle.getBoundingClientRect();
    const nestedObservationIconRect = (
      nestedObservationIcon as SVGElement
    ).getBoundingClientRect();
    // The rail toggle stays vertically centered with the child observation icon beside it.
    await expect(rootToggleRect.top + rootToggleRect.height / 2).toBe(
      nestedObservationIconRect.top + nestedObservationIconRect.height / 2,
    );
    const nestedToggle = canvas.getByRole("button", { name: "Show 3 tools" });
    const initialNestedToggleTop = nestedToggle.getBoundingClientRect().top;

    // Nested observations expand independently from their ancestors.
    await userEvent.click(nestedToggle);

    // Expanding a nested rail must keep its toggle anchored too.
    await expect(nestedToggle.getBoundingClientRect().top).toBe(
      initialNestedToggleTop,
    );
    await expect(canvas.getByText("tool-1")).toBeInTheDocument();
    const nestedTool = canvasElement
      .querySelector('[data-session-observation-id="tool-1"]')
      ?.closest("[data-session-observation-depth]");
    await expect(nestedTool).toHaveAttribute(
      "data-session-observation-depth",
      "2",
    );
    await expect(nestedTool).toHaveStyle({ paddingLeft: "48px" });
    await expect(
      nestedTool?.querySelectorAll("[data-session-observation-rail-depth]"),
    ).toHaveLength(2);
    await expect(
      nestedTool?.querySelector('[data-session-observation-rail-depth="2"]'),
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Expand tool-1" }),
    );
    await expect(
      nestedTool?.querySelector('[data-session-observation-rail-depth="2"]'),
    ).toHaveClass("top-[22px]");
    await expect(
      nestedTool?.querySelector("[data-session-observation-rail-end]"),
    ).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse tool-1" }),
    );
    await expect(
      nestedTool?.querySelector('[data-session-observation-rail-depth="2"]'),
    ).not.toBeInTheDocument();
    await expect(
      nestedTool?.querySelector("[data-session-observation-rail-end]"),
    ).not.toBeInTheDocument();
    await expect(nestedToggle).toHaveStyle({ left: "7.5px" });
    await expect(nestedToggle).toHaveClass("top-5");

    await userEvent.click(nestedToggle);

    // Collapsing the nested rail must not move the toggle either.
    await expect(nestedToggle.getBoundingClientRect().top).toBe(
      initialNestedToggleTop,
    );
    await expect(canvas.queryByText("tool-1")).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Show 3 tools" }),
    ).toBeInTheDocument();
  },
});

export const ExpandEmptyTopLevelObservation = meta.story({
  name: "(Test) Expands Empty Top-Level Observation",
  args: {
    ...loadedArgs,
    traces: [
      {
        trace,
        turnNumber: 1,
        observations: nestedObservations.map((observation) =>
          observation.id === "opencode.turn"
            ? { ...observation, input: null, output: null }
            : observation,
        ),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("generation-1")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", {
        name: "Hide 2 generations and 5 tools",
      }),
    ).toBeInTheDocument();
  },
});

export const ToolObservationDataOnly = meta.story({
  name: "(Test) Tool Observation Data Only",
  args: toolShapeArgs({
    generationTool: null,
    nestObservationTool: true,
    observationTool: {
      callId: "call-subscription-details",
      name: "get_subscription_details",
      input: { customerId: "CUS-48291" },
      output: {
        plan: "annual_pro",
        refundable: true,
        refundWindowEndsAt: "2026-01-15",
      },
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Show 1 tool" }));
    await expect(
      canvas.getAllByRole("button", { name: "get_subscription_details" }),
    ).toHaveLength(1);
    await expect(
      canvasElement.querySelector(
        '[data-session-observation-id="tool-shape-observation"]',
      ),
    ).toBeInTheDocument();
  },
});

export const GenerationToolDataOnly = meta.story({
  name: "(Test) Generation Tool Data Only",
  args: toolShapeArgs({
    generationTool: {
      callId: "call-subscription-details",
      name: "get_subscription_details",
      input: { customerId: "CUS-48291" },
    },
    nestObservationTool: false,
    observationTool: null,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Show 1 tool" }));
    await expect(
      canvas.getAllByRole("button", { name: "get_subscription_details" }),
    ).toHaveLength(1);
    await expect(
      canvasElement.querySelector(
        '[data-session-observation-id="tool-shape-generation-tool-call-call-subscription-details"]',
      ),
    ).toBeInTheDocument();
  },
});

export const DeduplicateMatchingToolData = meta.story({
  name: "(Test) Deduplicates Matching Tool Data",
  args: toolShapeArgs({
    generationTool: {
      callId: "call-subscription-details",
      name: "get_subscription_details",
      input: { customerId: "CUS-48291" },
    },
    nestObservationTool: true,
    observationTool: {
      callId: "call-subscription-details",
      name: "get_subscription_details",
      input: { customerId: "CUS-48291" },
      output: {
        plan: "annual_pro",
        refundable: true,
        refundWindowEndsAt: "2026-01-15",
      },
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Show 1 tool" }));
    await expect(
      canvas.getAllByRole("button", { name: "get_subscription_details" }),
    ).toHaveLength(1);
    await expect(
      canvasElement.querySelector(
        '[data-session-observation-id="tool-shape-observation"]',
      ),
    ).toBeInTheDocument();
    await expect(
      canvasElement.querySelector(
        '[data-session-observation-id="tool-shape-generation-tool-call-call-subscription-details"]',
      ),
    ).not.toBeInTheDocument();
  },
});

export const KeepDifferentToolData = meta.story({
  name: "(Test) Keeps Different Tool Data",
  args: toolShapeArgs({
    generationTool: {
      callId: "call-cancellation-policy",
      name: "search_documentation",
      input: { query: "annual plan cancellation policy", limit: 3 },
    },
    nestObservationTool: true,
    observationTool: {
      callId: "call-customer-profile",
      name: "get_customer_profile",
      input: { customerId: "CUS-48291" },
      output: {
        plan: "annual_pro",
        renewalDate: "2026-06-15",
        accountStatus: "active",
      },
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Show 2 tools" }));
    await expect(
      canvas.getAllByRole("button", { name: "search_documentation" }),
    ).toHaveLength(1);
    await expect(
      canvas.getAllByRole("button", { name: "get_customer_profile" }),
    ).toHaveLength(1);
    await expect(
      canvasElement.querySelector(
        '[data-session-observation-id="tool-shape-generation-tool-call-call-cancellation-policy"]',
      ),
    ).toBeInTheDocument();
    await expect(
      canvasElement.querySelector(
        '[data-session-observation-id="tool-shape-observation"]',
      ),
    ).toBeInTheDocument();
  },
});
