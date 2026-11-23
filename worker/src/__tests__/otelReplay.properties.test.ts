import "./helpers/otelReplaySetup";

import { createHash, randomInt } from "node:crypto";
import { Decimal } from "decimal.js";
import fc, { type Arbitrary } from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { MediaAssociationOrigin } from "@langfuse/shared";
import type { ResourceSpan } from "@langfuse/shared/src/server";
import * as dispatchConfig from "../features/eventsDispatch/config";
import * as traceSampling from "../features/traceDispatch/traceDispatchSampling";
import type { TraceSpanActivity } from "../features/traceDispatch/traceRuleRecording";
import {
  expectRawNativeParity,
  type OtelReplayResult,
  runOneOtelReplay,
  runOtelReplayComparison,
} from "./helpers/otelReplayHarness";
import {
  configureDefaultOtelReplayMocks,
  otelReplayMocks,
} from "./helpers/otelReplaySetup";
import {
  type Json,
  jsonKeyArbitrary,
  recursiveJsonArbitrary,
} from "./helpers/arbitraries/json";

const PROJECT_PREFIX = "otel-replay-property";
const FILE_KEY = "otel-replay/test.json";
const RESOURCE_ENVIRONMENT = "resource-env";
const PROVIDER_MODEL = "provider-model";
const SCOPE_NAME = "langfuse-sdk-adversarial";
const SERVICE_NAME = "otel-property-service";
const RESOURCE_VERSION = "resource-version";
const RESOURCE_RELEASE = "resource-release";

type JsonObject = Record<string, Json>;

type RootPayload =
  | { kind: "json"; value: Json }
  | { kind: "raw"; value: string };

type TypedScalar =
  | { kind: "string"; value: string }
  | { kind: "int"; value: number }
  | { kind: "double"; value: number | "NaN" | "Infinity" | "-Infinity" }
  | { kind: "bool"; value: boolean };

type MetadataAttribute = {
  key: string;
  value: TypedScalar | { kind: "array"; values: TypedScalar[] };
};

type OtelTimestamp = string | number;

type SpanSeed = {
  input: RootPayload;
  output: RootPayload;
  observationMetadata: JsonObject;
  traceMetadata: JsonObject;
  observationAttributes: MetadataAttribute[];
  traceAttributes: MetadataAttribute[];
  parentSelector: number;
  orderKey: number;
  timestampPresence: "both" | "startOnly" | "endOnly";
  numericTimestamps: boolean;
  promptVersion: number | null;
  version: string | null;
  release: string | null;
  environment: "span" | "lower" | "empty" | "resource";
  modelPrecedence: "canonical" | "response" | "request" | "none";
};

type ReplayCase = {
  traceId: string;
  idEncoding: "buffer" | "string" | "array" | number;
  spanIdBase: bigint;
  baseTimeMillis: number;
  spanSeeds: SpanSeed[];
};

// Null means the attribute is absent; empty strings are sent verbatim.
function stringAttributes(values: Record<string, string | null>) {
  return Object.entries(values).flatMap(([key, value]) =>
    value === null ? [] : [{ key, value: { stringValue: value } }],
  );
}

function typedAttribute(attribute: MetadataAttribute) {
  const encodeScalar = (value: TypedScalar) => {
    switch (value.kind) {
      case "string":
        return { stringValue: value.value };
      case "int":
        return { intValue: String(value.value) };
      case "double":
        return { doubleValue: value.value };
      case "bool":
        return { boolValue: value.value };
    }
  };

  return {
    key: attribute.key,
    value:
      attribute.value.kind === "array"
        ? { arrayValue: { values: attribute.value.values.map(encodeScalar) } }
        : encodeScalar(attribute.value),
  };
}

function typedAttributeValue(attribute: MetadataAttribute): unknown {
  if (attribute.value.kind === "array") {
    return attribute.value.values.map((value) => value.value);
  }
  return attribute.value.value;
}

function unixNanos(millis: number, remainder: number): string {
  return (BigInt(millis) * 1_000_000n + BigInt(remainder)).toString();
}

function timestampMillis(value: OtelTimestamp): number {
  return typeof value === "number"
    ? Math.trunc(value / 1e6)
    : Number(BigInt(value) / 1_000_000n);
}

function paddedHex(value: bigint, digits: number): string {
  return value.toString(16).padStart(digits, "0");
}

// Every encoding preserves the byte, keeping generated IDs unique and parent links intact.
const byteEncoders: ((byte: number) => Json)[] = [
  (byte) => byte - 256,
  (byte) => byte + 256,
  (byte) => byte + 0.5,
  String,
  (byte) => `\ufeff0x${byte.toString(16)}\u00a0`,
  (byte) => `0b${byte.toString(2)}`,
  (byte) => `0o${byte.toString(8)}`,
  (byte) => [String(byte)],
  (byte) => (byte === 0 ? null : byte),
  (byte) => (byte <= 1 ? Boolean(byte) : byte),
  (byte) => (byte === 0 ? {} : byte),
  (byte) => (byte === 0 ? [] : byte),
  (byte) => (byte === 0 ? "1e309" : byte),
];

function encodeId(hex: string, encoding: ReplayCase["idEncoding"]): Buffer {
  const bytes = [...Buffer.from(hex, "hex")];
  let wire: unknown;
  switch (encoding) {
    case "string":
      wire = hex;
      break;
    case "buffer":
      wire = { type: "Buffer", data: bytes };
      break;
    case "array":
      wire = bytes;
      break;
    default:
      wire = bytes.map((byte, index) =>
        byteEncoders[(encoding + index) % byteEncoders.length]!(byte),
      );
  }
  // ResourceSpan types describe protobuf output; replay also accepts JSON ID forms.
  return wire as Buffer;
}

function rootPayloadText(value: RootPayload): string {
  return value.kind === "json" ? JSON.stringify(value.value) : value.value;
}

function metadataFromSource(
  raw: JsonObject,
  attributes: MetadataAttribute[],
): Record<string, unknown> {
  // Prefixed __proto__ entries are currently dropped during extraction; an
  // own __proto__ key in the raw JSON metadata remains part of the stored data.
  const dottedValues = Object.fromEntries(
    attributes
      .filter((attribute) => attribute.key !== "__proto__")
      .map((attribute) => [attribute.key, typedAttributeValue(attribute)]),
  );
  // OTEL's raw JSON metadata is merged first; prefixed attributes then replace
  // an identical top-level key while leaving literal-dot/nested collisions.
  // JSON transport canonicalizes numbers such as -0 before metadata is flattened.
  return { ...JSON.parse(JSON.stringify(raw)), ...dottedValues };
}

function expectedMetadata(seed: SpanSeed): Record<string, unknown> {
  const base = {
    resourceAttributes: {
      "service.name": SERVICE_NAME,
      "service.version": RESOURCE_VERSION,
      "langfuse.environment": RESOURCE_ENVIRONMENT,
      "langfuse.release": RESOURCE_RELEASE,
    },
    scope: { name: SCOPE_NAME, version: "1.0.0", attributes: {} },
  };

  return {
    ...base,
    ...metadataFromSource(seed.observationMetadata, seed.observationAttributes),
    ...metadataFromSource(seed.traceMetadata, seed.traceAttributes),
  };
}

