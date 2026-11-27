import "./helpers/otelReplaySetup";

import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import fc, { type Arbitrary } from "fast-check";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import {
  comparableOtelReplayRows,
  expectRawNativeParity,
  type OtelReplayResult,
  runOneOtelReplay,
  runOtelReplayComparison,
} from "./helpers/otelReplayHarness";
import { otelReplayMocks } from "./helpers/otelReplaySetup";
import {
  FILE_KEY,
  PROJECT_PREFIX,
  buildReplayCase,
  minimalSpan,
  paddedHex,
} from "./helpers/otelReplayPropertyFixtures";
import { type Json, recursiveJsonArbitrary } from "./helpers/arbitraries/json";
import {
  attributeKeysNamedIn,
  objectKeysReadBy,
} from "./helpers/sourceObjectKeys";

const providerKeys = {
  ai: [
    "ai.settings.maxSteps",
    "ai.settings.maxRetries",
    "ai.settings.mode",
    "ai.prompt.toolChoice",
    "ai.model.provider",
    "gen_ai.request.max_tokens",
    "gen_ai.response.finish_reasons",
    "gen_ai.finishReason",
    "gen_ai.system",
    "ai.prompt.messages",
    "ai.prompt",
    "ai.toolCall.args",
    "ai.toolCall.result",
    "ai.result.text",
    "ai.response.object",
    "ai.response.toolCalls",
    "ai.result.toolCalls",
    "ai.response.text",
    "ai.result.object",
    "ai.response.providerMetadata",
    "gen_ai.input.messages",
    "gen_ai.output.messages",
  ],
  "genkit-tracer": ["genkit:input", "genkit:output", "gen_ai.input.messages"],
  "@flue/opentelemetry": [
    "flue.turn.input",
    "flue.tool.arguments",
    "flue.task.prompt",
    "flue.workflow.payload",
    "flue.turn.output",
    "flue.tool.result",
    "flue.task.result",
    "flue.operation.result",
    "flue.workflow.result",
  ],
  "pydantic-ai": [
    "pydantic_ai.all_messages",
    "final_result",
    "gen_ai.system_instructions",
    "prompt",
    "all_messages_events",
  ],
  other: [
    "mlflow.spanInputs",
    "traceloop.entity.input",
    "input.value",
    "mlflow.spanOutputs",
    "traceloop.entity.output",
    "output.value",
    "input",
    "output",
    "gcp.vertex.agent.llm_request",
    "gcp.vertex.agent.llm_response",
    "gcp.vertex.agent.tool_call_args",
    "gcp.vertex.agent.tool_response",
    "lk.input_text",
    "lk.pii.input_text",
    "lk.user_transcript",
    "lk.pii.user_transcript",
    "lk.chat_ctx",
    "lk.pii.chat_ctx",
    "lk.function_tool.output",
    "lk.pii.function_tool.output",
    "lk.response.text",
    "lk.pii.response.text",
    "tool_arguments",
    "tool_response",
    "anthropic.tool_result.content",
    "gen_ai.prompt.0.content",
    "gen_ai.completion.0.content",
    "llm.input_messages.0.message.content",
    "llm.output_messages.0.message.content",
    "gen_ai.tool.call.arguments",
    "gen_ai.tool.call.result",
  ],
} as const;

const commonProviderKeys = [
  "langfuse.observation.model.parameters",
  "llm.invocation_parameters",
  "model_config",
  "gen_ai.request.temperature",
  "gen_ai.request.service_tier",
  "gen_ai.tool.name",
  "genkit:name",
  "logfire.msg",
  "ai.toolCall.name",
  "langfuse.trace.tags",
  "langfuse.tags",
  "langfuse.observation.metadata.langfuse_tags",
  "langfuse.trace.metadata.langfuse_tags",
  "ai.telemetry.metadata.tags",
  "tag.tags",
] as const;

type ProviderScope = keyof typeof providerKeys;

type ProviderReplaySeed = {
  scope: ProviderScope;
  // Replaces the scope name with one outside the generated set.
  scopeName?: string;
  spanName?: Json;
  events?: {
    name: string;
    attributes?: ProviderReplaySeed["sources"] | null;
  }[];
  sources: { key: string; value: Json }[];
  toolMetadata: {
    root: boolean;
    attributes: "none" | "object" | "stringified" | "invalidStringified";
    name: Json;
  };
};

const providerValueArbitrary = fc.oneof(
  { withCrossShrink: true },
  fc.constantFrom(
    null,
    "",
    "false",
    "0",
    "null",
    "[]",
    "{}",
    "{broken",
    "not-json",
  ),
  fc
    .record({
      role: fc.constantFrom("user", "assistant", "tool"),
      content: fc.string({ maxLength: 12, unit: "grapheme" }),
    })
    .map((message) => JSON.stringify([message])),
  fc
    .record({
      name: fc.string({ minLength: 1, maxLength: 8, unit: "grapheme" }),
      arguments: recursiveJsonArbitrary(1, 2),
    })
    .map((call) => JSON.stringify([call])),
  recursiveJsonArbitrary(1, 2).map((value) => JSON.stringify(value)),
  fc.string({ maxLength: 18, unit: "grapheme" }),
);

