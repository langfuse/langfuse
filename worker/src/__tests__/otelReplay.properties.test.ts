import "./helpers/otelReplaySetup";

import { randomInt } from "node:crypto";
import fc, { type Arbitrary } from "fast-check";
import { describe, expect, it } from "vitest";
import {
  expectRawNativeParity,
  runOtelReplayComparison,
} from "./helpers/otelReplayHarness";
import {
  FILE_KEY,
  buildReplayCase,
  byteEncoders,
  minimalSpan,
  paddedHex,
  type MetadataAttribute,
  type ReplayCase,
  type RootPayload,
  type TypedScalar,
} from "./helpers/otelReplayPropertyFixtures";
import {
  type Json,
  jsonKeyArbitrary,
  recursiveJsonArbitrary,
} from "./helpers/arbitraries/json";

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
  },
);
