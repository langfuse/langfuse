import "./helpers/otelReplaySetup";

import fc, { type Arbitrary } from "fast-check";
import { describe, expect, it } from "vitest";
import type { ResourceSpan } from "@langfuse/shared/src/server";
import { runOtelReplay } from "./helpers/otelReplayHarness";

const PROJECT_PREFIX = "otel-replay-property";
const FILE_KEY = "otel-replay/test.json";
const RESOURCE_ENVIRONMENT = "resource-env";
const PROVIDER_MODEL = "provider-model";
const SCOPE_NAME = "langfuse-sdk-adversarial";
const SERVICE_NAME = "otel-property-service";
const RESOURCE_VERSION = "resource-version";
const RESOURCE_RELEASE = "resource-release";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
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

type ExpectedSpan = {
  spanId: string;
  parentSpanId: string;
  ordinal: number;
  name: string;
  startTimeMillis: number;
  endTimeMillis: number;
  promptVersion: number | null;
  input: string;
  output: string;
  metadata: Record<string, unknown>;
  release: string;
  version: string;
  environment: string;
  modelName: string;
  traceName: string;
};

function stringAttribute(key: string, value: string) {
  return { key, value: { stringValue: value } };
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
      "kind" in attribute.value && attribute.value.kind === "array"
        ? { arrayValue: { values: attribute.value.values.map(encodeScalar) } }
        : encodeScalar(attribute.value),
  };
}