const providerMetadataEntryArbitrary = fc.oneof(
  fc.constantFrom(null, false, 0, ""),
  fc.record({
    serviceTier: fc.option(
      fc.constantFrom(null, "", "priority", "flex", false, 1),
      {
        nil: undefined,
      },
    ),
    usageMetadata: fc.option(
      fc.record({
        trafficType: fc.constantFrom(null, "ON_DEMAND_FLEX", "flex", 1),
      }),
      { nil: undefined },
    ),
  }),
);
const providerMetadataValueArbitrary = fc.oneof(
  fc.constant("{broken"),
  fc.constantFrom(
    JSON.stringify({ openai: { serviceTier: "priority" } }),
    JSON.stringify({ googleVertex: { serviceTier: "flex" } }),
    JSON.stringify({
      vertex: { usageMetadata: { trafficType: "ON_DEMAND_FLEX" } },
    }),
    JSON.stringify({ google: { serviceTier: "flex" } }),
  ),
  fc
    .record({
      openai: fc.option(providerMetadataEntryArbitrary, { nil: undefined }),
      googleVertex: fc.option(providerMetadataEntryArbitrary, {
        nil: undefined,
      }),
      vertex: fc.option(providerMetadataEntryArbitrary, { nil: undefined }),
      google: fc.option(providerMetadataEntryArbitrary, { nil: undefined }),
    })
    .map(JSON.stringify),
);

function providerSourceValueArbitrary(key: string): Arbitrary<Json> {
  if (key === "genkit:input" || key === "genkit:output") {
    return recursiveJsonArbitrary(2, 3).map((config) =>
      JSON.stringify(
        key === "genkit:input" ? { config } : { request: { config } },
      ),
    );
  }
  if (key === "ai.response.providerMetadata") {
    return providerMetadataValueArbitrary;
  }
  if (key === "gen_ai.request.service_tier") {
    return fc.constantFrom("request-tier", "priority", "standard");
  }
  if (key === "langfuse.observation.model.parameters") {
    return fc.constantFrom(
      JSON.stringify({ service_tier: "explicit-tier" }),
      JSON.stringify({ temperature: 0.5 }),
    );
  }
  if (
    key === "langfuse.trace.tags" ||
    key === "langfuse.tags" ||
    key.endsWith("metadata.langfuse_tags") ||
    key === "ai.telemetry.metadata.tags" ||
    key === "tag.tags"
  ) {
    return fc.constantFrom(
      "[draft], prod",
      "[broken",
      "fallback-tag",
      '["prod", "blue"]',
      "",
      "\uFEFF[draft],\uFEFFprod",
    );
  }
  if (
    key === "gen_ai.tool.name" ||
    key === "genkit:name" ||
    key === "logfire.msg" ||
    key === "ai.toolCall.name"
  ) {
    return fc.stringMatching(/^[a-z]{0,8}$/);
  }
  return providerValueArbitrary;
}

const providerReplayArbitrary: Arbitrary<ProviderReplaySeed> = fc
  .constantFrom(...(Object.keys(providerKeys) as ProviderScope[]))
  .chain((scope) =>
    fc.record({
      scope: fc.constant(scope),
      spanName: fc.oneof(
        fc.string({ maxLength: 24 }),
        recursiveJsonArbitrary(2, 3),
      ),
      events: fc.array(
        fc.record({
          name: fc.constantFrom(
            "gen_ai.content.prompt",
            "gen_ai.content.completion",
            "gen_ai.client.inference.operation.details",
            "gen_ai.system.message",
            "gen_ai.user.message",
            "gen_ai.assistant.message",
            "gen_ai.tool.message",
            "gen_ai.choice",
            "unrelated",
          ),
          attributes: fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            fc.array(
              fc.record({
                key: fc.constantFrom(
                  "content",
                  "role",
                  "gen_ai.event.content",
                  "gen_ai.input.messages",
                  "gen_ai.output.messages",
                  "gen_ai.prompt.0.content",
                  "gen_ai.completion.0.content",
                  "gen_ai.tool.call.arguments",
                  "gen_ai.tool.call.result",
                ),
                value: fc.oneof(
                  { weight: 3, arbitrary: providerValueArbitrary },
                  { weight: 1, arbitrary: recursiveJsonArbitrary(2, 3) },
                ),
              }),
              { maxLength: 4 },
            ),
          ),
        }),
        { maxLength: 6 },
      ),
      sources: fc.array(
        fc
          .constantFrom(...providerKeys[scope], ...commonProviderKeys)
          .chain((key) =>
            fc.record({
              key: fc.constant(key),
              // SDK examples bias generation; every key also receives arbitrary
              // AnyValue data and JSON text, including scalars and arrays.
              value: fc.oneof(
                { weight: 3, arbitrary: providerSourceValueArbitrary(key) },
                { weight: 1, arbitrary: recursiveJsonArbitrary(2, 3) },
                {
                  weight: 1,
                  arbitrary: recursiveJsonArbitrary(2, 3).map(JSON.stringify),
                },
              ),
            }),
          ),
        { maxLength: 8 },
      ),
      toolMetadata: fc.record({
        root: fc.boolean(),
        attributes: fc.constantFrom(
          ...(["none", "object", "stringified", "invalidStringified"] as const),
        ),
        name: fc.oneof(
          { weight: 3, arbitrary: fc.stringMatching(/^[a-z]{1,8}$/) },
          { weight: 1, arbitrary: recursiveJsonArbitrary(1, 2) },
        ),
      }),
    }),
  );