// Test-side contract oracle for the persisted flattened metadata. Arrays stay
// leaves; a path produced twice (literal-dot/nested collision) is persisted
// once with its first value.
function expectedMetadataPairs(
  metadata: Record<string, unknown>,
): Array<[string, string]> {
  const firstValueByPath = new Map<string, string>();
  for (const [path, value] of flattenedMetadataPairs(metadata)) {
    if (!firstValueByPath.has(path)) firstValueByPath.set(path, value);
  }
  return [...firstValueByPath];
}

function flattenedMetadataPairs(
  metadata: Record<string, unknown>,
  prefix = "",
): Array<[string, string]> {
  return Object.entries(metadata).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return flattenedMetadataPairs(value as Record<string, unknown>, path);
    }
    if (value == null) return [[path, ""]];
    return [[path, typeof value === "string" ? value : JSON.stringify(value)]];
  });
}

function buildReplayCase(params: ReplayCase) {
  const { traceId, spanSeeds, baseTimeMillis } = params;
  const projectId = `${PROJECT_PREFIX}-${traceId}`;
  const spanIds = spanSeeds.map((_, ordinal) =>
    paddedHex(params.spanIdBase - BigInt(ordinal), 16),
  );

  const cases = spanSeeds.map((seed, ordinal) => {
    const spanId = spanIds[ordinal];
    const parentSpanId =
      ordinal === 0 ? "" : spanIds[seed.parentSelector % ordinal];
    const marker = `${traceId}-${ordinal}`;
    const start = baseTimeMillis + ordinal * 1_000;
    const end = start + 250;
    const loneRemainder = seed.numericTimestamps ? 999_936 : 999_999;
    const bothPresent = seed.timestampPresence === "both";
    const startNanos = unixNanos(start, bothPresent ? 0 : loneRemainder);
    const endNanos = unixNanos(end, bothPresent ? 1 : loneRemainder);
    const startTimestamp = seed.numericTimestamps
      ? Number(startNanos)
      : startNanos;
    const endTimestamp = seed.numericTimestamps ? Number(endNanos) : endNanos;
    const startTime = timestampMillis(startTimestamp);
    const endTime = timestampMillis(endTimestamp);
    const modelName = {
      canonical: `explicit-model-${marker}`,
      response: `response-model-${marker}`,
      request: `request-model-${marker}`,
      none: "",
    }[seed.modelPrecedence];
    const metadata = expectedMetadataPairs(expectedMetadata(seed));
    const expected = {
      project_id: projectId,
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: parentSpanId,
      name: `property-span-${marker}`,
      type: "GENERATION",
      input: rootPayloadText(seed.input),
      output: rootPayloadText(seed.output),
      start_time: seed.timestampPresence === "endOnly" ? endTime : startTime,
      end_time: seed.timestampPresence === "startOnly" ? startTime : endTime,
      prompt_version: seed.promptVersion,
      release: seed.release ?? RESOURCE_RELEASE,
      version: seed.version ?? RESOURCE_VERSION,
      environment:
        seed.environment === "span"
          ? `span-env-${traceId.slice(-8)}-${ordinal}`
          : RESOURCE_ENVIRONMENT,
      provided_model_name: modelName,
      trace_name: `property-trace-${traceId}`,
      service_name: SERVICE_NAME,
      service_version: RESOURCE_VERSION,
      scope_name: SCOPE_NAME,
      scope_version: "1.0.0",
      source: "otel",
      ingestion_sdk_name: "otel-replay",
      ingestion_sdk_version: "test",
      blob_storage_file_path: FILE_KEY,
      metadata_names: metadata.map(([name]) => name),
      metadata_values: metadata.map(([, value]) => value),
    };
    const attributes = stringAttributes({
      "langfuse.observation.type": "generation",
      "langfuse.observation.input": expected.input,
      "langfuse.observation.output": expected.output,
      "gen_ai.input.messages": JSON.stringify([
        { role: "user", content: `provider-input-${marker}` },
      ]),
      "gen_ai.output.messages": JSON.stringify([
        { role: "assistant", content: `provider-output-${marker}` },
      ]),
      "gen_ai.request.model": {
        request: modelName,
        none: "",
        response: PROVIDER_MODEL,
        canonical: PROVIDER_MODEL,
      }[seed.modelPrecedence],
      "langfuse.observation.prompt.version":
        seed.promptVersion?.toString() ?? null,
      "gen_ai.response.model":
        seed.modelPrecedence === "request" || seed.modelPrecedence === "none"
          ? ""
          : `response-model-${marker}`,
      "langfuse.trace.name": expected.trace_name,
      "langfuse.observation.metadata": JSON.stringify(seed.observationMetadata),
      "langfuse.trace.metadata": JSON.stringify(seed.traceMetadata),
    });
    const metadataAttributes = [
      ...seed.observationAttributes.map((attribute) =>
        typedAttribute({
          ...attribute,
          key: `langfuse.observation.metadata.${attribute.key}`,
        }),
      ),
      ...seed.traceAttributes.map((attribute) =>
        typedAttribute({
          ...attribute,
          key: `langfuse.trace.metadata.${attribute.key}`,
        }),
      ),
    ];
    const overrides = stringAttributes({
      "langfuse.observation.model.name":
        seed.modelPrecedence === "canonical" ? modelName : "",
      "langfuse.version": seed.version,
      "langfuse.release": seed.release,
      "langfuse.environment": {
        span: expected.environment,
        empty: "",
        resource: null,
        lower: null,
      }[seed.environment],
      "deployment.environment.name":
        seed.environment === "lower" ? "span-fallback-env" : null,
    });
    return {
      expected,
      orderKey: seed.orderKey,
      span: {
        traceId: encodeId(traceId, params.idEncoding),
        spanId: encodeId(spanId, params.idEncoding),
        ...(ordinal === 0
          ? {}
          : { parentSpanId: encodeId(parentSpanId, params.idEncoding) }),
        name: expected.name,
        kind: 1,
        ...(seed.timestampPresence === "endOnly"
          ? {}
          : {
              startTimeUnixNano: startTimestamp,
            }),
        ...(seed.timestampPresence === "startOnly"
          ? {}
          : {
              endTimeUnixNano: endTimestamp,
            }),
        attributes: [...attributes, ...metadataAttributes, ...overrides],
        status: { code: 0 },
      },
    };
  });

  return {
    projectId,
    expectedRows: cases.map(({ expected }) => expected),
    resourceSpans: [
      {
        resource: {
          attributes: stringAttributes({
            "service.name": SERVICE_NAME,
            "service.version": RESOURCE_VERSION,
            "langfuse.environment": RESOURCE_ENVIRONMENT,
            "langfuse.release": RESOURCE_RELEASE,
          }),
        },
        scopeSpans: [
          {
            scope: { name: SCOPE_NAME, version: "1.0.0" },
            // Children are shuffled and the root remains last in the batch.
            spans: [
              ...cases
                .slice(1)
                .sort((left, right) => left.orderKey - right.orderKey)
                .map(({ span }) => span),
              cases[0].span,
            ],
          },
        ],
      },
    ] satisfies ResourceSpan[],
  };
}

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

