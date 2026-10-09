import { orderObservations } from "@langfuse/shared/src/server/transcript/ordering";
import { assembleTranscript } from "@langfuse/shared/src/server/transcript/transcript";
import { type TranscriptObservation } from "@langfuse/shared/src/server/transcript/types";
import preview from "@/.storybook/preview";
import { type ComponentProps, useRef, useState } from "react";
import { expect, fn, userEvent, within, waitFor } from "storybook/test";
import { SessionConversationalView } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/SessionConversationalView";
import {
  useSessionConversationTimelineController,
  type SessionConversationTimelineScrollTarget,
} from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { type SessionConversationTimelineTrace } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { getSessionConversationEntries } from "../../fns/getSessionConversationEntries";

type TraceProps = ComponentProps<typeof SessionConversationTimelineTrace>;

type TranscriptState = Extract<TraceProps["state"], { type: "transcript" }>;
type WorkflowObservation = TranscriptObservation & {
  environment: string;
  latency: number | null;
  model: string | null;
  inputTruncated: boolean;
  outputTruncated: boolean;
  metadataTruncated: boolean;
};

type WorkflowTrace = Pick<TraceProps, "trace" | "turnNumber"> & {
  state: TranscriptState;
};

const trace = {
  id: "trace-order-support-8f3a2",
  name: "Resolve delivery address request",
  timestamp: new Date("2026-01-01T12:14:03.000Z"),
  environment: "production",
  userId: "customer-48291",
  observationCount: 5,
  latencyMs: 4260,
  scores: [],
} satisfies TraceProps["trace"];

const observations: Array<
  Pick<
    WorkflowObservation,
    | "id"
    | "name"
    | "type"
    | "startTime"
    | "input"
    | "output"
    | "metadata"
    | "latency"
    | "inputTruncated"
    | "outputTruncated"
    | "metadataTruncated"
  > & { latency: number }
> = [
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
            name: "Get order",
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
            name: "Update shipping address",
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
];

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

const fixtureToolCallIds = new Map<string, string[]>();

function fixtureToolOutput(
  output: TranscriptObservation["output"],
  toolName: string,
  toolCallId: string | undefined,
) {
  if (output === null) return null;
  const payload: unknown = (() => {
    try {
      return typeof output === "string" ? JSON.parse(output) : output;
    } catch {
      return output;
    }
  })();
  if (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    payload.type === "tool-result"
  ) {
    return JSON.stringify(payload);
  }
  return JSON.stringify({
    type: "tool-result",
    toolName,
    toolCallId: toolCallId ?? fixtureToolCallIds.get(toolName)?.shift(),
    output: payload,
  });
}

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
    endTime:
      latency === null
        ? null
        : new Date(fixtureStart + offsetMs + latency * 1_000),
    environment: "storybook",
    input,
    output:
      type === "TOOL"
        ? fixtureToolOutput(
            output,
            name,
            typeof metadata?.toolCallId === "string"
              ? metadata.toolCallId
              : undefined,
          )
        : output,
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
  } satisfies WorkflowObservation;
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
) => {
  for (const call of calls) {
    const ids = fixtureToolCallIds.get(call.name) ?? [];
    ids.push(call.id);
    fixtureToolCallIds.set(call.name, ids);
  }
  return JSON.stringify([
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
};

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
    output: assistantToolCalls(
      "I will load the frontend and Storybook guidance, index the fictional repository, and locate the dashboard entry points.",
      [
        {
          id: "call-research-tool-1",
          name: "skill",
          arguments: { name: "typescript" },
        },
        {
          id: "call-research-tool-2",
          name: "skill",
          arguments: { name: "storybook" },
        },
        {
          id: "call-research-tool-3",
          name: "skill",
          arguments: { name: "frontend-guidelines" },
        },
        {
          id: "call-research-tool-4",
          name: "grepika_add_workspace",
          arguments: { path: "~/demo/recipe-planner" },
        },
        {
          id: "call-research-tool-5",
          name: "tilth_tilth_search",
          arguments: { query: "RecipeDashboard" },
        },
        {
          id: "call-research-tool-6",
          name: "tilth_tilth_files",
          arguments: { patterns: ["src/features/recipes/**/*"] },
        },
      ],
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
        ...previousAction.tools.map((tool, toolIndex) => ({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: `error-analysis-call-${previousActionIndex + 1}-${toolIndex + 1}`,
              toolName: tool.name,
              output: tool.output,
            },
          ],
        })),
      ]);
    const runtimeContextOffsetMs = (() => {
      if (actionIndex < 6) {
        return inAppAgentActions[0]!.offsetMs;
      }
      if (actionIndex < 13) {
        return inAppAgentActions[6]!.offsetMs;
      }
      if (actionIndex < 18) {
        return inAppAgentActions[13]!.offsetMs;
      }
      return inAppAgentActions[18]!.offsetMs;
    })();
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
    const generationOutput = (() => {
      if (actionIndex === inAppAgentActions.length - 1) {
        return JSON.stringify({
          role: "assistant",
          content: [
            {
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
          ],
        });
      }
      if (action.tools.length > 0) {
        return JSON.stringify({
          tool_calls: action.tools.map((tool, toolIndex) => ({
            args: tool.input,
            toolCallId: `error-analysis-call-${actionIndex + 1}-${toolIndex + 1}`,
            toolName: tool.name,
          })),
        });
      }
      return JSON.stringify({ text: action.summary });
    })();

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
} satisfies TraceProps["trace"];

const researchCodingAgentTrace = {
  id: researchTraceId,
  name: "Research recipe dashboard density setting",
  timestamp: new Date(fixtureStart),
  environment: "storybook",
  userId: "demo-user",
  observationCount: researchCodingAgentObservations.length,
  latencyMs: 87_347,
  scores: [],
} satisfies TraceProps["trace"];

const implementationCodingAgentTrace = {
  id: implementationTraceId,
  name: "Implement recipe dashboard density setting",
  timestamp: new Date(fixtureStart + 120_000),
  environment: "storybook",
  userId: "demo-user",
  observationCount: implementationCodingAgentObservations.length,
  latencyMs: 167_662,
  scores: [],
} satisfies TraceProps["trace"];

type WorkflowFixture = Pick<TraceProps, "trace" | "turnNumber"> & {
  observations: Array<TranscriptObservation & { environment: string }>;
};