const genericUsageNames = [
  "prompt_tokens",
  "input_tokens",
  "prompt",
  "completion_tokens",
  "output_tokens",
  "completion",
  "total_tokens",
  "total",
  "cache_read.input_tokens",
  "cache_read_input_tokens",
  "cache_read_tokens",
  "details.cache_read_tokens",
  "details.cache_read_input_tokens",
  "prompt_details.cache_read",
  "input_cached_tokens",
  "cache_creation.input_tokens",
  "cache_write.input_tokens",
  "cache_creation_input_tokens",
  "cache_write_tokens",
  "details.cache_write_tokens",
  "details.cache_creation_input_tokens",
  "prompt_details.cache_write",
  "input_cache_creation",
  "cache_creation.5m_input_tokens",
  "cache_creation.1h_input_tokens",
  "reasoning.output_tokens",
  "completion_details.reasoning",
  "completion_details.audio",
] as const;
const genericUsageValueArbitrary: Arbitrary<Json> = fc.oneof(
  fc.constantFrom<Json>(null, false, true, "", " ", "0x10", "1e3"),
  fc.integer({ min: 0, max: 100 }),
  fc.array(fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 100 })), {
    maxLength: 2,
  }),
  // Keep count magnitudes within UInt64 while varying coercion and alias precedence.
  recursiveJsonArbitrary(1, 2, fc.double({ min: -1e6, max: 1e6, noNaN: true })),
);
const genericUsageReplayArbitrary: Arbitrary<ProviderReplaySeed> = fc
  .record(
    Object.fromEntries(
      ["gen_ai.usage.", "llm.token_count."].flatMap((prefix) =>
        genericUsageNames.map((name) => [
          prefix + name,
          fc.option(genericUsageValueArbitrary, { nil: undefined }),
        ]),
      ),
    ) as Record<string, Arbitrary<Json | undefined>>,
  )
  .map((values) => ({
    scope: "other" as const,
    sources: Object.entries(values).flatMap(([key, value]) =>
      value === undefined ? [] : [{ key, value }],
    ),
    toolMetadata: { root: false, attributes: "none" as const, name: "usage" },
  }));

function providerAnyValue(value: Json): Record<string, unknown> {
  if (value === null) return {};
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    return Number.isSafeInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "boolean") return { boolValue: value };
  return Array.isArray(value)
    ? { arrayValue: { values: value.map(providerAnyValue) } }
    : {
        kvlistValue: {
          values: Object.entries(value).map(([key, value]) =>
            providerAttribute(key, value),
          ),
        },
      };
}

function providerAttribute(key: string, value: Json) {
  return { key, value: providerAnyValue(value) };
}

function providerMetadataAttribute(seed: ProviderReplaySeed) {
  const { root, attributes, name } = seed.toolMetadata;
  if (!root && attributes === "none") return undefined;
  const definition = { name };
  const metadata: Record<string, unknown> = {};
  if (root) metadata.tools = [definition];
  if (attributes === "object") {
    metadata.attributes = { "ai.prompt.tools": [definition] };
  } else if (attributes !== "none") {
    metadata.attributes = JSON.stringify({
      "ai.prompt.tools":
        attributes === "stringified"
          ? [definition]
          : JSON.stringify({ name: "invalid" }),
    });
  }
  return providerAttribute(
    "langfuse.observation.metadata",
    JSON.stringify(metadata),
  );
}

function buildProviderReplay(seeds: ProviderReplaySeed[]): Buffer {
  const replay = buildReplayCase({
    traceId: paddedHex(3n, 32),
    idEncoding: "string",
    spanIdBase: BigInt(seeds.length + 8),
    baseTimeMillis: 1_700_000_000_000,
    spanSeeds: seeds.map((_, orderKey) => ({ ...minimalSpan, orderKey })),
  });
  const resource = replay.resourceSpans[0]!;
  const spans = resource.scopeSpans![0]!.spans!;
  // Omit explicit input/output fields so provider fallbacks are exercised.
  const resourceSpans = seeds.map((seed, index) => {
    const metadata = providerMetadataAttribute(seed);
    const attributes = seed.sources.map(({ key, value }) =>
      providerAttribute(key, value),
    );
    if (
      seed.sources.some(({ key }) => key === "ai.response.providerMetadata")
    ) {
      // Explicit counts isolate field extraction from the TS provider-usage
      // parser's error fallback when response metadata is malformed.
      attributes.push(
        providerAttribute("langfuse.observation.usage_details", '{"input":7}'),
      );
    }
    if (metadata) attributes.push(metadata);
    return {
      resource: resource.resource,
      scopeSpans: [
        {
          scope: { name: seed.scopeName ?? seed.scope, version: "1.0.0" },
          spans: [
            {
              ...spans[index]!,
              ...(seed.spanName === undefined ? {} : { name: seed.spanName }),
              attributes,
              events: seed.events?.map(({ name, attributes }) => ({
                name,
                attributes:
                  attributes?.map(({ key, value }) =>
                    providerAttribute(key, value),
                  ) ?? attributes,
              })),
            },
          ],
        },
      ],
    };
  });
  return Buffer.from(JSON.stringify(resourceSpans));
}

