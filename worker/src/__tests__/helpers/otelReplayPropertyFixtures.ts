import type { ResourceSpan } from "@langfuse/shared/src/server";
import type { Json } from "./arbitraries/json";

export const PROJECT_PREFIX = "otel-replay-property";
export const FILE_KEY = "otel-replay/test.json";
const RESOURCE_ENVIRONMENT = "resource-env";
const PROVIDER_MODEL = "provider-model";
export const SCOPE_NAME = "langfuse-sdk-adversarial";
export const SERVICE_NAME = "otel-property-service";
const RESOURCE_VERSION = "resource-version";
const RESOURCE_RELEASE = "resource-release";

type JsonObject = Record<string, Json>;

export type RootPayload =
  | { kind: "json"; value: Json }
  | { kind: "raw"; value: string };

export type TypedScalar =
  | { kind: "string"; value: string }
  | { kind: "int"; value: number }
  | { kind: "double"; value: number | "NaN" | "Infinity" | "-Infinity" }
  | { kind: "bool"; value: boolean };

export type MetadataAttribute = {
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

export type ReplayCase = {
  traceId: string;
  idEncoding: "buffer" | "string" | "array" | number;
  spanIdBase: bigint;
  baseTimeMillis: number;
  spanSeeds: SpanSeed[];
};

// Null means the attribute is absent; empty strings are sent verbatim.
export function stringAttributes(values: Record<string, string | null>) {
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

export function unixNanos(millis: number, remainder: number): string {
  return (BigInt(millis) * 1_000_000n + BigInt(remainder)).toString();
}

function timestampMillis(value: OtelTimestamp): number {
  return typeof value === "number"
    ? Math.trunc(value / 1e6)
    : Number(BigInt(value) / 1_000_000n);
}

export function paddedHex(value: bigint, digits: number): string {
  return value.toString(16).padStart(digits, "0");
}

// Every encoding preserves the byte, keeping generated IDs unique and parent links intact.
export const byteEncoders: ((byte: number) => Json)[] = [
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

export function buildReplayCase(params: ReplayCase) {
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

// Small defaults keep directed witnesses within the same shrinkable input domain.
export const minimalSpan: SpanSeed = {
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
