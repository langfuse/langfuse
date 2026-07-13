/**
 * Per-span failure isolation: one malformed span in an OTLP batch must not
 * discard its well-formed siblings on either conversion path
 * (processToEvent and processToIngestionEvents), and both paths must skip
 * the identical span set.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { OtelIngestionProcessor } from "./OtelIngestionProcessor";
import { logger } from "../logger";

const { recordIncrementMock } = vi.hoisted(() => ({
  recordIncrementMock: vi.fn(),
}));
vi.mock("../index", async (importOriginal) => {
  const original = (await importOriginal()) as object;
  return {
    ...original,
    recordIncrement: recordIncrementMock,
    // Truthy redis stub so getSeenTracesSet reaches its trace-id collection
    redis: { set: vi.fn().mockResolvedValue("OK") },
  };
});

const CONVERSION_FAILURE_METRIC = "langfuse.ingestion.otel.conversion_failure";
const PROJECT_ID = "test-project";
const TRACE_ID = "0123456789abcdef0123456789abcdef";

const createProcessor = () => {
  const processor = new OtelIngestionProcessor({
    projectId: PROJECT_ID,
    publicKey: "pk-lf-test",
    sdkName: "test-sdk",
    sdkVersion: "1.0.0",
  });
  // Bypass Redis-backed seen-traces initialization
  (processor as any).seenTraces = new Set();
  (processor as any).isInitialized = true;
  return processor;
};

const makeSpan = (spanId: string, overrides: Record<string, unknown> = {}) => ({
  traceId: TRACE_ID,
  spanId,
  name: `span-${spanId}`,
  startTimeUnixNano: "1700000000000000000",
  endTimeUnixNano: "1700000001000000000",
  attributes: [{ key: "some.attribute", value: { stringValue: "ok" } }],
  ...overrides,
});

const makeResourceSpan = (spans: unknown[]) => ({
  resource: {
    attributes: [
      { key: "service.name", value: { stringValue: "test-service" } },
      { key: "telemetry.sdk.language", value: { stringValue: "nodejs" } },
    ],
  },
  scopeSpans: [{ scope: { name: "test-scope", version: "0.1.0" }, spans }],
});

// Well-formed siblings
const goodSpanA = makeSpan("aaaaaaaaaaaaaaaa");
const goodSpanB = makeSpan("bbbbbbbbbbbbbbbb");
// Prod failure 1: attribute with a key but no value (legal in OTLP protobuf)
const spanWithValuelessAttribute = makeSpan("cccccccccccccccc", {
  attributes: [{ key: "orphan.key" }],
});
// Prod failure 2: span without traceId
const spanWithoutTraceId = makeSpan("dddddddddddddddd", {
  traceId: undefined,
});
const spanWithoutSpanId = makeSpan("eeeeeeeeeeeeeeee", {
  spanId: undefined,
});
// Unknown malformation: throws inside attribute conversion
const spanWithThrowingAttribute = makeSpan("ffffffffffffffff", {
  attributes: [
    { key: "bad.array", value: { arrayValue: { values: "not-an-array" } } },
  ],
});

const eventSpanIds = (events: any[]) =>
  events.map((e) => e.spanId as string).sort();
const observationIds = (events: any[]) =>
  events
    .filter((e) => e.type !== "trace-create")
    .map((e) => e.body.id as string)
    .sort();
const skipMetricCalls = () =>
  recordIncrementMock.mock.calls.filter(
    ([metric, , tags]) =>
      metric === CONVERSION_FAILURE_METRIC &&
      tags?.failure_type === "span_skipped",
  );

describe("OtelIngestionProcessor per-span failure isolation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    recordIncrementMock.mockClear();
  });

  describe("attribute with key but no value (null guard)", () => {
    const batch = [
      makeResourceSpan([goodSpanA, spanWithValuelessAttribute, goodSpanB]),
    ];

    it("processToEvent ingests all spans without throwing", () => {
      const events = createProcessor().processToEvent(batch as any);
      expect(eventSpanIds(events)).toEqual([
        "aaaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbb",
        "cccccccccccccccc",
      ]);
    });

    it("processToIngestionEvents ingests all spans", async () => {
      const events = await createProcessor().processToIngestionEvents(
        batch as any,
      );
      expect(observationIds(events)).toEqual([
        "aaaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbb",
        "cccccccccccccccc",
      ]);
    });

    it("drops the valueless attribute instead of crashing", () => {
      const events = createProcessor().processToEvent(batch as any);
      const affected = events.find((e: any) => e.spanId === "cccccccccccccccc");
      expect(affected.metadata.attributes).toEqual({});
    });
  });

  describe.each([
    ["missing traceId", spanWithoutTraceId, "missing_trace_id"],
    ["missing spanId", spanWithoutSpanId, "missing_span_id"],
    [
      "throwing attribute conversion",
      spanWithThrowingAttribute,
      "conversion_error",
    ],
  ])("span with %s", (_label, malformedSpan, expectedReason) => {
    const batch = [makeResourceSpan([goodSpanA, malformedSpan, goodSpanB])];

    it("processToEvent skips only the malformed span and does not throw", () => {
      const events = createProcessor().processToEvent(batch as any);
      expect(eventSpanIds(events)).toEqual([
        "aaaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbb",
      ]);
    });

    it("processToIngestionEvents skips only the malformed span", async () => {
      const events = await createProcessor().processToIngestionEvents(
        batch as any,
      );
      expect(observationIds(events)).toEqual([
        "aaaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbb",
      ]);
    });

    it("increments the conversion_failure metric with reason and project", () => {
      createProcessor().processToEvent(batch as any);
      const calls = skipMetricCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0][2]).toMatchObject({
        failure_type: "span_skipped",
        reason: expectedReason,
        project_id: PROJECT_ID,
      });
    });
  });

  it("both paths skip the identical span set on a mixed batch", async () => {
    const batch = [
      makeResourceSpan([
        goodSpanA,
        spanWithoutTraceId,
        spanWithThrowingAttribute,
        spanWithValuelessAttribute,
        goodSpanB,
        spanWithoutSpanId,
      ]),
    ];
    const eventRecords = createProcessor().processToEvent(batch as any);
    const ingestionEvents = await createProcessor().processToIngestionEvents(
      batch as any,
    );
    const survivors = [
      "aaaaaaaaaaaaaaaa",
      "bbbbbbbbbbbbbbbb",
      "cccccccccccccccc",
    ];
    expect(eventSpanIds(eventRecords)).toEqual(survivors);
    expect(observationIds(ingestionEvents)).toEqual(survivors);
  });

  it("logs one aggregated warning per batch, not one per span", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    const batch = [
      makeResourceSpan([
        goodSpanA,
        spanWithoutTraceId,
        spanWithThrowingAttribute,
      ]),
    ];
    createProcessor().processToEvent(batch as any);
    const skipWarnings = warnSpy.mock.calls.filter(([message]) =>
      String(message).includes("malformed OTEL span"),
    );
    expect(skipWarnings).toHaveLength(1);
  });

  describe("batch-level catch remains the backstop for non-span-scoped errors", () => {
    it("processToEvent still throws (preserving retry behavior)", () => {
      const processor = createProcessor();
      vi.spyOn(
        processor as any,
        "extractResourceAttributes",
      ).mockImplementation(() => {
        throw new Error("redis exploded");
      });
      expect(() =>
        processor.processToEvent([makeResourceSpan([goodSpanA])] as any),
      ).toThrow("redis exploded");
    });

    it("processToIngestionEvents still swallows and returns []", async () => {
      const processor = createProcessor();
      vi.spyOn(
        processor as any,
        "filterRedundantShallowTraces",
      ).mockImplementation(() => {
        throw new Error("non-span-scoped failure");
      });
      await expect(
        processor.processToIngestionEvents([
          makeResourceSpan([goodSpanA]),
        ] as any),
      ).resolves.toEqual([]);
    });
  });

  describe("state consistency under per-span failures", () => {
    // Throws inside createObservationEvent (span.events is not an array),
    // i.e. AFTER trace bookkeeping would have run in processSpan.
    const spanThrowingLate = makeSpan("abadcafeabadcafe", {
      parentSpanId: "aaaaaaaaaaaaaaaa",
      events: "not-an-array",
    });
    const nonRootSibling = makeSpan("bbbbbbbbbbbbbbb1", {
      parentSpanId: "aaaaaaaaaaaaaaaa",
    });

    it("still emits a trace-create when an earlier span of the trace fails mid-conversion", async () => {
      const events = await createProcessor().processToIngestionEvents([
        makeResourceSpan([spanThrowingLate, nonRootSibling]),
      ] as any);
      expect(observationIds(events)).toEqual(["bbbbbbbbbbbbbbb1"]);
      const traceEvents = events.filter((e: any) => e.type === "trace-create");
      expect(traceEvents.map((e: any) => e.body.id)).toEqual([TRACE_ID]);
    });

    it("tags skips with the conversion path when both paths run on one instance", async () => {
      const processor = createProcessor();
      const batch = [makeResourceSpan([spanWithoutSpanId])];
      processor.processToEvent(batch as any);
      await processor.processToIngestionEvents(batch as any);
      const paths = skipMetricCalls()
        .map(([, , tags]) => tags.path)
        .sort();
      expect(paths).toEqual(["event", "ingestion"]);
    });

    it("accepts plain {data: [...]} ids identically on both paths", async () => {
      const bufferLikeSpan = {
        ...makeSpan("unused"),
        traceId: { data: Array.from(Buffer.from(TRACE_ID, "hex")) },
        spanId: { data: Array.from(Buffer.from("0102030405060708", "hex")) },
      };
      const batch = [makeResourceSpan([bufferLikeSpan])];
      expect(
        eventSpanIds(createProcessor().processToEvent(batch as any)),
      ).toEqual(["0102030405060708"]);
      expect(
        observationIds(
          await createProcessor().processToIngestionEvents(batch as any),
        ),
      ).toEqual(["0102030405060708"]);
    });

    it("does not leak skipped spans from a failed batch into the next flush", async () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
      const processor = createProcessor();
      vi.spyOn(
        processor as any,
        "filterRedundantShallowTraces",
      ).mockImplementation(() => {
        throw new Error("non-span-scoped failure");
      });
      await processor.processToIngestionEvents([
        makeResourceSpan([spanWithoutTraceId, goodSpanA]),
      ] as any);
      const warnsAfterFirstCall = warnSpy.mock.calls.filter(([message]) =>
        String(message).includes("malformed OTEL span"),
      ).length;
      processor.processToEvent([makeResourceSpan([goodSpanA])] as any);
      const warnsAfterSecondCall = warnSpy.mock.calls.filter(([message]) =>
        String(message).includes("malformed OTEL span"),
      ).length;
      // The failed batch flushes its own skips; the clean batch adds none.
      expect(warnsAfterFirstCall).toBe(1);
      expect(warnsAfterSecondCall).toBe(1);
    });
  });

  it("getSeenTracesSet tolerates spans without traceId", async () => {
    const processor = new OtelIngestionProcessor({
      projectId: PROJECT_ID,
      publicKey: "pk-lf-test",
      sdkName: "test-sdk",
      sdkVersion: "1.0.0",
    });
    // Must not throw while collecting trace ids from malformed spans
    await expect(
      (processor as any).getSeenTracesSet([
        makeResourceSpan([goodSpanA, spanWithoutTraceId]),
      ]),
    ).resolves.toBeInstanceOf(Set);
  });
});