function typedAttributeValue(attribute: MetadataAttribute): unknown {
  if ("kind" in attribute.value && attribute.value.kind === "array") {
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

// JSON-encoded values canonicalize -0 to 0 before transport and comparison.
function canonicalJson(value: Json): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function canonicalObject(value: JsonObject): JsonObject {
  return canonicalJson(value) as JsonObject;
}

function rootPayloadText(value: RootPayload): string {
  return value.kind === "json"
    ? JSON.stringify(canonicalJson(value.value))
    : value.value;
}

function metadataFromSource(
  raw: JsonObject,
  attributes: MetadataAttribute[],
): Record<string, unknown> {
  const dottedValues = Object.fromEntries(
    attributes.map((attribute) => [
      attribute.key,
      typedAttributeValue(attribute),
    ]),
  );
  // OTEL's raw JSON metadata is merged first; prefixed attributes then replace
  // an identical top-level key while leaving literal-dot/nested collisions.
  return { ...canonicalObject(raw), ...dottedValues };
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

function buildReplayCase(params: ReplayCase): {
  projectId: string;
  traceId: string;
  resourceSpans: ResourceSpan[];
  expectedSpans: ExpectedSpan[];
} {
  const traceId = params.traceId;
  const projectId = `${PROJECT_PREFIX}-${traceId}`;
  const spanIds = params.spanSeeds.map((_, ordinal) =>
    paddedHex(params.spanIdBase - BigInt(ordinal), 16),
  );

  const expectedSpans: ExpectedSpan[] = spanIds.map((spanId, ordinal) => {
    const seed = params.spanSeeds[ordinal];
    const timestampMillis = params.baseTimeMillis + ordinal * 1_000;
    const endMillis = timestampMillis + 250;
    const parentOrdinal =
      ordinal === 0 ? undefined : seed.parentSelector % ordinal;
    const marker = `${traceId}-${ordinal}`;
    const modelName =
      seed.modelPrecedence === "canonical"
        ? `explicit-model-${marker}`
        : seed.modelPrecedence === "response"
          ? `response-model-${marker}`
          : seed.modelPrecedence === "request"
            ? `request-model-${marker}`
            : "";

    return {
      spanId,
      ordinal,
      parentSpanId: parentOrdinal === undefined ? "" : spanIds[parentOrdinal],
      name: `property-span-${marker}`,
      startTimeMillis:
        seed.timestampPresence === "endOnly" ? endMillis : timestampMillis,
      endTimeMillis:
        seed.timestampPresence === "startOnly" ? timestampMillis : endMillis,
      promptVersion: seed.promptVersion,
      input: rootPayloadText(seed.input),
      output: rootPayloadText(seed.output),
      metadata: expectedMetadata(seed),
      release: seed.release ?? RESOURCE_RELEASE,
      version: seed.version ?? RESOURCE_VERSION,
      environment:
        seed.environment === "span"
          ? `span-env-${traceId.slice(-8)}-${ordinal}`
          : RESOURCE_ENVIRONMENT,
      modelName,
      traceName: `property-trace-${traceId}`,
    };
  });

  const spans = expectedSpans.map((expected, ordinal) => {
    const seed = params.spanSeeds[ordinal];
    const marker = `${traceId}-${ordinal}`;
    const attributes = [
      stringAttribute("langfuse.observation.type", "generation"),
      stringAttribute("langfuse.observation.input", expected.input),
      stringAttribute("langfuse.observation.output", expected.output),
      stringAttribute(
        "gen_ai.input.messages",
        JSON.stringify([{ role: "user", content: `provider-input-${marker}` }]),
      ),
      stringAttribute(
        "gen_ai.output.messages",
        JSON.stringify([
          { role: "assistant", content: `provider-output-${marker}` },
        ]),
      ),
      stringAttribute(
        "gen_ai.request.model",
        seed.modelPrecedence === "request"
          ? expected.modelName
          : seed.modelPrecedence === "none"
            ? ""
            : PROVIDER_MODEL,
      ),
      ...(seed.promptVersion === null
        ? []
        : [
            stringAttribute(
              "langfuse.observation.prompt.version",
              String(seed.promptVersion),
            ),
          ]),
      stringAttribute(
        "gen_ai.response.model",
        seed.modelPrecedence === "request" || seed.modelPrecedence === "none"
          ? ""
          : seed.modelPrecedence === "response"
            ? expected.modelName
            : `response-model-${marker}`,
      ),
      stringAttribute("langfuse.trace.name", expected.traceName),
      stringAttribute(
        "langfuse.observation.metadata",
        JSON.stringify(canonicalObject(seed.observationMetadata)),
      ),
      stringAttribute(
        "langfuse.trace.metadata",
        JSON.stringify(canonicalObject(seed.traceMetadata)),
      ),
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

    attributes.push(
      stringAttribute(
        "langfuse.observation.model.name",
        seed.modelPrecedence === "canonical" ? expected.modelName : "",
      ),
    );
    if (seed.version !== null) {
      attributes.push(stringAttribute("langfuse.version", seed.version));
    }
    if (seed.release !== null) {
      attributes.push(stringAttribute("langfuse.release", seed.release));
    }
    if (seed.environment === "span") {
      attributes.push(
        stringAttribute("langfuse.environment", expected.environment),
      );
    } else if (seed.environment === "lower") {
      attributes.push(
        stringAttribute("deployment.environment.name", "span-fallback-env"),
      );
    } else if (seed.environment === "empty") {
      attributes.push(stringAttribute("langfuse.environment", ""));
    }

    const timestampMillis = params.baseTimeMillis + ordinal * 1_000;
    const timestampFields =
      seed.timestampPresence === "both"
        ? {
            startTimeUnixNano: unixNanos(timestampMillis, 0),
            endTimeUnixNano: unixNanos(timestampMillis + 250, 1),
          }
        : seed.timestampPresence === "endOnly"
          ? { endTimeUnixNano: unixNanos(timestampMillis + 250, 999_999) }
          : { startTimeUnixNano: unixNanos(timestampMillis, 999_999) };

    return {
      orderKey: seed.orderKey,
      span: {
        traceId: Buffer.from(traceId, "hex"),
        spanId: Buffer.from(expected.spanId, "hex"),
        ...(expected.ordinal === 0
          ? {}
          : { parentSpanId: Buffer.from(expected.parentSpanId, "hex") }),
        name: expected.name,
        kind: 1,
        ...timestampFields,
        attributes,
        status: { code: 0 },
      },
    };
  });

  return {
    projectId,
    traceId,
    expectedSpans,
    resourceSpans: [
      {
        resource: {
          attributes: [
            stringAttribute("service.name", SERVICE_NAME),
            stringAttribute("service.version", RESOURCE_VERSION),
            stringAttribute("langfuse.environment", RESOURCE_ENVIRONMENT),
            stringAttribute("langfuse.release", RESOURCE_RELEASE),
          ],
        },
        scopeSpans: [
          {
            scope: { name: SCOPE_NAME, version: "1.0.0" },
            // Children are shuffled and the root remains last in the batch.
            spans: [
              ...spans
                .slice(1)
                .sort((left, right) => left.orderKey - right.orderKey)
                .map(({ span }) => span),
              spans[0].span,
            ],
          },
        ],
      },
    ],
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

const jsonKeyArbitrary = fc.oneof(
  { withCrossShrink: true },
  fc.string({ maxLength: 12, unit: "grapheme" }),
  fc.constantFrom("", "a.b", "__proto__", "constructor", "prototype", "🌍\n"),
);

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

function recursiveJsonArbitrary(
  depth: number,
  maxWidth: number,
): Arbitrary<Json> {
  const leaf = fc.oneof(
    { withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.string({ maxLength: 24, unit: "grapheme" }),
  ) as Arbitrary<Json>;
  if (depth === 0) return leaf;

  return fc.oneof(
    { withCrossShrink: true },
    { weight: 4, arbitrary: leaf },
    {
      weight: 2,
      arbitrary: fc.array(recursiveJsonArbitrary(depth - 1, maxWidth), {
        maxLength: maxWidth,
      }),
    },
    {
      weight: 2,
      arbitrary: fc.dictionary(
        jsonKeyArbitrary,
        recursiveJsonArbitrary(depth - 1, maxWidth),
        { maxKeys: maxWidth },
      ),
    },
  );
}

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
            .map(
              (witness) =>
                Object.fromEntries([
                  ["route", { status: witness.nestedStatus }],
                  ["route.status", witness.literalStatus],
                  [
                    "langgraph",
                    {
                      messages: witness.messages,
                      state: { values: witness.wide },
                    },
                  ],
                  ["resourceAttributes", { custom: { deep: witness.deep } }],
                  [
                    "scope",
                    {
                      name: "generated-scope",
                      attributes: { values: witness.wide },
                    },
                  ],
                ]) as JsonObject,
            ),
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

  expect(storedRows).toHaveLength(replay.expectedSpans.length);
  const rowsBySpanId = new Map(
    storedRows.map((row) => [String(row.span_id), row]),
  );
  expect([...rowsBySpanId.keys()].sort()).toEqual(
    replay.expectedSpans.map((span) => span.spanId).sort(),
  );

  for (const expected of replay.expectedSpans) {
    const row = rowsBySpanId.get(expected.spanId);
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      project_id: replay.projectId,
      trace_id: replay.traceId,
      span_id: expected.spanId,
      parent_span_id: expected.parentSpanId,
      name: expected.name,
      type: "GENERATION",
      environment: expected.environment,
      version: expected.version,
      release: expected.release,
      trace_name: expected.traceName,
      prompt_version: expected.promptVersion,
      provided_model_name: expected.modelName,
      service_name: SERVICE_NAME,
      service_version: RESOURCE_VERSION,
      scope_name: SCOPE_NAME,
      scope_version: "1.0.0",
      source: "otel",
      ingestion_sdk_name: "otel-replay",
      ingestion_sdk_version: "test",
      blob_storage_file_path: FILE_KEY,
    });
    // Langfuse input/output strings, including invalid JSON and whitespace, are preserved.
    expect(row?.input).toBe(expected.input);
    expect(row?.output).toBe(expected.output);

    const names = row?.metadata_names;
    const values = row?.metadata_values;
    if (!Array.isArray(names) || !Array.isArray(values)) {
      throw new Error("Persisted metadata names and values must be arrays");
    }
    expect(names).toHaveLength(values.length);
    const expectedPairs = expectedMetadataPairs(expected.metadata);
    expect(names).toEqual(expectedPairs.map(([name]) => name));
    expect(values).toEqual(expectedPairs.map(([, value]) => value));

    expect(persistedMillis(row?.start_time)).toBe(expected.startTimeMillis);
    expect(persistedMillis(row?.end_time)).toBe(expected.endTimeMillis);
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
      async (_name, arbitrary, examples) => {
        await fc.assert(
          fc.asyncProperty(
            arbitrary as Arbitrary<ReplayCase>,
            assertReplayPersists,
          ),
          {
            numRuns: 128,
            ...(examples.length > 0 ? { examples } : {}),
          },
        );
      },
    );
  },
);