async function assertProviderReplayParity(
  seeds: ProviderReplaySeed[],
): Promise<void> {
  const comparison = await runOtelReplayComparison({
    bytes: buildProviderReplay(seeds),
    projectId: `${PROJECT_PREFIX}-provider-${seeds.length}`,
    fileKey: FILE_KEY,
    mediaUploadEnabled: true,
  });
  expectRawNativeParity(comparison);
  expect(
    [comparison.originalTs, comparison.earlyTs, comparison.earlyRust].map(
      ({ storedRows }) => storedRows.length,
    ),
  ).toEqual([seeds.length, seeds.length, seeds.length]);
}

function aiProviderSeed(
  sources: ProviderReplaySeed["sources"],
): ProviderReplaySeed {
  return {
    scope: "ai",
    sources,
    toolMetadata: { root: false, attributes: "none", name: "tool" },
  };
}

function genericProviderSeed(
  sources: ProviderReplaySeed["sources"],
): ProviderReplaySeed {
  return { ...aiProviderSeed(sources), scope: "other" };
}

// 120 levels of single-key objects around a string leaf.
const deeplyNestedObject = Array.from({ length: 120 }).reduce<Json>(
  (inner) => ({ x: inner }),
  "leaf",
);

const declaredTypeExamples = [
  ["langfuse.observation.type", "generation"],
  ["openinference.span.kind", "LLM"],
  ["gen_ai.operation.name", "chat"],
  ["genkit:metadata:subtype", "embedder"],
] as const;

