import preview from "../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import { type ComponentProps } from "react";

import { SessionConversationTimeline } from "@/src/components/session/SessionConversationTimeline";

type TimelineProps = ComponentProps<typeof SessionConversationTimeline>;
type LoadedState = Extract<TimelineProps["state"], { type: "loaded" }>;
type Observation = LoadedState["observations"][number];

const trace = {
  id: "trace-order-support-8f3a2",
  name: "Resolve delivery address request",
  timestamp: new Date("2026-01-01T12:14:03.000Z"),
  environment: "production",
  userId: "customer-48291",
  observationCount: 5,
  latencyMs: 4260,
  scores: [],
} satisfies TimelineProps["trace"];

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
    metadata: { cache: "miss" },
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
      content:
        "The order is still processing, so I can update the delivery address.",
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
    metadata: { service: "order-management" },
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

const researchCodingAgentTrace = {
  id: researchTraceId,
  name: "Research recipe dashboard density setting",
  timestamp: new Date(fixtureStart),
  environment: "storybook",
  userId: "demo-user",
  observationCount: researchCodingAgentObservations.length,
  latencyMs: 87_347,
  scores: [],
} satisfies TimelineProps["trace"];

const implementationCodingAgentTrace = {
  id: implementationTraceId,
  name: "Implement recipe dashboard density setting",
  timestamp: new Date(fixtureStart + 120_000),
  environment: "storybook",
  userId: "demo-user",
  observationCount: implementationCodingAgentObservations.length,
  latencyMs: 167_662,
  scores: [],
} satisfies TimelineProps["trace"];

const loadedArgs = {
  trace,
  turnNumber: 1,
  idleGapSeconds: 10 * 60,
  state: {
    type: "loaded",
    observations,
  },
  showSystemPrompt: true,
  onOpenTrace: fn(),
  onOpenObservation: fn(),
} satisfies TimelineProps;

const meta = preview.meta({
  component: SessionConversationTimeline,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
});

export default meta;

export const Loaded = meta.story({ args: loadedArgs });

export const CodingAgentWorkflow = meta.story({
  args: {
    trace: researchCodingAgentTrace,
    turnNumber: 2,
    idleGapSeconds: 92,
    state: { type: "loaded", observations: researchCodingAgentObservations },
    showSystemPrompt: true,
    onOpenTrace: fn(),
    onOpenObservation: fn(),
  },
  render: (args) => (
    <>
      <SessionConversationTimeline {...args} />
      <SessionConversationTimeline
        trace={implementationCodingAgentTrace}
        turnNumber={3}
        idleGapSeconds={33}
        state={{
          type: "loaded",
          observations: implementationCodingAgentObservations,
        }}
        showSystemPrompt={args.showSystemPrompt}
        onOpenTrace={args.onOpenTrace}
        onOpenObservation={args.onOpenObservation}
      />
    </>
  ),
});

export const SystemPromptHidden = meta.story({
  args: { ...loadedArgs, showSystemPrompt: false },
});

export const Loading = meta.story({
  args: { ...loadedArgs, state: { type: "loading" } },
});

export const Error = meta.story({
  args: { ...loadedArgs, state: { type: "error" } },
});

export const Empty = meta.story({
  args: {
    ...loadedArgs,
    state: { type: "empty", message: "This trace has no observations." },
  },
});

export const FilteredEmpty = meta.story({
  args: {
    ...loadedArgs,
    state: {
      type: "empty",
      message: "No observation matches the “Generations” view in this trace.",
    },
  },
});

export const TruncatedObservation = meta.story({
  args: {
    ...loadedArgs,
    state: {
      type: "loaded",
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
  },
});

export const OpenObservation = meta.story({
  name: "(Test) Opens Observation",
  args: { ...loadedArgs, onOpenObservation: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /Plan support response/i }),
    );
    await expect(args.onOpenObservation).toHaveBeenCalledWith("generation-1");
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

    await userEvent.click(expandButton);
    await expect(header.getBoundingClientRect().top).toBe(initialTop);

    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse Get order" }),
    );
    await expect(header.getBoundingClientRect().top).toBe(initialTop);
  },
});
