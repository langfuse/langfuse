import { describe, it, expect, beforeEach, vi } from "vitest";

const { recordIncrementMock } = vi.hoisted(() => ({
  recordIncrementMock: vi.fn(),
}));

vi.mock("../instrumentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../instrumentation")>();
  return {
    ...actual,
    recordIncrement: recordIncrementMock,
  };
});

vi.mock("../redis/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../redis/redis")>()),
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

const PROJECT_ID = "test-project-15372";

const createProcessor = () =>
  new OtelIngestionProcessor({
    projectId: PROJECT_ID,
    publicKey: "pk-test",
    sdkName: "python",
    sdkVersion: "3.8.1",
  });

type OtelAttribute = { key: string; value: Record<string, unknown> };

const buildBatch = (
  scopeName: string,
  attributes: OtelAttribute[],
): ResourceSpan[] => [
  {
    resource: {
      attributes: [{ key: "service.name", value: { stringValue: "test-svc" } }],
    },
    scopeSpans: [
      {
        scope: {
          name: scopeName,
          version: "1.0.0",
          attributes: [],
        },
        spans: [
          {
            traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
            spanId: Buffer.from("0123456789abcdef", "hex"),
            name: "test-span",
            kind: 1,
            startTimeUnixNano: "1752384000000000000",
            endTimeUnixNano: "1752384001000000000",
            attributes: [...attributes],
            status: {},
          },
        ],
      },
    ],
  },
];

const THIRD_PARTY_METRIC = "langfuse.ingestion.otel.third_party_unmasked_span";

describe("OTel third-party masking gap detection (15372)", () => {
  beforeEach(() => {
    recordIncrementMock.mockClear();
  });

  it("wired-tracer third-party span via langfuse-sdk scope is detected and warned", async () => {
    // This is the bug case: instrumentor reuses langfuse._otel_tracer so scope
    // stays langfuse-sdk, but attributes are third-party PII-like without
    // langfuse.observation.*. Before fix, isLangfuseSDKSpans=true and no warn.
    const processor = createProcessor();
    const batch = buildBatch("langfuse-sdk", [
      { key: "input.value", value: { stringValue: "PII-CANARY-123" } },
      {
        key: "langfuse.internal.is_app_root",
        value: { stringValue: "true" },
      },
    ]);
    const events = await processor.processToIngestionEvents(batch);
    // Should be treated as third-party: metadata should contain attributes
    // filtered from PII keys. Wired span now preserves attributes.
    expect(events.length).toBeGreaterThan(0);
    // At least one event should have metadata.attributes with input.value
    const hasFiltered = events.some(
      (e: any) =>
        e.metadata?.attributes && "input.value" in e.metadata.attributes,
    );
    // If correctly classified as third-party, filteredAttributes are kept.
    // If misclassified as SDK, attributes would be {}.
    expect(hasFiltered).toBe(true);

    const calls = recordIncrementMock.mock.calls.filter(
      ([stat]) => stat === THIRD_PARTY_METRIC,
    );
    expect(calls.length).toBe(1);
  });

  it("native SDK span with langfuse.observation.input is not warned", async () => {
    const processor = createProcessor();
    const batch = buildBatch("langfuse-sdk", [
      { key: "langfuse.observation.input", value: { stringValue: "hello" } },
      { key: "langfuse.observation.type", value: { stringValue: "span" } },
    ]);
    const events = await processor.processToIngestionEvents(batch);
    expect(events.length).toBeGreaterThan(0);
    const calls = recordIncrementMock.mock.calls.filter(
      ([stat]) => stat === THIRD_PARTY_METRIC,
    );
    expect(calls.length).toBe(0);
  });

  it("empty native observation (no IO, no PII) does not warn", async () => {
    // Native span with only internal marker, no PII-like attributes.
    // Should not warn even though it lacks IO (false-positive guard).
    const processor = createProcessor();
    const batch = buildBatch("langfuse-sdk", [
      {
        key: "langfuse.internal.is_app_root",
        value: { stringValue: "true" },
      },
      { key: "langfuse.observation.type", value: { stringValue: "span" } },
    ]);
    await processor.processToIngestionEvents(batch);
    const calls = recordIncrementMock.mock.calls.filter(
      ([stat]) => stat === THIRD_PARTY_METRIC,
    );
    expect(calls.length).toBe(0);
  });

  it("distinct third-party scope is also detected", async () => {
    const processor = createProcessor();
    const batch = buildBatch("openinference.instrumentation.agno", [
      { key: "input.value", value: { stringValue: "PII" } },
    ]);
    await processor.processToIngestionEvents(batch);
    const calls = recordIncrementMock.mock.calls.filter(
      ([stat]) => stat === THIRD_PARTY_METRIC,
    );
    expect(calls.length).toBe(1);
  });

  it("caps warnings at 10 per processor", async () => {
    const processor = createProcessor();
    for (let i = 0; i < 15; i++) {
      const batch = buildBatch("langfuse-sdk", [
        { key: "input.value", value: { stringValue: `PII-${i}` } },
      ]);
      await processor.processToIngestionEvents(batch);
    }
    const calls = recordIncrementMock.mock.calls.filter(
      ([stat]) => stat === THIRD_PARTY_METRIC,
    );
    expect(calls.length).toBe(10);
  });
});