const directedProviderExamples: ProviderReplaySeed[][] = [
  [
    {
      ...aiProviderSeed([
        { key: "gen_ai.tool.name", value: false },
        { key: "flue.operation.result", value: "" },
      ]),
      scope: "@flue/opentelemetry",
      spanName: null,
    },
    aiProviderSeed([]),
  ],
  declaredTypeExamples.flatMap(([key, alias]) =>
    [[alias], [[alias]], [alias, ""]].map((value) =>
      aiProviderSeed([{ key, value }]),
    ),
  ),
  ...[null, false, "", [], [1, 2]].map((primary) => [
    {
      scope: "other" as const,
      sources: [
        { key: "gen_ai.usage.prompt_tokens", value: primary },
        { key: "llm.token_count.input_tokens", value: 120 },
      ],
      toolMetadata: { root: false, attributes: "none" as const, name: "usage" },
    },
  ]),
  ...[
    ["gen_ai.content.prompt", "gen_ai.content.completion"],
    ["gen_ai.content.completion", "unrelated", "gen_ai.content.prompt"],
    ["gen_ai.content.prompt", "gen_ai.user.message", "gen_ai.choice"],
    ["gen_ai.content.prompt", "gen_ai.client.inference.operation.details"],
  ].map((names) =>
    [false, true].map((explicit) => ({
      ...aiProviderSeed(
        explicit
          ? [{ key: "langfuse.observation.input", value: "explicit" }]
          : [],
      ),
      scope: "other" as const,
      events: names.map((name, index) => ({
        name,
        attributes: [
          {
            key: name.endsWith(".details")
              ? "gen_ai.input.messages"
              : "content",
            value: `message-${index}`,
          },
        ],
      })),
    })),
  ),
  ...[undefined, null, [], [{ key: "content", value: "hello" }]].map(
    (attributes) =>
      ["gen_ai.content.prompt", "gen_ai.content.completion"].map((name) => ({
        ...aiProviderSeed([
          { key: "gen_ai.input.messages", value: "fallback" },
        ]),
        scope: "other" as const,
        // The first matching event decides the side, even when a later duplicate has attributes.
        events: [
          { name, attributes },
          { name, attributes: [{ key: "content", value: "later" }] },
        ],
      })),
  ),
  ...["gen_ai.prompt", "llm.input_messages"].map((prefix) =>
    ["_x", ".0..y", ".__proto__.x", ".10001.content"].map((suffix) => ({
      ...aiProviderSeed([
        { key: prefix + suffix, value: "ignored" },
        { key: "gen_ai.input.messages", value: "fallback" },
      ]),
      scope: "other" as const,
    })),
  ),
  ...[
    ["0.6000", "1.5000", "0.9999"],
    ["0.6000", "1.5000", "2.3996"],
    ["0.10000", "named.content"],
    ["0.18446744073709551615.role", "0.999999999999999999999.role", "0.role"],
  ].map((paths) =>
    ["gen_ai.prompt", "llm.output_messages"].map((prefix) => ({
      ...aiProviderSeed(
        paths.map((path, index) => ({
          key: `${prefix}.${path}`,
          value: `message-${index}`,
        })),
      ),
      scope: "other" as const,
    })),
  ),
  ...[true, 7, [1, "hello"]].map((value) => [
    {
      ...aiProviderSeed([
        { key: "lk.pii.instructions", value },
        { key: "lk.user_input", value },
      ]),
      scope: "other" as const,
    },
  ]),
  ...[false, 0, ""].map((value) =>
    [
      "gen_ai.prompt",
      "gen_ai.completion",
      "llm.input_messages",
      "llm.output_messages",
    ].map((key) => ({
      ...aiProviderSeed([{ key, value }]),
      scope: "other" as const,
    })),
  ),
  [
    "gen_ai.prompt.0.content",
    "gen_ai.completion.0.content",
    "llm.input_messages.0.message.content",
    "llm.output_messages.0.message.content",
  ].map((key) => ({
    ...aiProviderSeed([{ key, value: false }]),
    scope: "other" as const,
  })),
  ...[null, false, true, 0, 1, "", "text", "😀", [], [1], [1, 2], {}].flatMap(
    (value) =>
      [
        "langfuse.observation.model.parameters",
        "llm.invocation_parameters",
        "model_config",
      ].map((key) =>
        (Object.keys(providerKeys) as ProviderScope[]).flatMap((scope) =>
          [value, JSON.stringify(value)].map((input) => ({
            ...aiProviderSeed([
              { key, value: input },
              { key: "gen_ai.request.temperature", value: "0.5" },
            ]),
            scope,
          })),
        ),
      ),
  ),
  ...[null, false, 0, 7, "", ["a", null, 1], { name: "nested" }].map((value) =>
    ["gen_ai.tool.name", "genkit:name", "logfire.msg", "ai.toolCall.name"].map(
      (key) => aiProviderSeed([{ key, value }]),
    ),
  ),
  [
    aiProviderSeed([
      { key: "langfuse.observation.model.parameters", value: '"\\ud800"' },
    ]),
  ],
  [
    aiProviderSeed([
      {
        key: "ai.response.providerMetadata",
        value: JSON.stringify({ openai: { serviceTier: "\ud801" } }),
      },
    ]),
  ],
  ...[
    null,
    false,
    0,
    5e-324,
    true,
    "",
    [],
    [1],
    { name: "nested" },
    { toString: null },
    [{ toString: null }],
  ].map((name) =>
    ["none", "object", "stringified"].map((attributes) => ({
      scope: "other" as const,
      sources: [],
      toolMetadata: {
        root: true,
        attributes:
          attributes as ProviderReplaySeed["toolMetadata"]["attributes"],
        name,
      },
    })),
  ),
  [aiProviderSeed([{ key: "tag.tags", value: "" }])],
  [
    {
      scope: "ai",
      sources: [
        { key: "gen_ai.input.messages", value: "" },
        { key: "gen_ai.output.messages", value: "response" },
      ],
      toolMetadata: { root: false, attributes: "object", name: "a" },
    },
  ],
  ...[
    { google: { serviceTier: "flex" } },
    { vertex: { usageMetadata: { trafficType: "ON_DEMAND_FLEX" } } },
    { googleVertex: {}, vertex: { serviceTier: "flex" } },
    { googleVertex: false, vertex: { serviceTier: "flex" } },
  ].map((metadata) => [
    aiProviderSeed([
      { key: "ai.response.providerMetadata", value: JSON.stringify(metadata) },
      { key: "gen_ai.request.service_tier", value: "request-tier" },
    ]),
  ]),
  [
    aiProviderSeed([
      { key: "genkit:name", value: "genkit-name" },
      { key: "logfire.msg", value: "logfire-name" },
      { key: "langfuse.trace.tags", value: "[draft], prod" },
      { key: "langfuse.tags", value: "fallback-tag" },
    ]),
  ],
  [
    aiProviderSeed([
      {
        key: "ai.response.providerMetadata",
        value: JSON.stringify({
          openai: { serviceTier: null },
          googleVertex: { serviceTier: "priority" },
        }),
      },
      {
        key: "langfuse.observation.model.parameters",
        value: JSON.stringify({ service_tier: "explicit-tier" }),
      },
    ]),
  ],
  // A data URI where media is never extracted: the scope name, then an
  // attribute key.
  [{ ...genericProviderSeed([]), scopeName: "data:text/plain;base64,aGk=" }],
  [
    genericProviderSeed([
      { key: "data:text/plain;base64,aGk=", value: "attribute-value" },
    ]),
  ],
  // JSON text that ingestion parses: many copies of a deep object beside a
  // media marker, lone surrogates in keys and values, and numbers outside the
  // double range in input, metadata and usage.
  [
    genericProviderSeed([
      {
        key: "langfuse.observation.input",
        value: JSON.stringify({
          marker: "data: ",
          items: Array.from({ length: 32 }, () => deeplyNestedObject),
        }),
      },
    ]),
  ],
  [
    genericProviderSeed([
      {
        key: "langfuse.observation.input",
        value: JSON.stringify({
          text: "\ud800",
          low: "\udfff",
          pair: "\ud83d\ude00",
          literal: "\\ud800",
          "\ud800": 1,
          "\ud801": 2,
          "\ufffd": 3,
        }),
      },
    ]),
  ],
  // Tool columns clear when a call name or an output type cannot be stringified,
  // and Responses output.tools fills definitions the input did not provide.
  [
    genericProviderSeed([
      {
        key: "langfuse.observation.input",
        value: JSON.stringify({ tools: [{ name: "a" }] }),
      },
      {
        key: "langfuse.observation.output",
        value: JSON.stringify({
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "weather", arguments: {} },
            },
            { name: { toString: null }, arguments: {} },
          ],
        }),
      },
    ]),
  ],
  [
    genericProviderSeed([
      {
        key: "langfuse.observation.input",
        value: JSON.stringify({ tools: [{ name: "a" }] }),
      },
      {
        key: "langfuse.observation.output",
        value: JSON.stringify({ type: { toString: null } }),
      },
    ]),
  ],
  [
    genericProviderSeed([
      {
        key: "langfuse.observation.output",
        value: JSON.stringify({
          output: [
            {
              type: "function_call",
              call_id: "call_1",
              name: "get_weather",
              arguments: '{"city":"Berlin"}',
            },
          ],
          tools: [{ name: "get_weather", description: "forecast" }],
        }),
      },
    ]),
  ],
  [
    genericProviderSeed([
      {
        key: "langfuse.observation.input",
        value: '{"positive":1e309,"negative":-1e309,"tiny":1e-9999}',
      },
      {
        key: "langfuse.observation.metadata",
        value: '{"positive":1e309,"negative":-1e309}',
      },
      {
        key: "langfuse.observation.usage_details",
        value: '{"input":1e309,"output":-1e309}',
      },
    ]),
  ],
];