const supportAgentWorkflow: WorkflowFixture[] = [
  {
    trace,
    turnNumber: 1,
    observations: observations.map((observation) => ({
      ...observation,
      output:
        observation.type === "TOOL"
          ? fixtureToolOutput(
              observation.output,
              observation.name ?? "",
              typeof observation.metadata?.toolCallId === "string"
                ? observation.metadata.toolCallId
                : undefined,
            )
          : observation.output,
      traceId: trace.id,
      parentObservationId: null,
      endTime: new Date(
        observation.startTime.getTime() + observation.latency * 1_000,
      ),
      environment: trace.environment,
    })),
  },
];
const codingAgentWorkflow: WorkflowFixture[] = [
  {
    trace: researchCodingAgentTrace,
    turnNumber: 1,
    observations: researchCodingAgentObservations,
  },
  {
    trace: implementationCodingAgentTrace,
    turnNumber: 2,
    observations: implementationCodingAgentObservations,
  },
];
for (const workflow of codingAgentWorkflow) {
  const history: Array<{ role: string; [key: string]: unknown }> = [];
  for (const observation of workflow.observations) {
    if (observation.type !== "GENERATION") continue;
    const input = (observation.input as string).startsWith("[")
      ? (JSON.parse(observation.input as string) as typeof history)
      : [{ role: "user", content: observation.input }];
    history.push(
      ...(history.length === 0
        ? input
        : input.filter(
            (message) => message.role === "tool" || message.role === "user",
          )),
    );
    observation.input = JSON.stringify(history);
    history.push(
      ...(JSON.parse(observation.output as string) as typeof history),
    );
  }
}
const langfuseAssistantWorkflow: WorkflowFixture[] = [
  {
    trace: inAppAgentTrace,
    turnNumber: 4,
    observations: inAppAgentObservations,
  },
];

const manySimpleTurnsWorkflow: WorkflowFixture[] = Array.from(
  { length: 100 },
  (_, index) => {
    const turnNumber = index + 1;
    const traceId = `simple-turn-${turnNumber}`;
    const startTime = new Date(
      fixtureStart + index * 1_000 + Math.floor(index / 10) * 10 * 60 * 1_000,
    );
    return {
      trace: {
        id: traceId,
        name: `Turn ${turnNumber}`,
        timestamp: startTime,
        environment: "storybook",
        userId: null,
        observationCount: 1,
        latencyMs: 100,
        scores: [],
      },
      turnNumber,
      observations: [
        {
          id: `generation-${turnNumber}`,
          traceId,
          parentObservationId: null,
          type: "GENERATION",
          name: `Reply ${turnNumber}`,
          startTime,
          endTime: new Date(startTime.getTime() + 100),
          environment: "storybook",
          input: JSON.stringify([
            { role: "user", content: `Question ${turnNumber}` },
          ]),
          output: JSON.stringify([
            { role: "assistant", content: `Answer ${turnNumber}` },
          ]),
          metadata: {},
        },
      ],
    };
  },
);

const workflowTranscripts = new Map(
  [
    supportAgentWorkflow,
    codingAgentWorkflow,
    langfuseAssistantWorkflow,
    manySimpleTurnsWorkflow,
  ].map((workflow) => [
    workflow,
    workflow.map(
      (item): WorkflowTrace => ({
        trace: item.trace,
        turnNumber: item.turnNumber,
        state: {
          type: "transcript",
          result: {
            state: "loaded",
            cutoff: false,
            transcript: assembleTranscript(
              orderObservations(item.observations),
            ),
          },
        },
      }),
    ),
  ]),
);

const traces: TraceProps[] = [
  {
    trace: {
      id: "trace-1",
      name: "First turn",
      timestamp: new Date("2026-09-24T12:00:00Z"),
      environment: "default",
      userId: null,
      observationCount: 0,
      latencyMs: 1000,
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
                nestingLevel: 0,
                observations: [],
                messages: [
                  {
                    observationId: "generation-1",
                    traceId: "trace-1",
                    startTime: new Date("2026-09-24T12:00:00Z"),
                    endTime: null,
                    role: "user",
                    source: "input",
                    parts: [{ type: "text", text: "Can you check my order?" }],
                  },
                  {
                    observationId: "generation-1",
                    traceId: "trace-1",
                    startTime: new Date("2026-09-24T12:00:00Z"),
                    endTime: null,
                    role: "assistant",
                    source: "output",
                    parts: [{ type: "text", text: "I'll look it up." }],
                  },
                ],
              },
            },
          ],
        },
      },
    },
    onOpenTrace: () => {},
    onOpenObservation: () => {},
    scrollTarget: null,
  },
  {
    trace: {
      id: "trace-2",
      name: "Next turn",
      timestamp: new Date("2026-09-24T12:01:00Z"),
      environment: "default",
      userId: null,
      observationCount: 1,
      latencyMs: null,
      scores: [],
    },
    turnNumber: 2,
    state: { type: "loading" },
    onOpenTrace: () => {},
    onOpenObservation: () => {},
    scrollTarget: null,
  },
];

