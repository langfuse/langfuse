import "./helpers/otelReplaySetup";

import { randomInt } from "node:crypto";
import fc, { type Arbitrary } from "fast-check";
import { describe, expect, it } from "vitest";
import type { ResourceSpan } from "@langfuse/shared/src/server";
import {
  expectRawNativeParity,
  runOtelReplayComparison,
} from "./helpers/otelReplayHarness";
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
  const wire =
    encoding === "string"
      ? hex
      : encoding === "buffer"
        ? { type: "Buffer", data: bytes }
        : encoding === "array"
          ? bytes
          : bytes.map((byte, index) =>
              byteEncoders[(encoding + index) % byteEncoders.length]!(byte),
            );
  // ResourceSpan types describe protobuf output; replay also accepts JSON ID forms.
  return wire as unknown as Buffer;
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
    const persistedValue =
      value === null || value === undefined
        ? ""
        : typeof value === "string"
          ? value
          : JSON.stringify(value);
    return [[path, persistedValue]];
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
    const startTimestamp = seed.numericTimestamps
      ? Number(
          unixNanos(start, seed.timestampPresence === "both" ? 0 : 999_936),
        )
      : unixNanos(start, seed.timestampPresence === "both" ? 0 : 999_999);
    const endTimestamp = seed.numericTimestamps
      ? Number(unixNanos(end, seed.timestampPresence === "both" ? 1 : 999_936))
      : unixNanos(end, seed.timestampPresence === "both" ? 1 : 999_999);
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
      "gen_ai.request.model":
        seed.modelPrecedence === "request"
          ? modelName
          : seed.modelPrecedence === "none"
            ? ""
            : PROVIDER_MODEL,
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
      "langfuse.environment":
        seed.environment === "span"
          ? expected.environment
          : seed.environment === "empty"
            ? ""
            : null,
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
  const movedTools =
    attributes === "none"
      ? {}
      : {
          attributes:
            attributes === "object"
              ? { "ai.prompt.tools": [definition] }
              : JSON.stringify({
                  "ai.prompt.tools":
                    attributes === "stringified"
                      ? [definition]
                      : JSON.stringify({ name: "invalid" }),
                }),
        };
  return providerAttribute(
    "langfuse.observation.metadata",
    JSON.stringify({
      ...(root ? { tools: [definition] } : {}),
      ...movedTools,
    }),
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
          scope: { name: seed.scope, version: "1.0.0" },
          spans: [
            {
              ...spans[index]!,
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

const directedProviderExamples: ProviderReplaySeed[][] = [
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
          fc.array(providerReplayArbitrary, { minLength: 1, maxLength: 6 }),
          assertProviderReplayParity,
        ),
        {
          seed,
          numRuns: 256,
          examples: directedProviderExamples.map((example) => [example]),
        },
      );
    });
  },
);