const TOOL_EXTRACTOR_SOURCE = fileURLToPath(
  new URL(
    "../../../packages/shared/src/server/ingestion/extractToolsBackend.ts",
    import.meta.url,
  ),
);

// Tool calls, tool definitions and messages in the forms SDKs send them.
const toolSweepBlocks: Record<string, Json> = {
  "flat call": { id: "c1", name: "weather", arguments: "{}" },
  "chat call": {
    id: "c2",
    type: "function",
    function: { name: "weather", arguments: "{}" },
  },
  "responses call": {
    type: "function_call",
    call_id: "c3",
    name: "weather",
    arguments: "{}",
  },
  "anthropic call": { type: "tool_use", id: "c4", name: "weather", input: {} },
  "ai sdk call": {
    type: "tool-call",
    toolCallId: "c5",
    toolName: "weather",
    args: {},
  },
  "flat definition": {
    name: "lookup",
    description: "d",
    parameters: { type: "object" },
  },
  "nested definition": {
    type: "function",
    function: { name: "lookup", parameters: {} },
  },
  "message with calls": {
    role: "assistant",
    content: "hi",
    tool_calls: [
      {
        id: "c6",
        type: "function",
        function: { name: "weather", arguments: "{}" },
      },
    ],
  },
  "message with parts": {
    role: "assistant",
    content: [{ type: "tool_use", id: "c7", name: "weather", input: {} }],
  },
};

type ToolSweepCase = { label: string; seed: ProviderReplaySeed };

/**
 * One span per way of placing a block under a key the TypeScript tool
 * extractor reads. The keys come from the extractor's source, so a container
 * it starts reading is swept without a change here. The label is the span name.
 */
function toolContainerSweep(): ToolSweepCase[] {
  const keys = objectKeysReadBy(TOOL_EXTRACTOR_SOURCE);
  const cases: ToolSweepCase[] = [];
  const add = (attribute: string, shape: string, value: Json) => {
    const label = `${attribute.split(".").at(-1)}: ${shape}`;
    cases.push({
      label,
      seed: {
        ...genericProviderSeed([
          { key: attribute, value: JSON.stringify(value) },
        ]),
        spanName: label,
      },
    });
  };
  const payloads = [
    "langfuse.observation.input",
    "langfuse.observation.output",
  ];
  for (const key of keys) {
    for (const [name, block] of Object.entries(toolSweepBlocks)) {
      for (const attribute of payloads) {
        add(attribute, `{${key}: ${name}}`, { [key]: block });
        add(attribute, `{${key}: [${name}]}`, { [key]: [block] });
        add(attribute, `[{${key}: ${name}}]`, [{ [key]: block }]);
        add(attribute, `[{${key}: [${name}]}]`, [{ [key]: [block] }]);
        add(attribute, `{${key}: "[${name}]"}`, {
          [key]: JSON.stringify([block]),
        });
        add(
          attribute,
          `"{${key}: [${name}]}"`,
          JSON.stringify({ [key]: [block] }),
        );
      }
      add("langfuse.observation.metadata", `{${key}: [${name}]}`, {
        [key]: [block],
      });
      add(
        "langfuse.observation.metadata",
        `{attributes: {${key}: [${name}]}}`,
        {
          attributes: { [key]: [block] },
        },
      );
    }
  }
  return cases;
}