function SessionConversationalViewStory({
  workflowTraces,
  transcriptTraces,
  isLoading = false,
  isSearchPending = false,
  groupedTools = false,
  searchQueryOverride,
  viewportHeight,
  viewportWidth,
  pageOffset = 0,
  delayedLoad = false,
}: {
  workflowTraces?: WorkflowFixture[];
  transcriptTraces?: TraceProps[];
  isLoading?: boolean;
  isSearchPending?: boolean;
  groupedTools?: boolean;
  searchQueryOverride?: string;
  viewportHeight?: number;
  viewportWidth?: number;
  pageOffset?: number;
  delayedLoad?: boolean;
}) {
  const [transcriptsLoaded, setTranscriptsLoaded] = useState(!delayedLoad);
  const [search, setSearch] = useState("");
  const [collapsedTraceIds, setCollapsedTraceIds] = useState<Set<string>>(
    new Set(),
  );
  const [scrollTarget, setScrollTarget] =
    useState<SessionConversationTimelineScrollTarget | null>(null);
  const requestId = useRef(0);
  const toolTraces: TraceProps[] = [
    {
      ...traces[0]!,
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
                  nestingLevel: 0,
                  observations: [],
                  messages: [
                    Array.from({ length: 5 }, () => "tool_1"),
                    ["tool_a", "tool_b"],
                    Array.from(
                      { length: 7 },
                      (_, index) => `very_long_tool_name_${index}`,
                    ),
                  ].flatMap((names, batchIndex) => {
                    const provenance = {
                      observationId: `batch-${batchIndex}`,
                      traceId: traces[0]!.trace.id,
                      startTime: traces[0]!.trace.timestamp,
                      endTime: null,
                      role: "assistant" as const,
                      source: "output" as const,
                    };
                    return [
                      {
                        ...provenance,
                        parts: [
                          {
                            type: "text" as const,
                            text: `Tool batch ${batchIndex + 1}`,
                          },
                        ],
                      },
                      {
                        ...provenance,
                        parts: names.map((toolName, toolIndex) => ({
                          type: "tool-call" as const,
                          toolName,
                          toolCallId: `${batchIndex}-${toolIndex}`,
                          input: { toolIndex },
                        })),
                      },
                    ];
                  }),
                },
              },
            ],
          },
        },
      },
    },
  ];
  const workflowTraceProps = workflowTraces
    ? (workflowTranscripts.get(workflowTraces) ?? []).map((item) => ({
        ...item,
        onOpenTrace: fn(),
        onOpenObservation: fn(),
        scrollTarget: null,
      }))
    : (transcriptTraces ?? traces);
  const loadedTraces = groupedTools ? toolTraces : workflowTraceProps;
  const displayedTraces: TraceProps[] = transcriptsLoaded
    ? loadedTraces
    : loadedTraces.map((item) => ({ ...item, state: { type: "loading" } }));
  const entries = getSessionConversationEntries(
    displayedTraces.map((item) => ({
      trace: item.trace,
      transcript:
        item.state.type === "transcript"
          ? item.state.result.transcript
          : undefined,
    })),
  );
  const controller = useSessionConversationTimelineController(
    entries.map((entry) => ({
      trace: displayedTraces[entry.traceIndex]!.trace,
      itemId: entry.itemId,
    })),
  );
  if (isLoading) {
    return (
      <div className="@container/session-workspace flex h-screen min-w-[320px]">
        <SessionConversationalView
          state="loading"
          traces={displayedTraces.map((item) => ({
            ...item,
            state: { type: "loading" },
          }))}
          controller={controller}
        />
      </div>
    );
  }
  return (
    <div
      className="@container/session-workspace relative flex h-screen min-w-[320px]"
      style={{
        height:
          viewportHeight === undefined
            ? undefined
            : viewportHeight + pageOffset,
        paddingTop: pageOffset,
        width: viewportWidth,
      }}
    >
      {delayedLoad && !transcriptsLoaded && (
        <button
          type="button"
          className="absolute top-0 left-0"
          onClick={() => setTranscriptsLoaded(true)}
        >
          Load messages
        </button>
      )}
      <SessionConversationalView
        state="loaded"
        search={search}
        searchQuery={searchQueryOverride ?? search.trim()}
        isSearchPending={
          isSearchPending ||
          (searchQueryOverride !== undefined &&
            search.trim() !== searchQueryOverride)
        }
        onSearchChange={setSearch}
        expandedTraceIds={
          new Set(
            entries
              .filter((item) => !collapsedTraceIds.has(item.itemId))
              .map((item) => item.itemId),
          )
        }
        onToggleTraceExpanded={(traceId) =>
          setCollapsedTraceIds((current) => {
            const next = new Set(current);
            if (next.has(traceId)) next.delete(traceId);
            else next.add(traceId);
            return next;
          })
        }
        onSelect={(index, observationId, rowId) => {
          const entry = entries[index];
          const traceId = entry
            ? displayedTraces[entry.traceIndex]?.trace.id
            : undefined;
          if (traceId && observationId) {
            setScrollTarget({
              itemId: entry?.itemId,
              traceId,
              observationId,
              rowId,
              requestId: ++requestId.current,
            });
          }
          controller.onSelect(index, observationId, rowId);
        }}
        onVisibleTraceIdsChange={fn()}
        isLoadingTranscripts={isSearchPending}
        transcriptLoadError={false}
        traces={displayedTraces.map((item) => ({
          ...item,
          scrollTarget,
        }))}
        controller={controller}
      />
    </div>
  );
}

const navigationTraces: TraceProps[] = Array.from(
  { length: 32 },
  (_, index) => {
    const traceId = `scroll-turn-${index + 1}`;
    return {
      ...traces[0]!,
      trace: {
        ...traces[0]!.trace,
        id: traceId,
        name: `Navigation turn ${index + 1}`,
      },
      turnNumber: index + 1,
      state: {
        type: "transcript",
        observations: [],
        result: {
          state: "loaded",
          cutoff: false,
          transcript: {
            threads: [0, 1, 2].map((threadIndex) => {
              const provenance = {
                observationId: "shared-generation",
                traceId,
                startTime: traces[0]!.trace.timestamp,
                endTime: null,
                source: "output" as const,
              };
              return {
                conversationHistory: [],
                currentTurn: {
                  nestingLevel: threadIndex === 1 ? 1 : 0,
                  observations: [],
                  messages: [
                    ...(["system", "user", "assistant"] as const).map(
                      (role) => ({
                        ...provenance,
                        role,
                        parts: [
                          {
                            type: "text" as const,
                            text: `Turn ${index + 1} thread ${threadIndex + 1} ${role}. ${
                              role === "assistant" && index % 4 === 0
                                ? "Variable height transcript content.\n\n".repeat(
                                    25,
                                  )
                                : "Navigation content."
                            }`,
                          },
                        ],
                      }),
                    ),
                    {
                      ...provenance,
                      role: "assistant" as const,
                      parts: ["lookup", "save"].map((toolName) => ({
                        type: "tool-call" as const,
                        toolName,
                        toolCallId: `${traceId}-${threadIndex}-${toolName}`,
                        input: { toolName },
                      })),
                    },
                  ],
                },
              };
            }),
          },
        },
      },
    };
  },
);

