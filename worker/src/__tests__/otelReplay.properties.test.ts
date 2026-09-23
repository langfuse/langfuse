import "./helpers/otelReplaySetup";

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ResourceSpan } from "@langfuse/shared/src/server";
import { runOtelReplay } from "./helpers/otelReplayHarness";

const PROJECT_PREFIX = "otel-replay-property";
const FILE_KEY = "otel-replay/test.json";
const RESOURCE_ENVIRONMENT = "resource-env";
const PROVIDER_MODEL = "provider-model";

type ReplayCase = {
  traceId: string;
  spanIdBase: bigint;
  baseTimeMillis: number;
  spanSeeds: SpanSeed[];
};

type SpanSeed = {
  generatedJson: unknown;
  parentSelector: number;
  orderKey: number;
};

type ExpectedSpan = {
  spanId: string;
  parentSpanId: string;
  ordinal: number;
  name: string;
  startTimeMillis: number;
  endTimeMillis: number;
  promptVersion: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
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

function unixNanos(millis: number, remainder: number): string {
  return (BigInt(millis) * 1_000_000n + BigInt(remainder)).toString();
}

function paddedHex(value: bigint, digits: number): string {
  return value.toString(16).padStart(digits, "0");
}

function createPayloads(
  traceId: string,
  ordinal: number,
  generatedJson: unknown,
): { input: Record<string, unknown>; output: Record<string, unknown> } {
  const marker = `${traceId}-${ordinal}`;
  const input = {
    marker,
    emptyString: "",
    emptyArray: [],
    emptyObject: {},
    nullValue: null,
    booleanValues: [false, true],
    numbers: [Number.MIN_VALUE, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER],
    // These are ordinary JSON payload keys, not metadata paths to expand.
    specialKeys: JSON.parse(
      '{"__proto__":{"value":"kept"},"constructor":{"prototype":false},"a.b":"literal"}',
    ),
    escapedKey: {
      "": "",
      "line\nbreak": 'nul\u0000 tab\t quote" slash/ backslash\\ \u2028 🌍',
      loneSurrogates: "\ud800 and \udc00",
    },
    generatedJson,
  };
  const output = {
    marker: `output-${marker}`,
    values: [null, false, "", generatedJson],
  };

  return { input, output };
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
    const marker = `${traceId}-${ordinal}`;
    const { input, output } = createPayloads(
      traceId,
      ordinal,
      structuredClone(params.spanSeeds[ordinal].generatedJson),
    );
    const observationMetadata = `observation-${marker}`;
    const traceMetadata = `trace-${marker}`;
    const variant = ordinal % 3;
    const timestampMillis = params.baseTimeMillis + ordinal * 1_000;
    const parentOrdinal =
      ordinal === 0
        ? undefined
        : params.spanSeeds[ordinal].parentSelector % ordinal;
    const environment =
      variant === 0
        ? `span-env-${traceId.slice(-8)}-${ordinal}`
        : RESOURCE_ENVIRONMENT;
    const version =
      variant === 0
        ? `span-version-${marker}`
        : variant === 1
          ? ""
          : "resource-version";
    const release =
      variant === 0
        ? `span-release-${marker}`
        : variant === 1
          ? ""
          : "resource-release";
    const modelName =
      variant === 0 ? `explicit-model-${marker}` : `response-model-${marker}`;

    return {
      spanId,
      ordinal,
      parentSpanId: parentOrdinal === undefined ? "" : spanIds[parentOrdinal],
      name: `property-span-${marker}`,
      startTimeMillis: timestampMillis,
      endTimeMillis: variant === 0 ? timestampMillis + 250 : timestampMillis,
      promptVersion: [0, 1, 65_535][variant],
      input,
      output,
      metadata: {
        "resourceAttributes.service.name": "otel-property-service",
        "resourceAttributes.service.version": "resource-version",
        "resourceAttributes.langfuse.environment": RESOURCE_ENVIRONMENT,
        "resourceAttributes.langfuse.release": "resource-release",
        "scope.name": "langfuse-sdk-adversarial",
        "scope.version": "1.0.0",
        winner: traceMetadata,
        observationOnly: observationMetadata,
        traceOnly: traceMetadata,
      },
      release,
      version,
      environment,
      modelName,
      traceName: `property-trace-${traceId}`,
    };
  });

  const spans = expectedSpans.map((expected, ordinal) => {
    const marker = `${traceId}-${ordinal}`;
    const providerInput = JSON.stringify([
      { role: "user", content: `provider-input-${marker}` },
    ]);
    const providerOutput = JSON.stringify([
      { role: "assistant", content: `provider-output-${marker}` },
    ]);

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
      stringAttribute("gen_ai.input.messages", providerInput),
      stringAttribute("gen_ai.output.messages", providerOutput),
      stringAttribute("gen_ai.request.model", PROVIDER_MODEL),
      stringAttribute(
        "langfuse.observation.prompt.version",
        String(expected.promptVersion),
      ),
      stringAttribute("gen_ai.response.model", `response-model-${marker}`),
      stringAttribute("langfuse.trace.name", expected.traceName),
      stringAttribute(
        "langfuse.observation.metadata",
        JSON.stringify({
          winner: `observation-${marker}`,
          observationOnly: `observation-${marker}`,
        }),
      ),
      stringAttribute(
        "langfuse.trace.metadata",
        JSON.stringify({
          winner: `trace-${marker}`,
          traceOnly: `trace-${marker}`,
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
      // Empty version/release are valid present values and take precedence
      // over resource defaults. The environment alias loses to the resource's
      // earlier Langfuse key in the processor's key-first lookup.
      attributes.push(
        stringAttribute("langfuse.version", ""),
        stringAttribute("langfuse.release", ""),
        stringAttribute("deployment.environment.name", "span-fallback-env"),
      );
    } else {
      // A blank canonical model is ignored, so gen_ai.response.model wins.
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
          ? {
              // A missing start is inferred from the end; 999999 nanos are
              // truncated to the same stored millisecond.
              endTimeUnixNano: unixNanos(timestampMillis, 999_999),
            }
          : {
              // A missing end is inferred from the start at the same boundary.
              startTimeUnixNano: unixNanos(timestampMillis, 999_999),
            };

    return {
      orderKey: params.spanSeeds[ordinal].orderKey,
      span: {
        traceId: Buffer.from(traceId, "hex"),
        spanId: Buffer.from(expected.spanId, "hex"),
        ...(expected.ordinal === 0
          ? {}
          : {
              parentSpanId: Buffer.from(expected.parentSpanId, "hex"),
            }),
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
            stringAttribute("service.name", "otel-property-service"),
            stringAttribute("service.version", "resource-version"),
            stringAttribute("langfuse.environment", RESOURCE_ENVIRONMENT),
            stringAttribute("langfuse.release", "resource-release"),
          ],
        },
        scopeSpans: [
          {
            scope: { name: "langfuse-sdk-adversarial", version: "1.0.0" },
            // Children are shuffled by independently generated order keys;
            // keep the root last so every batch is out of parent-first order.
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

function persistedMetadata(
  row: Record<string, unknown>,
): Record<string, string> {
  const names = row.metadata_names;
  const values = row.metadata_values;
  if (
    !Array.isArray(names) ||
    !Array.isArray(values) ||
    names.length !== values.length
  ) {
    throw new Error(
      "Persisted metadata names and values must be aligned arrays",
    );
  }

  return Object.fromEntries(
    names.map((name, index) => [String(name), String(values[index])]),
  );
}

// The writer retries internally. Vitest retries could overlap an unfinished
// ClickHouse replay and race the shared writer singleton.
describe(
  "OTEL replay adversarial properties",
  { retry: 0, timeout: 120_000 },
  () => {
    it("persists shuffled parent-linked spans with JSON, precedence, and numeric boundaries intact", async () => {
      const replayCaseArbitrary = fc.record({
        traceId: fc
          .stringMatching(/^[0-9a-f]{32}$/)
          .filter((id) => id !== "0".repeat(32)),
        // Avoid Number conversion so IDs above 2^53 keep every bit. Reserve
        // enough nonzero IDs for the largest batch, counting down from the base.
        spanIdBase: fc.bigInt({ min: 6n, max: (1n << 64n) - 1n }),
        // Stay well inside ClickHouse DateTime64's supported range while varying
        // the UTC date and exercising nanosecond-to-millisecond conversion.
        baseTimeMillis: fc.integer({
          min: 1_700_000_000_000,
          max: 1_800_000_000_000,
        }),
        spanSeeds: fc.array(
          fc.record({
            generatedJson: fc.jsonValue({
              maxDepth: 3,
              stringUnit: "grapheme",
            }),
            parentSelector: fc.nat(65_535),
            orderKey: fc.integer(),
          }),
          { minLength: 3, maxLength: 6 },
        ),
      });

      await fc.assert(
        fc.asyncProperty(replayCaseArbitrary, async (params) => {
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
              service_name: "otel-property-service",
              service_version: "resource-version",
              scope_name: "langfuse-sdk-adversarial",
              scope_version: "1.0.0",
              source: "otel",
              ingestion_sdk_name: "otel-replay",
              ingestion_sdk_version: "test",
              blob_storage_file_path: FILE_KEY,
            });

            expect(JSON.parse(String(row?.input))).toEqual(expected.input);
            expect(JSON.parse(String(row?.output))).toEqual(expected.output);
            expect(persistedMetadata(row!)).toEqual(expected.metadata);
            expect(persistedMillis(row?.start_time)).toBe(
              expected.startTimeMillis,
            );
            expect(persistedMillis(row?.end_time)).toBe(expected.endTimeMillis);
          }
        }),
        {
          numRuns: 64,
          // These fixed examples guarantee minimum and maximum batch sizes,
          // shuffled child order, chain and branch parent links, and boundary
          // dates. Every batch carries all nano and prompt-version edges.
          examples: [
            [
              {
                traceId: "00000000000000000000000000000001",
                spanIdBase: 6n,
                baseTimeMillis: 1_700_000_000_000,
                spanSeeds: [
                  { generatedJson: null, parentSelector: 0, orderKey: 2 },
                  { generatedJson: "", parentSelector: 0, orderKey: 1 },
                  {
                    generatedJson: [null, false, []],
                    parentSelector: 1,
                    orderKey: 0,
                  },
                ],
              },
            ],
            [
              {
                traceId: "ffffffffffffffffffffffffffffffff",
                spanIdBase: (1n << 64n) - 1n,
                baseTimeMillis: 1_800_000_000_000,
                spanSeeds: [
                  {
                    generatedJson: {
                      empty: "",
                      control: "\u0000\n\r\t",
                      unicode: "🌍🧪",
                      nested: [null, false, {}, []],
                    },
                    parentSelector: 0,
                    orderKey: 5,
                  },
                  {
                    generatedJson: [null, true],
                    parentSelector: 0,
                    orderKey: 4,
                  },
                  {
                    generatedJson: { child: "two" },
                    parentSelector: 1,
                    orderKey: 3,
                  },
                  { generatedJson: [], parentSelector: 2, orderKey: 2 },
                  { generatedJson: {}, parentSelector: 1, orderKey: 1 },
                  {
                    generatedJson: ["last", null],
                    parentSelector: 4,
                    orderKey: 0,
                  },
                ],
              },
            ],
          ],
        },
      );
    });
  },
);