function persistedMillis(value: unknown): number {
  if (typeof value !== "string") {
    throw new Error(
      `Expected a ClickHouse datetime string, received ${String(value)}`,
    );
  }
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const millis = Date.parse(iso);
  if (!Number.isFinite(millis)) {
    throw new Error(`Invalid persisted ClickHouse datetime: ${value}`);
  }
  return millis;
}

// These top-level keys trigger tool-definition migration in the downstream
// observation normalizer. That behavior has its own tests; this property owns
// generic metadata JSON persistence and excludes those two recognized forms.
const metadataObjectKeyArbitrary = jsonKeyArbitrary.filter(
  (key) => key !== "tools" && key !== "attributes",
);
const metadataAttributeKeyArbitrary = jsonKeyArbitrary.filter(
  (key) =>
    // Empty suffixes are ignored; tool-normalizer reserved forms are out of scope.
    key !== "" && key !== "tools" && key !== "attributes",
);

const specialJsonValues: Json[] = [
  null,
  "",
  { emptyObject: {}, emptyArray: [], nullLeaf: null },
  JSON.parse(
    '{"__proto__":{"preserved":true},"constructor":{"prototype":false},"a.b":"literal dotted key","nested":{"a":{"b":"nested dotted path"}}}',
  ) as Json,
  {
    line: 'line\nreturn\rtab\t nul\u0000 quote" slash/ backslash\\',
    unicode: "🌍🧪\u2028\u2029",
    deep: { one: { two: { three: { four: [null, false, "終"] } } } },
  },
  [
    { role: "human", content: [{ type: "text", text: "question" }] },
    { role: "ai", content: [{ type: "text", text: "answer" }] },
  ],
];

// OTLP distinguishes scalar types even when JSON would encode the same value;
// typed arrays exercise the metadata conversion before flattening.
function scalarAttributeArbitrary(): Arbitrary<TypedScalar> {
  return fc.oneof(
    { withCrossShrink: true },
    fc.record({
      kind: fc.constant("string" as const),
      value: fc.string({ maxLength: 20, unit: "grapheme" }),
    }),
    fc.record({
      kind: fc.constant("int" as const),
      value: fc.integer({ min: -1_000_000, max: 1_000_000 }),
    }),
    fc.record({
      kind: fc.constant("double" as const),
      value: fc.oneof(
        { withCrossShrink: true },
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        fc.constantFrom(
          "NaN" as const,
          "Infinity" as const,
          "-Infinity" as const,
        ),
      ),
    }),
    fc.record({ kind: fc.constant("bool" as const), value: fc.boolean() }),
  );
}

function metadataAttributeArbitrary(
  keyArbitrary: Arbitrary<string>,
): Arbitrary<MetadataAttribute> {
  const scalar = scalarAttributeArbitrary();
  return fc.record({
    key: keyArbitrary,
    value: fc.oneof(
      { withCrossShrink: true },
      scalar,
      fc.record({
        kind: fc.constant("array" as const),
        values: fc.array(scalar, { maxLength: 4 }),
      }),
    ),
  });
}

// The Langfuse IO attributes accept both JSON text and raw strings. Whitespace
// and invalid JSON must survive, independently for input and output.
function rootPayloadArbitrary(
  jsonValue: Arbitrary<Json>,
): Arbitrary<RootPayload> {
  return fc.oneof(
    { withCrossShrink: true },
    fc.record({
      kind: fc.constant("raw" as const),
      value: fc.oneof(
        { withCrossShrink: true },
        fc.string({ maxLength: 24, unit: "grapheme" }),
        fc.constantFrom(
          "",
          "plain text",
          "{invalid",
          " \r\n\t",
          "  null ",
          "  {}  ",
        ),
      ),
    }),
    fc.record({ kind: fc.constant("json" as const), value: jsonValue }),
  );
}

// Both campaigns vary every axis independently. The biased campaign adds
// provider-shaped state and metadata collisions that broad JSON seldom produces.
function replayCaseArbitrary(
  depth: number,
  maxWidth: number,
  biased: boolean,
): Arbitrary<ReplayCase> {
  const broadJson = recursiveJsonArbitrary(depth, maxWidth);
  const jsonValue = biased
    ? fc.oneof(
        { withCrossShrink: true },
        { weight: 2, arbitrary: broadJson },
        { weight: 5, arbitrary: fc.constantFrom(...specialJsonValues) },
      )
    : broadJson;
  const metadataValue = recursiveJsonArbitrary(
    Math.max(1, depth - 1),
    maxWidth,
  );
  const broadMetadataRoot = fc.dictionary(
    metadataObjectKeyArbitrary,
    metadataValue,
    {
      maxKeys: maxWidth,
    },
  );
  const metadataRoot = biased
    ? fc.oneof(
        { withCrossShrink: true },
        { weight: 2, arbitrary: broadMetadataRoot },
        {
          weight: 5,
          arbitrary: fc
            .record({
              nestedStatus: metadataValue,
              literalStatus: metadataValue,
              messages: fc.array(metadataValue, { maxLength: maxWidth }),
              deep: recursiveJsonArbitrary(4, maxWidth),
              wide: fc.array(metadataValue, { maxLength: maxWidth }),
            })
            .map(({ nestedStatus, literalStatus, messages, deep, wide }) => ({
              route: { status: nestedStatus },
              "route.status": literalStatus,
              langgraph: { messages, state: { values: wide } },
              resourceAttributes: { custom: { deep } },
              scope: { name: "generated-scope", attributes: { values: wide } },
            })),
        },
      )
    : broadMetadataRoot;
  const metadataAttrKey = biased
    ? fc.oneof(
        { withCrossShrink: true },
        { weight: 2, arbitrary: metadataAttributeKeyArbitrary },
        {
          weight: 5,
          arbitrary: fc.constantFrom(
            "a.b",
            "route.status",
            "__proto__",
            "tags",
            "model",
            "scope.name",
          ),
        },
      )
    : metadataAttributeKeyArbitrary;
  const metadataAttrs = fc.array(metadataAttributeArbitrary(metadataAttrKey), {
    maxLength: 3,
  });

  return fc.record({
    traceId: fc.bigInt({ min: 1n, max: (1n << 128n) - 1n }).map(
      (value) => paddedHex(value, 32),
      (value) => {
        if (typeof value !== "string" || !/^[0-9a-f]{32}$/.test(value)) {
          throw new Error("Expected a 32-digit hexadecimal trace ID");
        }
        return BigInt(`0x${value}`);
      },
    ),
    idEncoding: fc.oneof(
      fc.constantFrom("buffer" as const, "string" as const, "array" as const),
      fc.integer({ min: 0, max: byteEncoders.length - 1 }),
    ),
    spanIdBase: fc.bigInt({ min: 6n, max: (1n << 64n) - 1n }),
    baseTimeMillis: fc.integer({
      min: 1_700_000_000_000,
      max: 1_800_000_000_000,
    }),
    // A filtered zero-minimum array can shrink away trailing spans even when
    // its first span is the failure; fast-check's minLength: 1 retains that tail.
    spanSeeds: fc
      .array(
        fc.record({
          input: rootPayloadArbitrary(jsonValue),
          output: rootPayloadArbitrary(jsonValue),
          observationMetadata: metadataRoot,
          traceMetadata: metadataRoot,
          observationAttributes: metadataAttrs,
          traceAttributes: metadataAttrs,
          parentSelector: fc.nat(65_535),
          orderKey: fc.integer(),
          timestampPresence: fc.constantFrom(
            "both" as const,
            "startOnly" as const,
            "endOnly" as const,
          ),
          numericTimestamps: fc.boolean(),
          promptVersion: fc.constantFrom(null, 0, 1, 65_535),
          version: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
          release: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
          environment: fc.constantFrom(
            "resource" as const,
            "span" as const,
            "lower" as const,
            "empty" as const,
          ),
          modelPrecedence: fc.constantFrom(
            "none" as const,
            "canonical" as const,
            "response" as const,
            "request" as const,
          ),
        }),
        { maxLength: 6 },
      )
      .filter((seeds) => seeds.length > 0),
  });
}