function viewportAnchor(feed: HTMLElement) {
  const maxOffset = Math.max(0, feed.scrollHeight - feed.clientHeight);
  const transition = Math.min(feed.clientHeight * 0.2, maxOffset);
  const inset = Math.max(
    0,
    Math.min(
      feed.clientHeight * 0.2,
      feed.clientHeight - 1,
      feed.scrollHeight - 1,
    ),
  );
  if (transition === 0) return inset;
  const progress = Math.max(0, 1 - (maxOffset - feed.scrollTop) / transition);
  return inset + (feed.clientHeight - 1 - inset) * progress;
}

async function expectNavigation(
  canvasElement: HTMLElement,
  headerName: string | RegExp,
  itemId: string,
  rowId: string | false,
) {
  const canvas = within(canvasElement);
  const sidebar = within(canvas.getByRole("complementary"));
  const feed = canvas.getByLabelText("Session conversation timeline");
  await expect(
    sidebar.getByRole("button", { name: headerName }),
  ).toHaveAttribute("aria-current", "true");
  const assertGeometry = () => {
    const entry = feed.querySelector<HTMLElement>(
      `[data-session-item-id="${itemId}"]`,
    );
    const target = rowId
      ? entry?.querySelector<HTMLElement>(
          `[data-session-transcript-row-id="${rowId}"]`,
        )
      : entry?.closest<HTMLElement>("[data-index]");
    if (!target) throw new Error(`Target ${itemId} is not mounted`);
    const position =
      target.getBoundingClientRect().top -
      feed.getBoundingClientRect().top -
      feed.clientTop;
    const anchor = viewportAnchor(feed);
    const inset = feed.clientHeight * 0.2;
    const roundingTolerance =
      anchor === inset
        ? 2
        : 2 +
          (feed.clientHeight - 1 - inset) /
            Math.min(
              feed.clientHeight * 0.2,
              feed.scrollHeight - feed.clientHeight,
            );
    // The first entry cannot acquire an inset by scrolling before offset zero.
    const expectedAnchor =
      feed.scrollTop === 0 && position >= 0 && position < inset
        ? position
        : anchor;
    expect(Math.abs(position - expectedAnchor)).toBeLessThanOrEqual(
      roundingTolerance,
    );
  };
  await waitFor(assertGeometry, { timeout: 6_000 });
  await new Promise((resolve) => window.setTimeout(resolve, 200));
  assertGeometry();
  // A zero-distance user intent removes any navigation override: geometry must
  // independently yield the same active entry through the manual scroll spy.
  feed.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
  await waitFor(() =>
    expect(sidebar.getByRole("button", { name: headerName })).toHaveAttribute(
      "aria-current",
      "true",
    ),
  );
}

const meta = preview.meta({
  component: SessionConversationalViewStory,
  parameters: { layout: "fullscreen" },
});
export default meta;

