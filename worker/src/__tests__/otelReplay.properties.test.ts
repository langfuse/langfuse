import "./helpers/otelReplaySetup";

import { randomInt } from "node:crypto";
import fc, { type Arbitrary } from "fast-check";
import { describe, expect, it } from "vitest";
import type { ResourceSpan } from "@langfuse/shared/src/server";
import { runOtelReplay } from "./helpers/otelReplayHarness";
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
  promptVersion: number | null;
  version: string | null;
  release: string | null;
  environment: "span" | "lower" | "empty" | "resource";
  modelPrecedence: "canonical" | "response" | "request" | "none";
};

type ReplayCase = {
  traceId: string;
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

function paddedHex(value: bigint, digits: number): string {
  return value.toString(16).padStart(digits, "0");
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
// leaves; returning pairs preserves duplicate flattened paths.
function expectedMetadataPairs(
  metadata: Record<string, unknown>,
  prefix = "",
): Array<[string, string]> {
  return Object.entries(metadata).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return expectedMetadataPairs(value as Record<string, unknown>, path);
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
      start_time: seed.timestampPresence === "endOnly" ? end : start,
      end_time: seed.timestampPresence === "startOnly" ? start : end,
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
        traceId: Buffer.from(traceId, "hex"),
        spanId: Buffer.from(spanId, "hex"),
        ...(ordinal === 0
          ? {}
          : { parentSpanId: Buffer.from(parentSpanId, "hex") }),
        name: expected.name,
        kind: 1,
        ...(seed.timestampPresence === "endOnly"
          ? {}
          : {
              startTimeUnixNano: unixNanos(
                start,
                seed.timestampPresence === "both" ? 0 : 999_999,
              ),
            }),
        ...(seed.timestampPresence === "startOnly"
          ? {}
          : {
              endTimeUnixNano: unixNanos(
                end,
                seed.timestampPresence === "both" ? 1 : 999_999,
              ),
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
  promptVersion: null,
  version: null,
  release: null,
  environment: "resource",
  modelPrecedence: "none",
};

const directedCases: ReplayCase[] = [
  {
    traceId: paddedHex(1n, 32),
    spanIdBase: 6n,
    baseTimeMillis: 1_700_000_000_000,
    spanSeeds: [
      {
        ...minimalSpan,
        observationMetadata: {
          route: { status: "nested" },
          "route.status": "literal",
        },
        traceAttributes: [
          { key: "route.status", value: { kind: "string", value: "trace" } },
        ],
      },
    ],
  },
  {
    traceId: paddedHex(2n, 32),
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

async function assertReplayPersists(params: ReplayCase): Promise<void> {
  const replay = buildReplayCase(params);
  const { storedRows } = await runOtelReplay({
    resourceSpans: replay.resourceSpans,
    projectId: replay.projectId,
    fileKey: FILE_KEY,
  });

  expect(storedRows).toHaveLength(replay.expectedRows.length);
  const rowsBySpanId = new Map(
    storedRows.map((row) => [String(row.span_id), row]),
  );
  expect([...rowsBySpanId.keys()].sort()).toEqual(
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
  },
);