/** Labels of the spans whose stored row differs between the TypeScript and Rust paths. */
async function toolSweepDifferences(cases: ToolSweepCase[]): Promise<string[]> {
  const comparison = await runOtelReplayComparison({
    bytes: buildProviderReplay(cases.map(({ seed }) => seed)),
    projectId: `${PROJECT_PREFIX}-tool-sweep`,
    fileKey: FILE_KEY,
    mediaUploadEnabled: true,
  });
  // The label lookup below would hide a duplicated or an extra row.
  expect(
    [comparison.originalTs, comparison.earlyTs, comparison.earlyRust].map(
      ({ storedRows }) => storedRows.length,
    ),
  ).toEqual([cases.length, cases.length, cases.length]);
  const rowsByLabel = (result: OtelReplayResult) =>
    new Map(
      comparableOtelReplayRows(result.storedRows).map((row) => [
        String(row.name),
        JSON.stringify(row),
      ]),
    );
  const expected = rowsByLabel(comparison.originalTs);
  const others = [comparison.earlyTs, comparison.earlyRust].map(rowsByLabel);
  return cases
    .map(({ label }) => label)
    .filter(
      (label) =>
        !expected.has(label) ||
        others.some((rows) => rows.get(label) !== expected.get(label)),
    );
}

const OTEL_SOURCE = (file: string) =>
  fileURLToPath(
    new URL(
      `../../../packages/shared/src/server/otel/${file}`,
      import.meta.url,
    ),
  );

// Attributes whose malformed values the two paths read differently. The
// generator leaves them out until the paths agree.
const attributeKeysReadDifferently = new Set([
  // JavaScript's Date and Number accept text that is not a timestamp or a duration.
  "langfuse.observation.completion_start_time",
  "langfuse.experiment.item.version",
  "ai.response.msToFirstChunk",
  "ai.stream.msToFirstChunk",
  "gen_ai.client.operation.time_to_first_chunk",
  // Token counts of the Vercel AI SDK scope that are not plain numbers.
  "gen_ai.usage.completion_tokens",
  "gen_ai.usage.input_tokens",
  "gen_ai.usage.output_tokens",
  "gen_ai.usage.prompt_tokens",
  "ai.usage.cachedInputTokens",
  "ai.usage.reasoningTokens",
  "ai.usage.tokens",
]);

// Every attribute key the TypeScript processor names, so a key it starts
// reading is generated without a change here.
const processorAttributeKeys = [
  ...new Set(
    [
      "OtelIngestionProcessor.ts",
      "ObservationTypeMapper.ts",
      "attributes.ts",
    ].flatMap((file) => attributeKeysNamedIn(OTEL_SOURCE(file))),
  ),
].filter((key) => !attributeKeysReadDifferently.has(key));

// Values that JavaScript and Rust tend to read differently: empty and padded
// text, text that is JSON or a number, numbers at type boundaries.
const attributeValueArbitrary: Arbitrary<Json> = fc.oneof(
  { withCrossShrink: true },
  fc.constantFrom<Json>(
    null,
    "",
    " ",
    "0",
    "3",
    " 3 ",
    "-1",
    "1.5",
    "65536",
    "1e3",
    "0x10",
    "true",
    "false",
    "null",
    "undefined",
    "[]",
    "{}",
    "{broken",
    "text",
    "😀",
    JSON.stringify("text"),
    JSON.stringify(JSON.stringify({ region: "eu" })),
    '{"max_tokens":9223372036854775807}',
  ),
  fc.constantFrom<Json>(0, 1, -1, 65535, 65536, 2 ** 53, 0.5, 1e21),
  fc.boolean(),
  recursiveJsonArbitrary(2, 3),
  recursiveJsonArbitrary(2, 3).map((value) => JSON.stringify(value)),
);

const processorAttributeReplayArbitrary: Arbitrary<ProviderReplaySeed> =
  fc.record({
    scope: fc.constantFrom(...(Object.keys(providerKeys) as ProviderScope[])),
    spanName: fc.option(attributeValueArbitrary, { nil: undefined }),
    sources: fc.array(
      fc.record({
        key: fc.constantFrom(...processorAttributeKeys),
        value: attributeValueArbitrary,
      }),
      { maxLength: 6 },
    ),
    toolMetadata: fc.constant({
      root: false,
      attributes: "none" as const,
      name: "tool",
    }),
  });

// Spans the two paths must read the same way: one without attributes, model
// parameters encoded three times, an integer above 2^53, and a generation
// whose prompt version is the number 1e21.
const directedEvaluationExamples: ProviderReplaySeed[][] = [
  [genericProviderSeed([])],
  ...[
    JSON.stringify(JSON.stringify(JSON.stringify({ region: "eu" }))),
    '{"max_tokens":9223372036854775807}',
  ].map((value) => [
    genericProviderSeed([
      { key: "langfuse.observation.model.parameters", value },
    ]),
  ]),
  [
    {
      ...genericProviderSeed([
        { key: "gen_ai.request.model", value: "gpt-4" },
        { key: "langfuse.observation.prompt.version", value: 1e21 },
      ]),
      scope: "ai",
    },
  ],
];

// Rust strings cannot hold a lone surrogate, and a `__proto__` key is lost
// when the Rust row crosses into JavaScript.
function withoutUnportableText(value: Json): Json {
  if (typeof value === "string") return value.toWellFormed();
  if (Array.isArray(value)) return value.map(withoutUnportableText);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "__proto__")
      .map(([key, item]) => [key.toWellFormed(), withoutUnportableText(item)]),
  );
}