// Small defaults keep directed witnesses within the same shrinkable input domain.
const minimalSpan: SpanSeed = {
  input: { kind: "raw", value: "" },
  output: { kind: "raw", value: "" },
  observationMetadata: {},
  traceMetadata: {},
  observationAttributes: [],
  traceAttributes: [],
  parentSelector: 0,
  orderKey: 0,
  timestampPresence: "both",
  numericTimestamps: false,
  promptVersion: null,
  version: null,
  release: null,
  environment: "resource",
  modelPrecedence: "none",
};

const directedCases: ReplayCase[] = [
  {
    traceId: paddedHex(1n, 32),
    idEncoding: 0,
    spanIdBase: 6n,
    baseTimeMillis: 1_700_000_000_000,
    spanSeeds: [
      {
        ...minimalSpan,
        timestampPresence: "startOnly",
        numericTimestamps: true,
        observationMetadata: {
          route: { status: "nested" },
          "route.status": "literal",
        },
        traceAttributes: [
          { key: "route.status", value: { kind: "string", value: "trace" } },
        ],
        version: "",
        release: "",
        environment: "empty",
      },
    ],
  },
  {
    traceId: paddedHex(2n, 32),
    idEncoding: 7,
    spanIdBase: 7n,
    baseTimeMillis: 1_700_000_000_000,
    spanSeeds: [
      {
        ...minimalSpan,
        input: { kind: "raw", value: "{invalid" },
        observationMetadata: JSON.parse('{"__proto__":"raw-value"}'),
        observationAttributes: [
          { key: "a", value: { kind: "array", values: [] } },
        ],
        traceAttributes: [
          { key: "__proto__", value: { kind: "string", value: "kept" } },
        ],
      },
      {
        ...minimalSpan,
        input: { kind: "json", value: [null, false, {}] },
        output: { kind: "raw", value: "  null " },
      },
    ],
  },
];

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
  ...[null, false, 0, 5e-324, true, "", [], [1], { name: "nested" }].map(
    (name) =>
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

async function assertReplayPersists(params: ReplayCase): Promise<void> {
  const replay = buildReplayCase(params);
  const comparison = await runOtelReplayComparison({
    bytes: Buffer.from(JSON.stringify(replay.resourceSpans)),
    projectId: replay.projectId,
    fileKey: FILE_KEY,
    mediaUploadEnabled: true,
  });

  for (const result of [
    comparison.originalTs,
    comparison.earlyTs,
    comparison.earlyRust,
  ]) {
    expect(result.storedRows, result.mode).toHaveLength(
      replay.expectedRows.length,
    );
    const rowsBySpanId = new Map(
      result.storedRows.map((row) => [String(row.span_id), row]),
    );
    expect([...rowsBySpanId.keys()].sort(), result.mode).toEqual(
      replay.expectedRows.map((row) => row.span_id).sort(),
    );

    for (const expected of replay.expectedRows) {
      const row = rowsBySpanId.get(expected.span_id)!;
      // Compare every contracted field exactly, including both metadata arrays:
      // objectContaining permits unrelated stored columns, not extra array elements.
      expect({
        ...row,
        start_time: persistedMillis(row.start_time),
        end_time: persistedMillis(row.end_time),
      }).toEqual(expect.objectContaining(expected));
    }
  }

  expectRawNativeParity(comparison);
}

type AnyValue = Record<string, unknown> | null;

const textValue = (stringValue: string): AnyValue => ({ stringValue });

// OTLP lets any attribute carry any value type, so a key ingestion maps to a
// string column, a lookup or an enum can arrive as any of these.
const stringShapes = ["x", "", " ", "0", "false"].map(textValue);
const falsyScalarShapes: AnyValue[] = [
  { boolValue: false },
  { intValue: "0" },
  { intValue: 0 },
  { doubleValue: 0 },
];
const truthyScalarShapes: AnyValue[] = [
  { boolValue: true },
  { intValue: "5" },
  { intValue: 5 },
  { doubleValue: 1.5 },
];
const arrayShapes: AnyValue[] = [
  { arrayValue: { values: [] } },
  { arrayValue: { values: [textValue("x")] } },
  { arrayValue: { values: [textValue("a"), textValue("b")] } },
];
const structuredShapes: AnyValue[] = [
  { kvlistValue: { values: [{ key: "a", value: { intValue: "1" } }] } },
  { kvlistValue: { values: [] } },
  {},
  null,
];
const anyValueShapes = [
  ...stringShapes,
  ...falsyScalarShapes,
  ...truthyScalarShapes,
  ...arrayShapes,
  ...structuredShapes,
];

type WrongTypeTarget = {
  place: "span" | "resource" | "scope" | "spanField";
  key: string;
  shapes: AnyValue[];
};

const wrongTypeTargets: WrongTypeTarget[] = [
  ...[
    "langfuse.trace.name",
    "langfuse.version",
    "langfuse.release",
    "langfuse.observation.status_message",
    "langfuse.user.id",
    "user.id",
    "langfuse.observation.metadata.langfuse_user_id",
    "langfuse.trace.metadata.langfuse_user_id",
    "ai.telemetry.metadata.userId",
    "user.name",
    "langfuse.session.id",
    "session.id",
    "gen_ai.conversation.id",
    "langfuse.observation.metadata.langfuse_session_id",
    "langfuse.trace.metadata.langfuse_session_id",
    "ai.telemetry.metadata.sessionId",
    "langfuse.evaluator.id",
    "langfuse.evaluation.rule.id",
    "langfuse.experiment.id",
    "langfuse.experiment.name",
    "langfuse.experiment.description",
    "langfuse.experiment.dataset.id",
    "langfuse.experiment.item.id",
    "langfuse.experiment.item.expected_output",
    "langfuse.experiment.item.root_observation_id",
    "gen_ai.tool.name",
    "genkit:name",
    "logfire.msg",
    "ai.toolCall.name",
    "ai.operationId",
    "ai.telemetry.functionId",
    "langfuse.observation.model.name",
    "litellm.provider.model",
    "gen_ai.response.model",
    "ai.model.id",
    "gen_ai.request.model",
    "llm.response.model",
    "llm.model_name",
    "model",
    "langfuse.observation.prompt.version",
    "langfuse.prompt.version",
    "langfuse.observation.type",
    "openinference.span.kind",
    "gen_ai.operation.name",
    "genkit:metadata:subtype",
    "langfuse.environment",
    "deployment.environment",
    "deployment.environment.name",
    "langfuse.observation.level",
    "langfuse.trace.public",
    "langfuse.public",
    "langfuse.trace.tags",
    "langfuse.tags",
    "langfuse.observation.input",
    "langfuse.observation.output",
    "langfuse.trace.input",
    "langfuse.trace.output",
    "langfuse.observation.metadata",
    "langfuse.trace.metadata",
    "langfuse.observation.metadata.k",
  ].map((key): WrongTypeTarget => ({
    place: "span",
    key,
    shapes: anyValueShapes,
  })),
  // TypeScript hands a truthy number, boolean or array to the prompt service
  // unchanged, where Rust sends its text form. Strings and falsy values agree.
  ...["langfuse.observation.prompt.name", "langfuse.prompt.name"].map(
    (key): WrongTypeTarget => ({
      place: "span",
      key,
      shapes: [...stringShapes, ...falsyScalarShapes, ...structuredShapes],
    }),
  ),
  ...[
    "service.name",
    "service.version",
    "langfuse.release",
    "telemetry.sdk.language",
    "telemetry.sdk.name",
    "telemetry.sdk.version",
    "langfuse.user.id",
    "user.id",
    "user.name",
    "langfuse.environment",
    "deployment.environment",
    "deployment.environment.name",
  ].map((key): WrongTypeTarget => ({
    place: "resource",
    key,
    shapes: anyValueShapes,
  })),
  // TypeScript rejects the whole batch when the scope name is not a string.
  { place: "scope", key: "name", shapes: stringShapes },
  { place: "scope", key: "version", shapes: anyValueShapes },
  { place: "spanField", key: "name", shapes: anyValueShapes },
  { place: "spanField", key: "status.message", shapes: anyValueShapes },
];

type WrongTypeOverride = Pick<WrongTypeTarget, "place" | "key"> & {
  value: AnyValue;
};

type WrongTypeSpanSeed = {
  // Each default can be dropped so a lower-priority alias becomes the source.
  defaults: {
    type: boolean;
    model: boolean;
    promptName: boolean;
    promptVersion: boolean;
  };
  overrides: WrongTypeOverride[];
};

const wrongTypeSpanArbitrary: Arbitrary<WrongTypeSpanSeed> = fc.record({
  defaults: fc.record({
    type: fc.boolean(),
    model: fc.boolean(),
    promptName: fc.boolean(),
    promptVersion: fc.boolean(),
  }),
  overrides: fc.uniqueArray(
    fc
      .constantFrom(...wrongTypeTargets)
      .chain(({ place, key, shapes }) =>
        fc.constantFrom(...shapes).map((value) => ({ place, key, value })),
      ),
    {
      minLength: 1,
      maxLength: 3,
      selector: ({ place, key }) => `${place}:${key}`,
    },
  ),
});

// Span and scope fields are plain JSON rather than OTLP AnyValue wrappers.
function plainValue(value: AnyValue): unknown {
  if (value === null) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("boolValue" in value) return value.boolValue;
  if ("intValue" in value) return Number(value.intValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("arrayValue" in value) {
    return (value.arrayValue as { values: AnyValue[] }).values.map(plainValue);
  }
  if ("kvlistValue" in value) {
    return Object.fromEntries(
      (
        value.kvlistValue as { values: { key: string; value: AnyValue }[] }
      ).values.map(({ key, value }) => [key, plainValue(value)]),
    );
  }
  return {};
}

function buildWrongTypeReplay(seeds: WrongTypeSpanSeed[]): Buffer {
  const resourceSpans = seeds.map((seed, index) => {
    const at = (place: WrongTypeTarget["place"]) =>
      seed.overrides.filter((override) => override.place === place);
    const overridden = new Set(at("span").map(({ key }) => key));
    const defaults: [string, AnyValue, boolean][] = [
      ["langfuse.observation.input", textValue("hello"), true],
      [
        "langfuse.observation.type",
        textValue("generation"),
        seed.defaults.type,
      ],
      ["gen_ai.request.model", textValue("base-model"), seed.defaults.model],
      [
        "langfuse.observation.prompt.name",
        textValue("base-prompt"),
        seed.defaults.promptName,
      ],
      [
        "langfuse.observation.prompt.version",
        { intValue: "3" },
        seed.defaults.promptVersion,
      ],
    ];
    const span: Record<string, unknown> = {
      traceId: paddedHex(BigInt(index + 1), 32),
      spanId: paddedHex(BigInt(index + 1), 16),
      name: "wrong-type",
      kind: 1,
      startTimeUnixNano: unixNanos(Date.UTC(2026, 0, 1) + index, 0),
      endTimeUnixNano: unixNanos(Date.UTC(2026, 0, 1) + index + 1, 0),
      attributes: [
        ...defaults.flatMap(([key, value, present]) =>
          present && !overridden.has(key) ? [{ key, value }] : [],
        ),
        ...at("span").map(({ key, value }) => ({ key, value })),
      ],
    };
    for (const { key, value } of at("spanField")) {
      if (key === "status.message") {
        span.status = { code: 2, message: plainValue(value) };
      } else {
        span[key] = plainValue(value);
      }
    }
    return {
      resource: {
        attributes: [
          ...(at("resource").some(({ key }) => key === "service.name")
            ? []
            : [{ key: "service.name", value: textValue(SERVICE_NAME) }]),
          ...at("resource").map(({ key, value }) => ({
            key: key,
            value,
          })),
        ],
      },
      scopeSpans: [
        {
          scope: {
            name: "wrong-type-scope",
            version: "1.0.0",
            ...Object.fromEntries(
              at("scope").map(({ key, value }) => [key, plainValue(value)]),
            ),
          },
          spans: [span],
        },
      ],
    };
  });
  return Buffer.from(JSON.stringify(resourceSpans));
}

/**
 * A row comparison cannot see what was asked of the model and prompt services,
 * so the requests are compared too, with their JavaScript type: `false` and
 * `"false"` store the same text but only one of them is looked up.
 *
 * TypeScript rejects some wrong-typed documents outright, for example when it
 * calls a string method on the value. There is then no reference result, so
 * the case is skipped rather than compared.
 */
async function assertWrongTypeReplayParity(
  seeds: WrongTypeSpanSeed[],
): Promise<void> {
  const requests: string[] = [];
  const typed = (value: unknown) => `${typeof value} ${JSON.stringify(value)}`;
  otelReplayMocks.findModel.mockImplementation(
    async ({ model }: { model: unknown }) => {
      requests.push(`model ${typed(model)}`);
      return { model: { id: "replay-model-id" }, pricingTiers: [] };
    },
  );
  otelReplayMocks.getPrompt.mockImplementation(
    async (request: { promptName: unknown; version: unknown }) => {
      requests.push(
        `prompt ${typed(request.promptName)} ${typed(request.version)}`,
      );
      return { id: "replay-prompt-id" };
    },
  );
  const bytes = buildWrongTypeReplay(seeds);
  const replay = (mode: OtelReplayResult["mode"]) =>
    runOneOtelReplay({
      mode,
      bytes: Buffer.from(bytes),
      projectId: `${PROJECT_PREFIX}-wrong-type-${seeds.length}`,
      fileKey: FILE_KEY,
      mediaUploadEnabled: true,
      captureSideEffects: () => requests.splice(0).sort(),
    });
  try {
    const originalTs = await replay("original-ts").catch(() => {
      requests.length = 0;
      return undefined;
    });
    fc.pre(originalTs !== undefined);
    const comparison = {
      originalTs: originalTs!,
      earlyTs: await replay("early-ts"),
      earlyRust: await replay("early-rust"),
    };
    expect(comparison.originalTs.storedRows).toHaveLength(seeds.length);
    expect(comparison.earlyTs.sideEffects).toEqual(
      comparison.originalTs.sideEffects,
    );
    expect(comparison.earlyRust.sideEffects).toEqual(
      comparison.originalTs.sideEffects,
    );
    expectRawNativeParity(comparison);
  } finally {
    configureDefaultOtelReplayMocks();
  }
}

// Decisions the generator reaches rarely: a falsy prompt name is stored but not
// looked up, a non-string trace name or name override is stored as text but
// not evaluated.
const allDefaults = {
  type: true,
  model: true,
  promptName: true,
  promptVersion: true,
};
// Name sources in priority order; the span name itself is the last resort.
const nameSourceKeys = [
  "gen_ai.tool.name",
  "genkit:name",
  "logfire.msg",
  "ai.toolCall.name",
];
const noDefaults = {
  type: false,
  model: false,
  promptName: false,
  promptVersion: false,
};
// Each kind of value as the span name, then on every name source above
// lower-priority string aliases, under a valid override, and as the function
// id that prefixes an operation name.
const competingNameSources: WrongTypeSpanSeed[] = (
  [
    [{ intValue: "5" }, { intValue: "5" }],
    [{ boolValue: false }, { boolValue: false }],
    [
      { arrayValue: { values: [textValue("tool")] } },
      { arrayValue: { values: [textValue("tool")] } },
    ],
    [textValue("5"), textValue("5")],
    [textValue(""), textValue("")],
    // A null span name, and an attribute with no value set.
    [null, {}],
  ] satisfies [AnyValue, AnyValue][]
).flatMap(([spanName, attribute]) => {
  const named = (...attributes: [string, AnyValue][]): WrongTypeSpanSeed => ({
    defaults: noDefaults,
    overrides: [
      { place: "spanField", key: "name", value: spanName },
      ...attributes.map(([key, value]): WrongTypeOverride => ({
        place: "span",
        key,
        value,
      })),
    ],
  });
  return [
    named(),
    ...nameSourceKeys.map((key, index) =>
      named(
        [key, attribute],
        ...nameSourceKeys
          .slice(index + 1)
          .map((alias): [string, AnyValue] => [
            alias,
            textValue("lower priority"),
          ]),
      ),
    ),
    named(["genkit:name", textValue("valid override")]),
    named(
      ["ai.operationId", textValue("generate")],
      ["ai.telemetry.functionId", attribute],
    ),
  ];
});

const directedWrongTypeExamples: WrongTypeSpanSeed[][] = [
  competingNameSources,
  [
    {
      defaults: allDefaults,
      overrides: [
        {
          place: "span",
          key: "langfuse.observation.prompt.name",
          value: { boolValue: false },
        },
      ],
    },
  ],
  [
    {
      defaults: allDefaults,
      overrides: [
        {
          place: "span",
          key: "langfuse.trace.name",
          value: { arrayValue: { values: [textValue("x")] } },
        },
      ],
    },
  ],
  [
    {
      defaults: allDefaults,
      overrides: [
        {
          place: "span",
          key: "ai.toolCall.name",
          value: { intValue: "5" },
        },
      ],
    },
  ],
  [
    {
      defaults: allDefaults,
      overrides: [
        {
          place: "spanField",
          key: "name",
          value: { intValue: 5 },
        },
      ],
    },
  ],
];

type LifecycleSpanSeed = {
  // Only generations carry a model, a prompt and usage, so only they can be
  // dropped by a failed lookup.
  generation: {
    model: number | null;
    prompt: { name: number; version: number } | null;
  } | null;
  input: string | null;
  output: string | null;
  note: string;
  padding: number;
};

type LifecycleCase = {
  spans: LifecycleSpanSeed[];
  // Selects which models, prompts and uploads fail in this case.
  salt: number;
  overflow: boolean;
  mediaUploadEnabled: boolean;
};

const LIFECYCLE_OVERFLOW_LIMIT_BYTES = 256;

const mediaTypeArbitrary = fc.constantFrom(
  "image/png",
  "image/jpeg",
  "application/pdf",
  "audio/wav",
  "text/plain",
);
// Small bodies stay below the overflow limit and large ones cross it, so one
// case can hold uploaded media, inline media and overflowing fields.
const mediaBodyArbitrary = fc
  .oneof(
    fc.uint8Array({ minLength: 1, maxLength: 48 }),
    fc.uint8Array({ minLength: 300, maxLength: 420 }),
  )
  .map((bytes) => Buffer.from(bytes).toString("base64"));
const dataUriArbitrary = fc
  .tuple(mediaTypeArbitrary, mediaBodyArbitrary)
  .map(([type, body]) => `data:${type};base64,${body}`);
const typedBodyArbitrary = fc.tuple(mediaTypeArbitrary, mediaBodyArbitrary);

// Shapes both media detectors extract identically: whitespace-delimited data
// URIs in text, and provider parts at most one JSON layer deep.
const mediaPartArbitrary: Arbitrary<Json> = fc.oneof(
  fc.tuple(dataUriArbitrary, dataUriArbitrary).map(([first, second]) => ({
    type: "text",
    text: `Please look at ${first} and ${second} thanks`,
  })),
  typedBodyArbitrary.map(([media_type, data]) => ({
    type: "image",
    source: { type: "base64", media_type, data },
  })),
  typedBodyArbitrary.map(([mediaType, data]) => ({
    type: "file",
    mediaType,
    data,
  })),
  typedBodyArbitrary.map(([mime_type, data]) => ({
    inline_data: { mime_type, data },
  })),
  typedBodyArbitrary.map(([mime_type, data]) => ({
    type: "media",
    mime_type,
    data,
  })),
  dataUriArbitrary.map((url) => ({ type: "image_url", image_url: { url } })),
  fc
    .nat(60)
    .map((words) => ({ type: "text", text: "plain words ".repeat(words) })),
);

const lifecycleSpanArbitrary: Arbitrary<LifecycleSpanSeed> = fc.record({
  generation: fc.option(
    fc.record({
      model: fc.option(fc.nat(7), { nil: null }),
      prompt: fc.option(
        fc.record({ name: fc.nat(5), version: fc.integer({ min: 1, max: 4 }) }),
        { nil: null },
      ),
    }),
    { nil: null },
  ),
  input: fc.oneof(
    fc.constant(null),
    dataUriArbitrary.map((uri) => `Summarise ${uri} now`),
    fc
      .array(
        fc.record({
          role: fc.constantFrom("user", "assistant"),
          content: fc.array(mediaPartArbitrary, { minLength: 1, maxLength: 3 }),
        }),
        { minLength: 1, maxLength: 2 },
      )
      .map((messages) => JSON.stringify(messages)),
  ),
  output: fc.oneof(
    fc.constant(null),
    mediaPartArbitrary.map((part) =>
      JSON.stringify({ role: "assistant", content: [part] }),
    ),
    fc
      .tuple(dataUriArbitrary, fc.nat(600))
      .map(([uri, filler]) => `done ${uri} ok ${"z".repeat(filler)}`),
  ),
  note: fc.oneof(fc.constant("note"), dataUriArbitrary),
  // The large value exceeds the fixed per-span allowance of the native estimate.
  padding: fc.constantFrom(20, 2_000),
});

const lifecycleCaseArbitrary: Arbitrary<LifecycleCase> = fc.record({
  // The first span needs no lookup: the replay harness requires at least one
  // stored row, and a batch can otherwise lose every span to failed lookups.
  spans: fc
    .tuple(
      lifecycleSpanArbitrary.map((span) => ({ ...span, generation: null })),
      fc.array(lifecycleSpanArbitrary, { maxLength: 5 }),
    )
    .map(([first, rest]) => [first, ...rest]),
  salt: fc.nat(0xffff),
  overflow: fc.boolean(),
  mediaUploadEnabled: fc.boolean(),
});

const lifecycleModelName = (model: number) => `lifecycle-model-${model}`;
const lifecyclePromptName = (prompt: number) => `lifecycle-prompt-${prompt}`;
const lifecycleSpanId = (index: number) => paddedHex(BigInt(index + 1), 16);
// Three spans share a trace so byte totals are summed across rows.
const lifecycleTraceId = (index: number) =>
  paddedHex(BigInt(Math.floor(index / 3) + 1), 32);

function buildLifecycleReplay(spans: LifecycleSpanSeed[]): Buffer {
  const baseMillis = Date.UTC(2026, 0, 1);
  return Buffer.from(
    JSON.stringify([
      {
        resource: {
          attributes: stringAttributes({ "service.name": SERVICE_NAME }),
        },
        scopeSpans: [
          {
            scope: { name: SCOPE_NAME, version: "1.0.0" },
            spans: spans.map((seed, index) => ({
              traceId: lifecycleTraceId(index),
              spanId: lifecycleSpanId(index),
              name: `lifecycle-${index}`,
              kind: 1,
              startTimeUnixNano: unixNanos(baseMillis + index * 1_000, 0),
              endTimeUnixNano: unixNanos(baseMillis + index * 1_000 + 500, 0),
              attributes: [
                ...stringAttributes({
                  "langfuse.observation.type": seed.generation
                    ? "generation"
                    : "span",
                  "langfuse.observation.input": seed.input,
                  "langfuse.observation.output": seed.output,
                  "langfuse.observation.metadata.note": seed.note,
                  "langfuse.observation.metadata.padding": "m".repeat(
                    seed.padding,
                  ),
                  "langfuse.observation.model.name":
                    seed.generation?.model == null
                      ? null
                      : lifecycleModelName(seed.generation.model),
                  "langfuse.observation.prompt.name": seed.generation?.prompt
                    ? lifecyclePromptName(seed.generation.prompt.name)
                    : null,
                }),
                ...(seed.generation?.prompt
                  ? [
                      {
                        key: "langfuse.observation.prompt.version",
                        value: {
                          intValue: String(seed.generation.prompt.version),
                        },
                      },
                    ]
                  : []),
                ...(seed.generation
                  ? [
                      {
                        key: "gen_ai.usage.input_tokens",
                        value: { intValue: String(100 + index) },
                      },
                      {
                        key: "gen_ai.usage.output_tokens",
                        value: { intValue: String(10 + index) },
                      },
                    ]
                  : []),
              ],
            })),
          },
        ],
      },
    ]),
  );
}

// The same key fails in every mode of one case and in a different set of
// cases for each salt.
function faultBucket(salt: number, key: string, buckets: number): number {
  return createHash("sha256").update(`${salt}:${key}`).digest()[0]! % buckets;
}
const modelLookupFails = (salt: number, model: string) =>
  faultBucket(salt, `model:${model}`, 8) === 0;
const promptLookupFails = (salt: number, name: string, version: number) =>
  faultBucket(salt, `prompt:${name}:${version}`, 6) === 0;

type LifecycleEffects = {
  lookups: string[];
  overflowUploads: string[];
  mediaUploads: number;
  activity: TraceSpanActivity[];
};

// What trace dispatch reads back for a span: input, output and metadata.
function dispatchPayloadBytes(row: Record<string, unknown>): number {
  const text = (value: unknown) =>
    typeof value === "string" ? Buffer.byteLength(value) : 0;
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.reduce<number>((sum, item) => sum + text(item), 0)
      : 0;
  return (
    text(row.input) +
    text(row.output) +
    list(row.metadata_names) +
    list(row.metadata_values)
  );
}

function sumByTrace<T>(
  items: readonly T[],
  traceId: (item: T) => string,
  bytes: (item: T) => number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(traceId(item), (totals.get(traceId(item)) ?? 0) + bytes(item));
  }
  return totals;
}

/**
 * Replays documents with media, models and prompts while a salted subset of
 * lookups and uploads fails, with field overflow and media upload switched per
 * case. Rows and evaluation decisions must match across paths, and so must the
 * side effects a row comparison cannot see.
 */
async function assertLifecycleParity(testCase: LifecycleCase): Promise<void> {
  const { spans, salt, overflow, mediaUploadEnabled } = testCase;
  const effects: LifecycleEffects = {
    lookups: [],
    overflowUploads: [],
    mediaUploads: 0,
    activity: [],
  };
  otelReplayMocks.findModel.mockImplementation(
    async ({ model }: { model: string }) => {
      effects.lookups.push(`model ${model}`);
      if (modelLookupFails(salt, model)) {
        throw new Error("simulated model lookup failure");
      }
      // Unknown models and priced models both stay in the batch.
      if (faultBucket(salt, `known:${model}`, 3) === 0) {
        return { model: null, pricingTiers: [] };
      }
      return {
        model: { id: `id-of-${model}` },
        pricingTiers: [
          {
            id: "tier-default",
            name: "Standard",
            isDefault: true,
            priority: 0,
            conditions: [],
            prices: [
              { usageType: "input", price: new Decimal("0.0000025") },
              { usageType: "output", price: new Decimal("0.00001") },
            ],
          },
        ],
      };
    },
  );
  otelReplayMocks.getPrompt.mockImplementation(
    async (request: { promptName: string; version: number }) => {
      effects.lookups.push(`prompt ${request.promptName} ${request.version}`);
      if (promptLookupFails(salt, request.promptName, request.version)) {
        throw new Error("simulated prompt lookup failure");
      }
      return faultBucket(salt, `known:${request.promptName}`, 3) === 0
        ? null
        : { id: `id-of-${request.promptName}` };
    },
  );
  otelReplayMocks.uploadMediaForTrace.mockImplementation(
    async (upload: {
      contentBytes: Uint8Array;
      field: string;
      origin?: MediaAssociationOrigin;
    }) => {
      const digest = createHash("sha256")
        .update(upload.contentBytes)
        .digest("hex");
      if (upload.origin === MediaAssociationOrigin.INGESTION_FIELD_OVERFLOW) {
        effects.overflowUploads.push(`${upload.field} ${digest}`);
      } else {
        effects.mediaUploads += 1;
      }
      if (faultBucket(salt, `upload:${digest}`, 4) === 0) {
        throw new Error("simulated upload failure");
      }
      return { mediaId: digest.slice(0, 22), outcome: "uploaded" as const };
    },
  );
  otelReplayMocks.createEvalSchedulerDeps.mockImplementation(() => ({
    collectTraceActivity: (activity: TraceSpanActivity) => {
      effects.activity.push(activity);
    },
    flushTraceActivity: async () => undefined,
    traceTranscriptRules: Promise.resolve([]),
  }));
  // Sample every trace so each accepted span reports its dispatch weight.
  const dispatch = vi
    .spyOn(dispatchConfig, "isEventsDispatchEnabled")
    .mockReturnValue(true);
  const sampling = vi
    .spyOn(traceSampling, "resolveTraceDispatchSamplingRate")
    .mockResolvedValue(1);

  try {
    const comparison = await runOtelReplayComparison({
      bytes: buildLifecycleReplay(spans),
      projectId: `${PROJECT_PREFIX}-lifecycle-${spans.length}`,
      fileKey: FILE_KEY,
      mediaUploadEnabled,
      overflowEnabled: overflow,
      overflowSizeLimitBytes: LIFECYCLE_OVERFLOW_LIMIT_BYTES,
      captureSideEffects: (): LifecycleEffects => ({
        lookups: effects.lookups.splice(0).sort(),
        overflowUploads: effects.overflowUploads.splice(0).sort(),
        mediaUploads: effects.mediaUploads - (effects.mediaUploads = 0),
        activity: effects.activity.splice(0),
      }),
    });

    // A failed model or prompt lookup drops that span and nothing else.
    const expectedSpanIds = spans.flatMap(({ generation }, index) =>
      (generation?.model != null &&
        modelLookupFails(salt, lifecycleModelName(generation.model))) ||
      (generation?.prompt &&
        promptLookupFails(
          salt,
          lifecyclePromptName(generation.prompt.name),
          generation.prompt.version,
        ))
        ? []
        : [lifecycleSpanId(index)],
    );
    const activityKeys = (result: OtelReplayResult) =>
      (result.sideEffects as LifecycleEffects).activity
        .map(
          ({ traceId, spanStartTimeISO, ruleIds }) =>
            `${traceId} ${spanStartTimeISO} ${ruleIds.join(",")}`,
        )
        .sort();
    const reference = comparison.originalTs.sideEffects as LifecycleEffects;

    for (const result of [
      comparison.originalTs,
      comparison.earlyTs,
      comparison.earlyRust,
    ]) {
      const observed = result.sideEffects as LifecycleEffects;
      expect(
        result.storedRows.map((row) => String(row.span_id)).sort(),
        result.mode,
      ).toEqual(expectedSpanIds);
      expect(observed.lookups, result.mode).toEqual(reference.lookups);
      expect(observed.overflowUploads, result.mode).toEqual(
        reference.overflowUploads,
      );
      if (!mediaUploadEnabled) {
        expect(observed.mediaUploads, result.mode).toBe(0);
      }
      if (!overflow) expect(observed.overflowUploads, result.mode).toEqual([]);

      // Every accepted span is recorded once for trace dispatch, and a trace's
      // recorded weight never undercounts the payload dispatch reads back.
      expect(activityKeys(result), result.mode).toEqual(
        activityKeys(comparison.originalTs),
      );
      expect(observed.activity, result.mode).toHaveLength(
        result.storedRows.length,
      );
      const recorded = sumByTrace(
        observed.activity,
        ({ traceId }) => traceId,
        ({ serializedEventBytes }) => serializedEventBytes,
      );
      const stored = sumByTrace(
        result.storedRows,
        (row) => String(row.trace_id),
        dispatchPayloadBytes,
      );
      for (const [traceId, payloadBytes] of stored) {
        expect(
          recorded.get(traceId),
          `${result.mode} ${traceId}`,
        ).toBeGreaterThanOrEqual(payloadBytes);
      }
    }
    expectRawNativeParity(comparison);
  } finally {
    dispatch.mockRestore();
    sampling.mockRestore();
    configureDefaultOtelReplayMocks();
  }
}

// Shrinking replays the queue once per step. Stop early enough that a found
// counterexample is reported instead of being lost to the Vitest timeout.
const REPORT_BEFORE_TIMEOUT_MS = 90_000;

// The replay writer retries internally; Vitest retries could overlap an
// unfinished replay and race the shared writer singleton.
describe(
  "OTEL replay adversarial properties",
  { retry: 0, timeout: 120_000 },
  () => {
    it.each([
      ["broad recursive JSON", replayCaseArbitrary(4, 4, false), []],
      [
        "edge-biased recursive JSON",
        replayCaseArbitrary(6, 7, true),
        directedCases.map((example) => [example]),
      ],
    ])(
      "persists %s input/output and recursive metadata with identity and precedence intact",
      async (name, arbitrary, examples) => {
        const seed = randomInt(2 ** 31);
        // Log before running so a Vitest timeout still leaves the input sequence reproducible.
        process.stderr.write(`OTEL replay ${name}: seed=${seed}\n`);
        await fc.assert(
          fc.asyncProperty(
            arbitrary as Arbitrary<ReplayCase>,
            assertReplayPersists,
          ),
          {
            seed,
            numRuns: 128,
            ...(examples.length > 0 ? { examples } : {}),
          },
        );
      },
    );

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

    it("keeps rows, lookups and evaluation decisions aligned when known attributes carry the wrong type", async () => {
      const seed = randomInt(2 ** 31);
      process.stderr.write(`OTEL wrong-type replay seed=${seed}\n`);
      await fc.assert(
        fc.asyncProperty(
          fc.array(wrongTypeSpanArbitrary, { minLength: 1, maxLength: 3 }),
          assertWrongTypeReplayParity,
        ),
        {
          seed,
          numRuns: 192,
          interruptAfterTimeLimit: REPORT_BEFORE_TIMEOUT_MS,
          examples: directedWrongTypeExamples.map((example) => [example]),
        },
      );
    });

    it("keeps rows, lookups, overflow uploads and trace activity aligned when lookups and uploads fail", async () => {
      const seed = randomInt(2 ** 31);
      process.stderr.write(`OTEL lifecycle replay seed=${seed}\n`);
      await fc.assert(
        fc.asyncProperty(lifecycleCaseArbitrary, assertLifecycleParity),
        {
          seed,
          numRuns: 96,
          interruptAfterTimeLimit: REPORT_BEFORE_TIMEOUT_MS,
        },
      );
    });
  },
);
