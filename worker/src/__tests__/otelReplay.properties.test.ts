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
  input: Json;
  output: Json;
  observationMetadata: JsonObject;
  traceMetadata: JsonObject;
  observationAttributes: MetadataAttribute[];
  traceAttributes: MetadataAttribute[];
  parentSelector: number;
  orderKey: number;
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
  promptVersion: number;
  input: Json;
  output: Json;
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

// JSON is the transport contract for these roots. This also canonicalizes -0
// to 0 before the generated value is used in both the payload and oracle.
function canonicalJson(value: Json): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function canonicalObject(value: JsonObject): JsonObject {
  return canonicalJson(value) as JsonObject;
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

// Independent test-side witness for the persisted flattened metadata contract.
// Arrays stay leaves, objects recurse, and each leaf is converted as a JSON
// value for ClickHouse's Array(String) column. Returning pairs keeps collisions.
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
    const variant = ordinal % 3;
    const timestampMillis = params.baseTimeMillis + ordinal * 1_000;
    const parentOrdinal =
      ordinal === 0 ? undefined : seed.parentSelector % ordinal;
    const marker = `${traceId}-${ordinal}`;

    return {
      spanId,
      ordinal,
      parentSpanId: parentOrdinal === undefined ? "" : spanIds[parentOrdinal],
      name: `property-span-${marker}`,
      startTimeMillis: timestampMillis,
      endTimeMillis: variant === 0 ? timestampMillis + 250 : timestampMillis,
      promptVersion: [0, 1, 65_535][variant],
      input: canonicalJson(seed.input),
      output: canonicalJson(seed.output),
      metadata: expectedMetadata(seed),
      release:
        variant === 0
          ? `span-release-${marker}`
          : variant === 1
            ? ""
            : RESOURCE_RELEASE,
      version:
        variant === 0
          ? `span-version-${marker}`
          : variant === 1
            ? ""
            : RESOURCE_VERSION,
      environment:
        variant === 0
          ? `span-env-${traceId.slice(-8)}-${ordinal}`
          : RESOURCE_ENVIRONMENT,
      modelName:
        variant === 0 ? `explicit-model-${marker}` : `response-model-${marker}`,
      traceName: `property-trace-${traceId}`,
    };
  });

  const spans = expectedSpans.map((expected, ordinal) => {
    const seed = params.spanSeeds[ordinal];
    const marker = `${traceId}-${ordinal}`;
    const variant = ordinal % 3;
    const attributes = [
      stringAttribute("langfuse.observation.type", "generation"),
      stringAttribute(
        "langfuse.observation.input",
        JSON.stringify(expected.input),
      ),
      stringAttribute(
        "langfuse.observation.output",
        JSON.stringify(expected.output),
      ),
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
      stringAttribute("gen_ai.request.model", PROVIDER_MODEL),
      stringAttribute(
        "langfuse.observation.prompt.version",
        String(expected.promptVersion),
      ),
      stringAttribute("gen_ai.response.model", `response-model-${marker}`),
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

    if (variant === 0) {
      attributes.push(
        stringAttribute("langfuse.observation.model.name", expected.modelName),
        stringAttribute("langfuse.version", expected.version),
        stringAttribute("langfuse.release", expected.release),
        stringAttribute("langfuse.environment", expected.environment),
      );
    } else if (variant === 1) {
      // Present empty values take precedence over resource version/release.
      attributes.push(
        stringAttribute("langfuse.version", ""),
        stringAttribute("langfuse.release", ""),
        stringAttribute("deployment.environment.name", "span-fallback-env"),
      );
    } else {
      // A blank canonical model is ignored, so the response model wins.
      attributes.push(stringAttribute("langfuse.observation.model.name", ""));
    }

    const timestampMillis = params.baseTimeMillis + ordinal * 1_000;
    const timestampFields =
      variant === 0
        ? {
            startTimeUnixNano: unixNanos(timestampMillis, 0),
            endTimeUnixNano: unixNanos(timestampMillis + 250, 1),
          }
        : variant === 1
          ? { endTimeUnixNano: unixNanos(timestampMillis, 999_999) }
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
    // Empty suffixes are ignored; prototype assignment and tool-normalizer
    // reserved forms are outside this property input domain.
    key !== "" &&
    key !== "__proto__" &&
    key !== "tools" &&
    key !== "attributes",
);

function recursiveJsonArbitrary(
  depth: number,
  maxWidth: number,
): Arbitrary<Json> {
  const leaf = fc.oneof(
    fc.constant(null),
    fc.boolean(),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.string({ maxLength: 24, unit: "grapheme" }),
  ) as Arbitrary<Json>;
  if (depth === 0) return leaf;

  return fc.oneof(
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
    fc.string({ maxLength: 20, unit: "grapheme" }).map((value) => ({
      kind: "string" as const,
      value,
    })),
    fc.integer({ min: -1_000_000, max: 1_000_000 }).map((value) => ({
      kind: "int" as const,
      value,
    })),
    fc
      .oneof(
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        fc.constantFrom(
          "NaN" as const,
          "Infinity" as const,
          "-Infinity" as const,
        ),
      )
      .map((value) => ({ kind: "double" as const, value })),
    fc.boolean().map((value) => ({ kind: "bool" as const, value })),
  ) as Arbitrary<TypedScalar>;
}

function metadataAttributeArbitrary(
  keyArbitrary: Arbitrary<string>,
): Arbitrary<MetadataAttribute> {
  const scalar = scalarAttributeArbitrary();
  return fc.record({
    key: keyArbitrary,
    value: fc.oneof(
      scalar,
      fc.array(scalar, { maxLength: 4 }).map((values) => ({
        kind: "array" as const,
        values,
      })),
    ),
  });
}

function replayCaseArbitrary(
  depth: number,
  maxWidth: number,
  biased: boolean,
): Arbitrary<ReplayCase> {
  const broadJson = recursiveJsonArbitrary(depth, maxWidth);
  const jsonValue = biased
    ? fc.oneof(
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
        { weight: 2, arbitrary: metadataAttributeKeyArbitrary },
        {
          weight: 5,
          arbitrary: fc.constantFrom(
            "a.b",
            "route.status",
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
    traceId: fc
      .stringMatching(/^[0-9a-f]{32}$/)
      .filter((id) => id !== "0".repeat(32)),
    spanIdBase: fc.bigInt({ min: 6n, max: (1n << 64n) - 1n }),
    baseTimeMillis: fc.integer({
      min: 1_700_000_000_000,
      max: 1_800_000_000_000,
    }),
    spanSeeds: fc.array(
      fc.record({
        input: jsonValue,
        output: jsonValue,
        observationMetadata: metadataRoot,
        traceMetadata: metadataRoot,
        observationAttributes: metadataAttrs,
        traceAttributes: metadataAttrs,
        parentSelector: fc.nat(65_535),
        orderKey: fc.integer(),
      }),
      { minLength: 3, maxLength: 6 },
    ),
  });
}

const directedCases: ReplayCase[] = [
  {
    traceId: "00000000000000000000000000000001",
    spanIdBase: 6n,
    baseTimeMillis: 1_700_000_000_000,
    spanSeeds: [
      {
        input: null,
        output: "",
        observationMetadata: JSON.parse(
          '{"route":{"status":"nested observation","deep":{"leaf":1}},"route.status":"literal observation","emptyObject":{},"emptyArray":[],"nullLeaf":null,"__proto__":{"preserved":true},"constructor":{"prototype":"safe"},"langgraph":{"checkpoint_ns":"root","step":2,"parents":["root","child"],"messages":[{"type":"human","content":[{"type":"text","text":"hello"}]},{"type":"ai","content":[{"type":"text","text":"world"}]}]}}',
        ),
        traceMetadata: JSON.parse(
          '{"route":{"status":"nested trace"},"route.status":"literal trace","winner":"trace"}',
        ),
        observationAttributes: [
          {
            key: "route.status",
            value: { kind: "string", value: "dotted observation" },
          },
          {
            key: "typedArray",
            value: {
              kind: "array",
              values: [
                { kind: "string", value: "x" },
                { kind: "int", value: 2 },
                { kind: "double", value: -0 },
                { kind: "bool", value: false },
              ],
            },
          },
          { key: "typedSpecial", value: { kind: "double", value: "Infinity" } },
          { key: "prototype", value: { kind: "string", value: "safe" } },
        ],
        traceAttributes: [
          { key: "route.status", value: { kind: "int", value: 7 } },
          { key: "winner", value: { kind: "bool", value: true } },
        ],
        parentSelector: 0,
        orderKey: 2,
      },
      {
        input: [null, false, [], {}],
        output: { empty: "", controls: "\u0000\n\r\t", unicode: "🌍\u2028🧪" },
        observationMetadata: {
          "scope.name": "metadata scope",
          messages: ["a", { content: [null, "b"] }],
        },
        traceMetadata: {},
        observationAttributes: [],
        traceAttributes: [],
        parentSelector: 0,
        orderKey: 1,
      },
      {
        input: JSON.parse(
          '{"__proto__":{"value":"kept"},"constructor":{"prototype":false},"a.b":"literal","nested":{"a":{"b":"nested"}}}',
        ) as Json,
        output: [
          { role: "assistant", content: [{ type: "text", text: "ok" }] },
        ],
        observationMetadata: { resourceAttributes: { custom: "user wins" } },
        traceMetadata: { resourceAttributes: { nested: ["trace", null] } },
        observationAttributes: [],
        traceAttributes: [],
        parentSelector: 1,
        orderKey: 0,
      },
    ],
  },
  {
    traceId: "ffffffffffffffffffffffffffffffff",
    spanIdBase: (1n << 64n) - 1n,
    baseTimeMillis: 1_800_000_000_000,
    spanSeeds: [
      {
        input: { deep: { one: { two: { three: { four: ["last", null] } } } } },
        output: ["a", "b", "c", "d", "e", "f", "g", "h"],
        observationMetadata: Object.fromEntries(
          Array.from({ length: 8 }, (_, index) => [
            `wide${index}`,
            { nested: [index, null, "🌍"] },
          ]),
        ),
        traceMetadata: {},
        observationAttributes: [],
        traceAttributes: [],
        parentSelector: 0,
        orderKey: 5,
      },
      {
        input: { messages: [{ role: "user", content: "question" }] },
        output: { messages: [{ role: "assistant", content: "answer" }] },
        observationMetadata: {
          graph: {
            nodes: ["root", "child"],
            state: { messages: ["one", "two"] },
          },
        },
        traceMetadata: { graph: { state: { messages: ["trace wins"] } } },
        observationAttributes: [],
        traceAttributes: [],
        parentSelector: 0,
        orderKey: 4,
      },
      {
        input: [],
        output: {},
        observationMetadata: {},
        traceMetadata: {},
        observationAttributes: [],
        traceAttributes: [],
        parentSelector: 1,
        orderKey: 3,
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
    expect(JSON.parse(String(row?.input))).toEqual(expected.input);
    expect(JSON.parse(String(row?.output))).toEqual(expected.output);

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