/**
 * Record what a path hands evaluation for each span, without the differences
 * the Rust path is known to have. Returns a function that takes the
 * observations recorded since it was last called.
 */
function recordEvaluationObservations() {
  let recorded = new Map<string, Json>();
  otelReplayMocks.scheduleObservationEvals.mockImplementation(
    async ({ observation, loadSnapshot }) => {
      // The snapshot is uploaded as JSON, which drops undefined fields.
      const uploaded = withoutUnportableText(
        JSON.parse(JSON.stringify(loadSnapshot())),
      ) as Record<string, Json>;
      // Rust hands over a null experiment item metadata value as the empty
      // string it is stored as.
      const itemMetadata = uploaded.experiment_item_metadata;
      if (itemMetadata && typeof itemMetadata === "object") {
        uploaded.experiment_item_metadata = Object.fromEntries(
          Object.entries(itemMetadata).map(([key, item]) => [key, item ?? ""]),
        );
      }
      recorded.set(observation.span_id, uploaded);
    },
  );
  return () => {
    const taken = recorded;
    recorded = new Map();
    return taken;
  };
}

/** `span field: TypeScript value -> Rust value` for each field the two paths hand evaluation differently. */
function evaluationDifferences(
  typeScript: Map<string, Json>,
  rust: Map<string, Json>,
): string[] {
  const show = (value: unknown) => String(JSON.stringify(value)).slice(0, 160);
  return [...new Set([...typeScript.keys(), ...rust.keys()])].flatMap(
    (span) => {
      const expected = typeScript.get(span) as Record<string, Json> | undefined;
      const actual = rust.get(span) as Record<string, Json> | undefined;
      if (!expected || !actual) {
        return [
          `${span}: evaluated only by ${expected ? "TypeScript" : "Rust"}`,
        ];
      }
      return Object.keys({ ...expected, ...actual })
        .filter((field) => !isDeepStrictEqual(expected[field], actual[field]))
        .map(
          (field) =>
            `${span} ${field}: ${show(expected[field])} -> ${show(actual[field])}`,
        );
    },
  );
}

async function assertRowAndEvaluationParity(
  seeds: ProviderReplaySeed[],
): Promise<void> {
  const takeObservations = recordEvaluationObservations();
  const replay = (mode: "early-ts" | "early-rust") =>
    runOneOtelReplay({
      mode,
      bytes: buildProviderReplay(seeds),
      projectId: `${PROJECT_PREFIX}-evaluation-${seeds.length}`,
      fileKey: FILE_KEY,
      mediaUploadEnabled: true,
      captureSideEffects: takeObservations,
    });
  try {
    // Both paths extract media early, so only the implementation differs.
    // TypeScript rejects some malformed batches; those have nothing to compare.
    const typeScript = await replay("early-ts").catch(() => {
      takeObservations();
      return undefined;
    });
    fc.pre(typeScript !== undefined);
    const rust = await replay("early-rust");
    expect(comparableOtelReplayRows(rust.storedRows)).toEqual(
      comparableOtelReplayRows(typeScript!.storedRows),
    );
    expect(
      evaluationDifferences(
        typeScript!.sideEffects as Map<string, Json>,
        rust.sideEffects as Map<string, Json>,
      ),
    ).toEqual([]);
  } finally {
    otelReplayMocks.scheduleObservationEvals.mockResolvedValue(undefined);
  }
}

// The replay writer retries internally; Vitest retries could overlap an
// unfinished replay and race the shared writer singleton.
describe(
  "OTEL replay adversarial properties",
  { retry: 0, timeout: 120_000 },
  () => {
    it("stores the same row and gives evaluation the same observation for the attributes the TypeScript processor reads", async () => {
      const seed = randomInt(2 ** 31);
      process.stderr.write(`OTEL attribute replay seed=${seed}\n`);
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.oneof(
              { weight: 2, arbitrary: processorAttributeReplayArbitrary },
              providerReplayArbitrary,
              genericUsageReplayArbitrary,
            ),
            { minLength: 1, maxLength: 24 },
          ),
          assertRowAndEvaluationParity,
        ),
        {
          seed,
          numRuns: 64,
          examples: directedEvaluationExamples.map((example) => [example]),
        },
      );
    });

    it("keeps provider fallback and serialized-value parity", async () => {
      const seed = randomInt(2 ** 31);
      process.stderr.write(`OTEL provider replay seed=${seed}\n`);
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.oneof(providerReplayArbitrary, genericUsageReplayArbitrary),
            { minLength: 1, maxLength: 6 },
          ),
          assertProviderReplayParity,
        ),
        {
          seed,
          numRuns: 256,
          examples: directedProviderExamples.map((example) => [example]),
        },
      );
    });

    it("stores the same row wherever a tool call or definition sits under a key the TypeScript extractor reads", async () => {
      const cases = toolContainerSweep();
      const differing: string[] = [];
      for (let start = 0; start < cases.length; start += 500) {
        differing.push(
          ...(await toolSweepDifferences(cases.slice(start, start + 500))),
        );
      }
      expect(differing).toEqual([]);
    });
  },
);