export const ReasoningOnlyAndEmptySidebarStates = meta.story({
  name: "(Test) Reasoning-Only And Empty Sidebar States",
  args: {
    transcriptTraces: [
      {
        ...traces[0]!,
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
                    nestingLevel: 0,
                    observations: [],
                    messages: [
                      {
                        observationId: "reasoning-only",
                        traceId: "trace-1",
                        startTime: new Date("2026-09-24T12:00:00Z"),
                        endTime: null,
                        role: "assistant",
                        source: "output",
                        parts: [
                          {
                            type: "reasoning",
                            content: {
                              kind: "text",
                              text: "Only reasoning in this trace",
                            },
                          },
                          {
                            type: "reasoning",
                            content: {
                              kind: "encrypted",
                              data: "encrypted-payload",
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
      {
        ...traces[1]!,
        state: { type: "empty" },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    const timeline = within(
      canvas.getByLabelText("Session conversation timeline"),
    );
    await expect(await sidebar.findByText("Reasoning only")).toBeVisible();
    await expect(sidebar.getAllByText("No messages or tools")).toHaveLength(1);
    await expect(
      sidebar.queryByRole("button", { name: "Assistant message" }),
    ).not.toBeInTheDocument();
    await expect(timeline.getByText("Encrypted reasoning")).toBeInTheDocument();
    await userEvent.click(timeline.getByRole("button", { name: "Reasoning" }));
    await expect(
      timeline.getByText("Only reasoning in this trace"),
    ).toBeVisible();
    await userEvent.type(
      sidebar.getByRole("textbox", { name: "Search session" }),
      "missing-message",
    );
    await waitFor(() =>
      expect(sidebar.queryByText("Reasoning only")).not.toBeInTheDocument(),
    );
  },
});

export const OmitReasoningOnlySidebarMessages = meta.story({
  name: "(Test) Omit Reasoning-Only Sidebar Messages",
  args: {
    transcriptTraces: [
      {
        ...traces[0]!,
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
                    nestingLevel: 0,
                    observations: [],
                    messages: [
                      {
                        observationId: "reasoning-only",
                        traceId: "trace-1",
                        startTime: new Date("2026-09-24T12:00:00Z"),
                        endTime: null,
                        role: "assistant",
                        source: "output",
                        parts: [
                          {
                            type: "reasoning",
                            content: {
                              kind: "text",
                              text: "Reasoning without an answer",
                            },
                          },
                        ],
                      },
                      {
                        observationId: "encrypted-reasoning-only",
                        traceId: "trace-1",
                        startTime: new Date("2026-09-24T12:00:01Z"),
                        endTime: null,
                        role: "assistant",
                        source: "output",
                        parts: [
                          {
                            type: "reasoning",
                            content: {
                              kind: "encrypted",
                              data: "encrypted-payload",
                            },
                          },
                        ],
                      },
                      {
                        observationId: "reasoning-with-answer",
                        traceId: "trace-1",
                        startTime: new Date("2026-09-24T12:00:02Z"),
                        endTime: null,
                        role: "assistant",
                        source: "output",
                        parts: [
                          {
                            type: "reasoning",
                            content: {
                              kind: "text",
                              text: "Reasoning with an answer",
                            },
                          },
                          { type: "text", text: "The visible answer" },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    const timeline = within(
      canvas.getByLabelText("Session conversation timeline"),
    );
    await sidebar.findByRole("button", { name: "Assistant message" });
    await expect(
      sidebar.getAllByRole("button", { name: "Assistant message" }),
    ).toHaveLength(1);
    await expect(timeline.getByText("Encrypted reasoning")).toBeInTheDocument();
    const reasoningButtons = timeline.getAllByRole("button", {
      name: "Reasoning",
    });
    await expect(reasoningButtons).toHaveLength(2);
    await userEvent.click(reasoningButtons[0]!);
    await expect(
      timeline.getByText("Reasoning without an answer"),
    ).toBeVisible();
    await userEvent.click(reasoningButtons[1]!);
    await expect(timeline.getByText("Reasoning with an answer")).toBeVisible();
    await expect(timeline.getByText("The visible answer")).toBeVisible();
  },
});

export const ManualScrollSynchronization = meta.story({
  name: "(Test) Manual Scroll Synchronization",
  args: {
    transcriptTraces: navigationTraces,
    viewportHeight: 480,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const feed = canvas.getByLabelText("Session conversation timeline");
    const sidebar = within(canvas.getByRole("complementary"));
    const initialPageScroll = window.scrollY;
    const assertVisibleActive = async () => {
      await waitFor(
        () => {
          const anchor =
            feed.getBoundingClientRect().top +
            feed.clientTop +
            viewportAnchor(feed);
          const entry = Array.from(
            feed.querySelectorAll<HTMLElement>("[data-session-item-id]"),
          ).find((element) => {
            const rect = element
              .closest<HTMLElement>("[data-index]")!
              .getBoundingClientRect();
            return rect.top <= anchor && rect.bottom > anchor;
          });
          if (!entry)
            throw new Error("No entry contains the scroll-spy anchor");
          const [traceId, threadIndex] =
            entry.dataset.sessionItemId!.split(":");
          const turn = Number(traceId!.replace("scroll-turn-", ""));
          const thread = threadIndex === "0" ? 1 : 2;
          expect(
            sidebar.getByRole("button", {
              name: (name) =>
                name.startsWith(`${turn}.${thread} Navigation turn ${turn}`),
            }),
          ).toHaveAttribute("aria-current", "true");
        },
        { timeout: 3_000 },
      );
    };
    await assertVisibleActive();
    for (const top of [180, 450, 900, 1_500, 900, 450, 180, 0]) {
      feed.scrollTo({ top, behavior: "instant" });
      await assertVisibleActive();
    }
    const secondEntry = feed
      .querySelector<HTMLElement>('[data-session-item-id="scroll-turn-1:2"]')!
      .closest<HTMLElement>("[data-index]")!;
    const boundary =
      secondEntry.getBoundingClientRect().top -
      feed.getBoundingClientRect().top +
      feed.scrollTop;
    for (const top of [
      boundary - feed.clientHeight * 0.2 - 2,
      boundary - feed.clientHeight * 0.2 + 2,
      boundary - feed.clientHeight * 0.2 - 2,
      0,
    ]) {
      feed.scrollTo({ top, behavior: "instant" });
      await assertVisibleActive();
    }
    feed.scrollTo({ top: feed.scrollHeight, behavior: "instant" });
    await waitFor(
      () =>
        expect(
          sidebar.getByRole("button", { name: /^32\.2 Navigation turn 32/ }),
        ).toHaveAttribute("aria-current", "true"),
      { timeout: 3_000 },
    );
    feed.scrollTo({ top: 0, behavior: "instant" });
    await assertVisibleActive();
    await expect(window.scrollY).toBe(initialPageScroll);
  },
});

export const ExactMessageNavigation = meta.story({
  name: "(Test) Exact Message And Group Navigation",
  args: {
    transcriptTraces: navigationTraces,
    viewportHeight: 480,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    const search = sidebar.getByRole("textbox");
    await userEvent.type(search, "Turn 1 thread 3");
    const header = /^1\.2 Navigation turn 1/;
    for (const [name, rowId] of [
      ["System message", "2:0"],
      ["User message", "2:1"],
      ["Assistant message", "2:2"],
    ] as const) {
      await userEvent.click(sidebar.getByRole("button", { name }));
      await expectNavigation(canvasElement, header, "scroll-turn-1:2", rowId);
    }
    await userEvent.clear(search);
    await userEvent.type(search, "Turn 2 thread 1");
    const collapse = sidebar.getByRole("button", { name: "Collapse turn" });
    await userEvent.click(collapse);
    await expect(
      sidebar.queryByRole("button", { name: "User message" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      sidebar.getByRole("button", { name: /^2\.1 Navigation turn 2/ }),
    );
    await expectNavigation(
      canvasElement,
      /^2\.1 Navigation turn 2/,
      "scroll-turn-2:0",
      false,
    );
    await userEvent.click(sidebar.getByRole("button", { name: "Expand turn" }));
    await expect(
      sidebar.getByRole("button", { name: "User message" }),
    ).toBeInTheDocument();
    await userEvent.clear(search);
    const headerButton = sidebar.getByRole("button", {
      name: /^2\.1 Navigation turn 2/,
    });
    const card = within(headerButton.parentElement!.parentElement!);
    await userEvent.click(
      card.getByRole("button", { name: "Tool: lookup · save" }),
    );
    await expectNavigation(
      canvasElement,
      /^2\.1 Navigation turn 2/,
      "scroll-turn-2:0",
      "0:3",
    );
    const entry = canvas
      .getByLabelText("Session conversation timeline")
      .querySelector<HTMLElement>('[data-session-item-id="scroll-turn-2:0"]')!;
    await expect(
      within(entry).queryByRole("button", {
        name: /^(Show|Hide) tools: lookup · save$/,
      }),
    ).not.toBeInTheDocument();
    await expect(
      within(entry).getByRole("button", { name: "Expand lookup" }),
    ).toBeVisible();
    await expect(
      within(entry).getByRole("button", { name: "Expand save" }),
    ).toBeVisible();
  },
});

export const VirtualizedNavigation = meta.story({
  name: "(Test) Far Virtualized Navigation Both Directions",
  args: { transcriptTraces: navigationTraces, viewportHeight: 480 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    const search = sidebar.getByRole("textbox");
    const feed = canvas.getByLabelText("Session conversation timeline");
    for (const turn of [28, 3, 32, 1]) {
      const itemId = `scroll-turn-${turn}:2`;
      if (turn === 28)
        await expect(
          feed.querySelector(`[data-session-item-id="${itemId}"]`),
        ).not.toBeInTheDocument();
      await userEvent.clear(search);
      await userEvent.type(search, `Turn ${turn} thread 3`);
      const header = new RegExp(`^${turn}\\.2 Navigation turn ${turn}`);
      await userEvent.click(sidebar.getByRole("button", { name: header }));
      await expectNavigation(canvasElement, header, itemId, false);
      await userEvent.click(
        sidebar.getByRole("button", { name: "Assistant message" }),
      );
      await expectNavigation(canvasElement, header, itemId, "2:2");
    }
  },
});

export const SearchThreadNavigation = meta.story({
  name: "(Test) Filtered Thread Indices And Individual Tools",
  args: { transcriptTraces: navigationTraces, viewportHeight: 480 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    const search = sidebar.getByRole("textbox");
    await userEvent.type(search, "Turn 9 thread 3 assistant");
    await expect(
      sidebar.queryByRole("button", { name: /^9\.1/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      sidebar.getByRole("button", { name: "Assistant message" }),
    );
    await expectNavigation(
      canvasElement,
      /^9\.2 Navigation turn 9/,
      "scroll-turn-9:2",
      "2:2",
    );
    await userEvent.clear(search);
    await userEvent.type(search, "save");
    const header = await sidebar.findByRole("button", {
      name: /^9\.2 Navigation turn 9/,
    });
    const card = within(header.parentElement!.parentElement!);
    await userEvent.click(card.getByRole("button", { name: "tool: save" }));
    await expectNavigation(
      canvasElement,
      /^9\.2 Navigation turn 9/,
      "scroll-turn-9:2",
      "2:4",
    );
    await userEvent.clear(search);
    await waitFor(
      () =>
        expect(
          sidebar.getByRole("button", { name: /^9\.2 Navigation turn 9/ }),
        ).toHaveAttribute("aria-current", "true"),
      { timeout: 3_000 },
    );
  },
});

export const NavigationInterruption = meta.story({
  name: "(Test) Latest Click Wins",
  args: { transcriptTraces: navigationTraces, viewportHeight: 480 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    const search = sidebar.getByRole("textbox");
    await userEvent.type(search, "Turn 2 thread");
    await userEvent.click(
      sidebar.getByRole("button", { name: /^2\.1 Navigation turn 2/ }),
    );
    await userEvent.click(
      sidebar.getByRole("button", { name: /^2\.2 Navigation turn 2/ }),
    );
    await expectNavigation(
      canvasElement,
      /^2\.2 Navigation turn 2/,
      "scroll-turn-2:2",
      false,
    );
  },
});

export const DelayedTranscriptNavigation = meta.story({
  name: "(Test) Navigation Across Delayed Transcript Loading",
  args: {
    transcriptTraces: navigationTraces,
    viewportHeight: 480,
    pageOffset: 80,
    delayedLoad: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    await userEvent.click(
      sidebar.getByRole("button", { name: "2 Navigation turn 2" }),
    );
    await expect(
      sidebar.getByRole("button", { name: "2 Navigation turn 2" }),
    ).toHaveAttribute("aria-current", "true");
    await userEvent.click(
      canvas.getByRole("button", { name: "Load messages" }),
    );
    await expectNavigation(
      canvasElement,
      /^2\.1 Navigation turn 2/,
      "scroll-turn-2:0",
      false,
    );
  },
});

export const SidebarFollowResume = meta.story({
  name: "(Test) Sidebar Follow Resumes After User Idle",
  args: { transcriptTraces: navigationTraces, viewportHeight: 480 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const feed = canvas.getByLabelText("Session conversation timeline");
    const list = canvas.getByRole("region", { name: "Session turns" });
    const sidebar = within(canvas.getByRole("complementary"));
    list.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true }));
    await waitFor(
      () => {
        // Newly mounted rows replace estimates, moving the end of the timeline.
        feed.scrollTo({ top: feed.scrollHeight, behavior: "instant" });
        expect(
          sidebar.getByRole("button", { name: /^32\.2 Navigation turn 32/ }),
        ).toHaveAttribute("aria-current", "true");
      },
      { timeout: 3_000 },
    );
    await waitFor(
      () => {
        const active = sidebar.getByRole("button", {
          name: /^32\.2 Navigation turn 32/,
        });
        expect(active).toHaveAttribute("aria-current", "true");
        const activeRect = active.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        expect(activeRect.top).toBeGreaterThanOrEqual(listRect.top);
        expect(activeRect.bottom).toBeLessThanOrEqual(listRect.bottom);
      },
      { timeout: 3_000 },
    );
  },
});
export const NestedThreadsHidden = meta.story({
  name: "(Test) Nested Threads Hidden",
  args: {
    transcriptTraces: [
      {
        ...traces[0]!,
        state: {
          type: "transcript",
          result: {
            state: "loaded",
            cutoff: false,
            transcript: {
              threads: [
                { nestingLevel: 0, text: "Main agent checks the order." },
                { nestingLevel: 1, text: "Nested agent checks inventory." },
                { nestingLevel: 2, text: "Deeply nested agent checks stock." },
                { nestingLevel: 0, text: "Main agent confirms delivery." },
              ].map(({ nestingLevel, text }) => ({
                conversationHistory: [],
                currentTurn: {
                  nestingLevel,
                  observations: [],
                  messages: [
                    {
                      observationId: "generation-1",
                      traceId: "trace-1",
                      startTime: traces[0]!.trace.timestamp,
                      endTime: null,
                      role: "assistant",
                      source: "output",
                      parts: [{ type: "text", text }],
                    },
                  ],
                },
              })),
            },
          },
        },
      },
      { ...traces[1]!, turnNumber: 2, state: traces[0]!.state },
      {
        ...traces[1]!,
        trace: { ...traces[1]!.trace, id: "trace-3", name: "Loading turn" },
        turnNumber: 3,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    const timeline = within(
      canvas.getByLabelText("Session conversation timeline"),
    );
    await expect(
      sidebar.queryByRole("button", { name: "2 nested threads hidden" }),
    ).not.toBeInTheDocument();
    await expect(
      sidebar.queryByText("2 nested threads hidden"),
    ).not.toBeInTheDocument();
    const warnings = await timeline.findAllByRole("button", {
      name: "2 nested threads hidden",
    });
    await expect(warnings).toHaveLength(2);
    for (const surface of [timeline]) {
      for (const text of [
        "Main agent checks the order.",
        "Main agent confirms delivery.",
      ]) {
        await expect(await surface.findByText(text)).toBeInTheDocument();
      }
      for (const text of [
        "Nested agent checks inventory.",
        "Deeply nested agent checks stock.",
      ]) {
        await expect(surface.queryByText(text)).not.toBeInTheDocument();
      }
    }
    const search = sidebar.getByRole("textbox", {
      name: "Search session",
    });
    await userEvent.type(search, "confirms delivery");
    await expect(
      await sidebar.findByRole("button", { name: "Assistant message" }),
    ).toHaveTextContent("Main agent confirms delivery.");
    await expect(sidebar.queryByText("1.1")).not.toBeInTheDocument();
    await userEvent.click(
      sidebar.getByRole("button", { name: "Assistant message" }),
    );
    await waitFor(() =>
      expect(sidebar.getByRole("button", { name: /^1\.2 / })).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
    await expect(
      canvasElement.querySelector(
        '[data-session-item-id="trace-1:3"] [data-session-transcript-row-id="3:0"]',
      ),
    ).toHaveAttribute("data-scroll-request-id");
    await userEvent.clear(search);
  },
});
export const Loading = meta.story({
  name: "(Test) Loading",
  args: { isLoading: true },
  play: async ({ canvasElement }) => {
    const sidebar = within(canvasElement).getByRole("complementary");
    await expect(sidebar).toHaveAttribute("aria-busy", "true");
    await expect(
      within(sidebar).getByRole("textbox", {
        name: "Search session",
      }),
    ).toBeDisabled();
  },
});
export const SupportAgentWorkflow = meta.story({
  name: "(Test) Support Agent Workflow",
  args: { workflowTraces: supportAgentWorkflow },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    for (const name of [
      "System message",
      "User message",
      "Assistant message",
    ]) {
      await expect(
        (await sidebar.findAllByRole("button", { name })).length,
      ).toBeGreaterThan(0);
    }
    await expect(
      await sidebar.findByRole("button", { name: "tool: Get order" }),
    ).toBeInTheDocument();
    await expect(
      sidebar.getByRole("textbox", { name: "Search session" }),
    ).toBeEnabled();
    await expect(
      await within(
        canvas.getByLabelText("Session conversation timeline"),
      ).findByText(/Hi, I just noticed order #LF-20481/),
    ).toBeInTheDocument();
    await expect(
      await within(
        canvas.getByLabelText("Session conversation timeline"),
      ).findByText(/Your shipping address has been updated/),
    ).toBeInTheDocument();
    const timeline = within(
      canvas.getByLabelText("Session conversation timeline"),
    );
    for (const button of timeline.queryAllByRole("button", {
      name: /^Show tools:/,
    })) {
      await userEvent.click(button);
    }
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Get order" }),
    );
    await expect(canvas.getByText(/800 Pine Street/)).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Update shipping address" }),
    );
    await expect(canvas.getByText(/addr_7b19c2/)).toBeInTheDocument();
  },
});
export const ConsecutiveToolGroups = meta.story({
  name: "(Test) Groups Consecutive Tools",
  args: { groupedTools: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    const timeline = within(
      canvas.getByLabelText("Session conversation timeline"),
    );
    const longNames = Array.from(
      { length: 7 },
      (_, index) => `very_long_tool_name_${index}`,
    ).join(" · ");
    for (const summary of ["5x tool_1", "tool_a · tool_b", longNames]) {
      await expect(
        sidebar.getByRole("button", { name: `Tool: ${summary}` }),
      ).toBeInTheDocument();
    }
    for (const summary of ["5x tool_1", longNames]) {
      await expect(
        timeline.getByRole("button", { name: `Show tools: ${summary}` }),
      ).toHaveAttribute("aria-expanded", "false");
    }
    await userEvent.click(
      sidebar.getByRole("button", { name: "Tool: tool_a · tool_b" }),
    );
    await expect(
      timeline.queryByRole("button", { name: "Show tools: tool_a · tool_b" }),
    ).not.toBeInTheDocument();
    await expect(
      timeline.getByRole("button", { name: "Expand tool_a" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      timeline.getByRole("button", { name: "Expand tool_b" }),
    ).toBeInTheDocument();
    await userEvent.click(
      timeline.getByRole("button", { name: "Expand tool_a" }),
    );
    await expect(
      timeline.getByRole("button", { name: "Collapse tool_a" }),
    ).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(
      timeline.getByRole("button", { name: "Collapse tool_a" }),
    );
    await expect(
      timeline.getByRole("button", { name: "Expand tool_a" }),
    ).toHaveAttribute("aria-expanded", "false");
    await userEvent.type(sidebar.getByRole("textbox"), "tool_1");
    await expect(
      sidebar.getAllByRole("button", { name: "tool: tool_1" }),
    ).toHaveLength(5);
    await expect(
      sidebar.queryByRole("button", { name: "Tool: tool_a · tool_b" }),
    ).not.toBeInTheDocument();
    await expect(
      timeline.getByRole("button", { name: `Show tools: ${longNames}` }),
    ).toBeInTheDocument();
  },
});
export const CodingAgentWorkflow = meta.story({
  args: { workflowTraces: codingAgentWorkflow },
});
export const LangfuseAssistantWorkflow = meta.story({
  args: { workflowTraces: langfuseAssistantWorkflow },
});
export const CollapsedLargeMessage = meta.story({
  name: "(Test) Collapsed Large Message",
  args: {
    transcriptTraces: [
      {
        ...traces[0]!,
        trace: { ...traces[0]!.trace, name: "Large message fallback" },
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
                    nestingLevel: 0,
                    observations: [],
                    messages: [
                      {
                        observationId: "large-message",
                        traceId: "trace-1",
                        startTime: new Date("2026-09-24T12:00:00Z"),
                        endTime: null,
                        role: "user",
                        source: "input",
                        parts: [
                          {
                            type: "text",
                            text: "Show me the diagnostic output.",
                          },
                        ],
                      },
                      {
                        observationId: "large-message",
                        traceId: "trace-1",
                        startTime: new Date("2026-09-24T12:00:00Z"),
                        endTime: null,
                        role: "assistant",
                        source: "output",
                        parts: [
                          {
                            type: "text",
                            text: `${"> ".repeat(101)}Deeply nested diagnostic output\n\n${"Diagnostic line: operation completed successfully.\n".repeat(300)}Search match near the end`,
                          },
                        ],
                      },
                      {
                        observationId: "large-message-summary",
                        traceId: "trace-1",
                        startTime: new Date("2026-09-24T12:00:01Z"),
                        endTime: null,
                        role: "assistant",
                        source: "output",
                        parts: [
                          {
                            type: "text",
                            text: "Summary: all operations completed successfully.",
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const timeline = within(
      within(canvasElement).getByLabelText("Session conversation timeline"),
    );
    const content = await timeline.findByText(
      /Deeply nested diagnostic output/,
      {
        selector: "pre",
      },
    );
    const toggle = await timeline.findByRole("button", { name: "Show more" });
    const preview = canvasElement.ownerDocument.getElementById(
      toggle.getAttribute("aria-controls") ?? "",
    );
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(preview).toHaveClass("max-h-96");
    await expect(content.getBoundingClientRect().height).toBeGreaterThan(
      preview?.getBoundingClientRect().height ?? 0,
    );
    await expect(
      timeline.getByText("Summary: all operations completed successfully."),
    ).toBeVisible();
    await userEvent.click(toggle);
    await expect(
      timeline.getByRole("button", { name: "Show less" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(preview).not.toHaveClass("max-h-96");
    await userEvent.click(timeline.getByRole("button", { name: "Show less" }));
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(preview).toHaveClass("max-h-96");
    const sidebar = within(within(canvasElement).getByRole("complementary"));
    await userEvent.type(
      sidebar.getByRole("textbox"),
      "Search match near the end",
    );
    await userEvent.click(
      await sidebar.findByRole("button", { name: "Assistant message" }),
    );
    await waitFor(() => {
      expect(
        timeline.getByRole("button", { name: "Show less" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(preview).not.toHaveClass("max-h-96");
    });
    await userEvent.click(timeline.getByRole("button", { name: "Show less" }));
    await expect(preview).toHaveClass("max-h-96");
    await userEvent.click(
      sidebar.getByRole("button", { name: "Assistant message" }),
    );
    await waitFor(() => {
      expect(
        timeline.getByRole("button", { name: "Show less" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(preview).not.toHaveClass("max-h-96");
    });
  },
});
export const ManySimpleTurns = meta.story({
  args: { workflowTraces: manySimpleTurnsWorkflow },
});
export const MultipleTraces = meta.story({
  name: "(Test) Renders Multiple Traces",
  play: async ({ canvasElement }) => {
    const sidebar = within(within(canvasElement).getByRole("complementary"));
    await expect(
      await sidebar.findByRole("button", { name: "User message" }),
    ).toBeInTheDocument();
    await expect(
      await sidebar.findByRole("button", { name: "Assistant message" }),
    ).toBeInTheDocument();
    await expect(
      await sidebar.findByRole("button", { name: "1 First turn" }),
    ).toBeInTheDocument();
    await expect(
      await sidebar.findByRole("button", { name: "2 Next turn" }),
    ).toBeInTheDocument();
    const canvas = within(
      within(canvasElement).getByLabelText("Session conversation timeline"),
    );
    await expect(
      await canvas.findByText("Can you check my order?"),
    ).toBeInTheDocument();
    await expect(
      await canvas.findByText("I'll look it up."),
    ).toBeInTheDocument();
  },
});
export const SearchMatchingMessages = meta.story({
  name: "(Test) Filters Only Sidebar Messages",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    await sidebar.findByRole("button", { name: "User message" });
    const timeline = canvas.getByLabelText("Session conversation timeline");
    await within(timeline).findByText("I'll look it up.");
    await userEvent.type(sidebar.getByRole("textbox"), "ORDER");
    await expect(
      sidebar.getByRole("button", { name: "User message" }),
    ).toBeInTheDocument();
    await expect(
      sidebar.queryByRole("button", { name: "Assistant message" }),
    ).not.toBeInTheDocument();
    await expect(
      sidebar.getByRole("button", { name: "1 First turn" }),
    ).toBeInTheDocument();
    await expect(
      within(canvas.getByLabelText("Session conversation timeline")).getByText(
        "I'll look it up.",
      ),
    ).toBeInTheDocument();
    await userEvent.clear(sidebar.getByRole("textbox"));
    await userEvent.type(sidebar.getByRole("textbox"), "no-such-message");
    await waitFor(async () => {
      await expect(
        sidebar.queryByRole("button", { name: "User message" }),
      ).not.toBeInTheDocument();
      await expect(
        sidebar.queryByRole("button", { name: "Assistant message" }),
      ).not.toBeInTheDocument();
    });
    await expect(
      within(timeline).getByText("I'll look it up."),
    ).toBeInTheDocument();
    await userEvent.clear(sidebar.getByRole("textbox"));
    await expect(
      await sidebar.findByRole("button", { name: "User message" }),
    ).toBeInTheDocument();
    await expect(
      await sidebar.findByRole("button", { name: "Assistant message" }),
    ).toBeInTheDocument();
  },
});
export const ClearPendingSearch = meta.story({
  name: "(Test) Clears Highlights While Search Is Pending",
  args: { searchQueryOverride: "ORDER" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", {
      name: "Search session",
    });
    const timeline = canvas.getByLabelText("Session conversation timeline");
    await userEvent.type(input, "ORDER");
    await waitFor(async () => {
      await expect(
        Array.from(CSS.highlights.values())
          .flatMap((highlight) => Array.from(highlight))
          .filter((range) => timeline.contains(range.startContainer))
          .map((range) => range.toString()),
      ).toContain("order");
    });
    await userEvent.clear(input);
    await expect(
      Array.from(CSS.highlights.values())
        .flatMap((highlight) => Array.from(highlight))
        .filter((range) => timeline.contains(range.startContainer)),
    ).toHaveLength(0);
  },
});
export const PendingSearch = meta.story({
  name: "(Test) Clears Only Sidebar During Pending Search",
  args: { isSearchPending: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole("complementary"));
    await expect(sidebar.getByText("Loading messages...")).toBeInTheDocument();
    await expect(
      sidebar.queryByRole("button", { name: "1 First turn" }),
    ).not.toBeInTheDocument();
    await expect(
      within(canvas.getByLabelText("Session conversation timeline")).getByText(
        "Can you check my order?",
      ),
    ).toBeInTheDocument();
  },
});
