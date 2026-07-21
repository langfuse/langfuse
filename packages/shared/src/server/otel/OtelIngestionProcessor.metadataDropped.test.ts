/**
 * LFE-14342: `langfuse.ingestion.metadata_dropped` counter at the OTel
 * metadata drop site (`parseMetadataAttribute` drop branches).
 *
 * Spec under test:
 * - Counter name: langfuse.ingestion.metadata_dropped
 * - Tags: reason ∈ {non_object_top_level, parse_failure, primitive},
 *   source = otel, domain ∈ {trace, observation}
 * - project_id must NOT be a metric tag (cardinality)
 * - No behavior change to what the processor returns
 * - Dotted-key metadata (langfuse.*.metadata.foo) stays increment-free
 *
 * recordIncrement is mocked at module level: the processor imports it from
 * the src/server barrel, which re-exports ./instrumentation — mocking the
 * instrumentation module intercepts the call. The "mock plumbing" test
 * proves that interception chain holds.
 */
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

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";
import * as serverBarrel from "../index";

const METRIC = "langfuse.ingestion.metadata_dropped";
const PROJECT_ID = "test-project-lfe-14342";

const createProcessor = () =>
  new OtelIngestionProcessor({
    projectId: PROJECT_ID,
    publicKey: "pk-test",
    sdkName: "python",
    sdkVersion: "3.8.1",
  });

type OtelAttribute = { key: string; value: Record<string, unknown> };

const buildBatch = (attributes: OtelAttribute[]): ResourceSpan[] => [
  {
    resource: {
      attributes: [{ key: "service.name", value: { stringValue: "test-svc" } }],
    },
    scopeSpans: [
      {
        scope: {
          name: "langfuse-sdk",
          version: "3.8.1",
          attributes: [
            { key: "public_key", value: { stringValue: "pk-test" } },
          ],
        },
        spans: [
          {
            traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
            spanId: Buffer.from("0123456789abcdef", "hex"),
            name: "test-span",
            kind: 1,
            startTimeUnixNano: "1752384000000000000",
            endTimeUnixNano: "1752384001000000000",
            attributes: [
              {
                key: "langfuse.observation.type",
                value: { stringValue: "span" },
              },
              ...attributes,
            ],
            status: {},
          },
        ],
      },
    ],
  },
];

const droppedCalls = () =>
  recordIncrementMock.mock.calls.filter(([stat]) => stat === METRIC);

const expectDropTags = (
  call: unknown[],
  expected: { reason: string; source: string; domain: string },
) => {
  const [, value, tags] = call as [
    string,
    number | undefined,
    Record<string, string | number>,
  ];
  // recordIncrement(stat) defaults to 1; explicit 1 is equivalent.
  expect(value ?? 1).toBe(1);
  expect(tags).toEqual(expect.objectContaining(expected));
  // Acceptance criterion: project_id is NOT a metric tag (cardinality).
  expect(Object.keys(tags ?? {})).not.toContain("project_id");
  expect(Object.keys(tags ?? {})).not.toContain("projectId");
};

describe("OTel metadata_dropped metric (LFE-14342)", () => {
  beforeEach(() => {
    recordIncrementMock.mockClear();
  });

  it("mock plumbing: server barrel re-exports the mocked recordIncrement", () => {
    // Load-bearing sanity: the processor imports recordIncrement from the
    // barrel; if this fails, every red test below would be a false red.
    expect(serverBarrel.recordIncrement).toBe(recordIncrementMock);
  });

  describe("drop branches on langfuse.observation.metadata (source=otel, domain=observation)", () => {
    it("increments with reason=parse_failure when the metadata string is invalid JSON", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.observation.metadata",
            value: { stringValue: "{invalid json" },
          },
        ]),
      );

      // No behavior change: events are still produced, metadata is dropped.
      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls).toHaveLength(1);
      expectDropTags(calls[0], {
        reason: "parse_failure",
        source: "otel",
        domain: "observation",
      });
    });

    it("increments with reason=non_object_top_level when the metadata string parses to a non-object", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.observation.metadata",
            value: { stringValue: "42" },
          },
        ]),
      );

      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls).toHaveLength(1);
      expectDropTags(calls[0], {
        reason: "non_object_top_level",
        source: "otel",
        domain: "observation",
      });
    });

    it("increments with reason=primitive when the metadata attribute is a non-string primitive", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.observation.metadata",
            value: { intValue: 42 },
          },
        ]),
      );

      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls).toHaveLength(1);
      expectDropTags(calls[0], {
        reason: "primitive",
        source: "otel",
        domain: "observation",
      });
    });
  });

  describe("trace domain", () => {
    it("increments with domain=trace when langfuse.trace.metadata is dropped", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.trace.metadata",
            value: { stringValue: "{invalid json" },
          },
        ]),
      );

      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const traceCall = calls.find(
        ([, , tags]) =>
          (tags as Record<string, string> | undefined)?.domain === "trace",
      );
      expect(traceCall).toBeDefined();
      expectDropTags(traceCall!, {
        reason: "parse_failure",
        source: "otel",
        domain: "trace",
      });
    });
  });

  describe("events path (processToEvent)", () => {
    it("increments on a dropped observation metadata attribute in the events path too", () => {
      const events = createProcessor().processToEvent(
        buildBatch([
          {
            key: "langfuse.observation.metadata",
            value: { stringValue: "{invalid json" },
          },
        ]),
      );

      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expectDropTags(calls[0], {
        reason: "parse_failure",
        source: "otel",
        domain: "observation",
      });
    });
  });

  describe("silence on valid input", () => {
    it("does not increment for a valid JSON-object metadata attribute", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.observation.metadata",
            value: { stringValue: JSON.stringify({ env: "prod" }) },
          },
        ]),
      );

      // Fixture proof: the metadata value flows through into the output.
      expect(JSON.stringify(events)).toContain("prod");
      expect(droppedCalls()).toHaveLength(0);
    });

    it("does not increment for dotted-key metadata attributes", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.observation.metadata.foo",
            value: { stringValue: "bar-value" },
          },
          {
            key: "langfuse.trace.metadata.baz",
            value: { stringValue: "qux-value" },
          },
        ]),
      );

      // Fixture proof: dotted-key metadata survives.
      expect(JSON.stringify(events)).toContain("bar-value");
      expect(droppedCalls()).toHaveLength(0);
    });
  });

  // Reviewer ruling 1 (round 1): one increment per dropped attribute VALUE
  // per job — deduped across the two pipelines the worker runs on the SAME
  // processor instance, and across domain extractions of a shared attribute
  // key. Domain tag of a shared key is the first-seen domain.
  describe("exactly-once semantics across pipelines and domains", () => {
    const expectSingleDrop = (expectedReason: string) => {
      const calls = droppedCalls();
      expect(calls).toHaveLength(1);
      const [, value, tags] = calls[0] as [
        string,
        number | undefined,
        Record<string, string | number>,
      ];
      expect(value ?? 1).toBe(1);
      expect(tags).toEqual(
        expect.objectContaining({ reason: expectedReason, source: "otel" }),
      );
      expect(["trace", "observation"]).toContain(tags?.domain);
      expect(Object.keys(tags ?? {})).not.toContain("project_id");
      expect(Object.keys(tags ?? {})).not.toContain("projectId");
    };

    it("counts a dropped attribute once when both pipelines run on one processor instance", async () => {
      // Mirrors the worker job: processToIngestionEvents then processToEvent
      // with the same parsed spans on the same instance.
      const processor = createProcessor();
      const batch = buildBatch([
        {
          key: "langfuse.observation.metadata",
          value: { stringValue: "{invalid json" },
        },
      ]);

      const ingestionEvents = await processor.processToIngestionEvents(batch);
      const events = processor.processToEvent(batch);

      expect(ingestionEvents.length).toBeGreaterThan(0);
      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls).toHaveLength(1);
      expectDropTags(calls[0], {
        reason: "parse_failure",
        source: "otel",
        domain: "observation",
      });
    });

    it("counts the shared langfuse.metadata compat key once across trace and observation extraction", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.metadata",
            value: { stringValue: "{invalid json" },
          },
        ]),
      );

      expect(events.length).toBeGreaterThan(0);
      expectSingleDrop("parse_failure");
    });

    // Reviewer ruling 2 (round 1): falsy-but-present values on the compat
    // key are drops — non-string primitives as reason=primitive, "" as
    // reason=parse_failure (JSON.parse("") throws). Returned values stay
    // unchanged; a truly absent attribute stays increment-free.
    it("counts langfuse.metadata = false as a primitive drop", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([{ key: "langfuse.metadata", value: { boolValue: false } }]),
      );

      expect(events.length).toBeGreaterThan(0);
      expectSingleDrop("primitive");
    });

    it("counts langfuse.metadata = 0 as a primitive drop", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([{ key: "langfuse.metadata", value: { intValue: 0 } }]),
      );

      expect(events.length).toBeGreaterThan(0);
      expectSingleDrop("primitive");
    });

    it('counts langfuse.metadata = "" as a parse_failure drop', async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([{ key: "langfuse.metadata", value: { stringValue: "" } }]),
      );

      expect(events.length).toBeGreaterThan(0);
      expectSingleDrop("parse_failure");
    });

    it("does not increment when no metadata attribute is present at all", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([]),
      );

      expect(events.length).toBeGreaterThan(0);
      expect(droppedCalls()).toHaveLength(0);
    });

    it("does not increment for a valid JSON object on the langfuse.metadata compat key", async () => {
      // Fixture proof that the compat key reaches metadata extraction at
      // all — if this fails, the falsy-value fixtures above cannot reach
      // the parser either (report as a finding, not a test problem).
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.metadata",
            value: { stringValue: JSON.stringify({ env: "compat-prod" }) },
          },
        ]),
      );

      expect(JSON.stringify(events)).toContain("compat-prod");
      expect(droppedCalls()).toHaveLength(0);
    });
  });

  // Adversarial-gate rulings (round 2). Shared fixture builders for
  // multi-resourceSpan / multi-span batches.
  describe("adversarial rulings", () => {
    const makeSpan = (attributes: OtelAttribute[], spanIdHex: string) => ({
      traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
      spanId: Buffer.from(spanIdHex, "hex"),
      name: "test-span",
      kind: 1,
      startTimeUnixNano: "1752384000000000000",
      endTimeUnixNano: "1752384001000000000",
      attributes: [
        { key: "langfuse.observation.type", value: { stringValue: "span" } },
        ...attributes,
      ],
      status: {},
    });

    const makeResourceSpan = (
      resourceAttrs: OtelAttribute[],
      spans: ReturnType<typeof makeSpan>[],
    ): ResourceSpan => ({
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "test-svc" } },
          ...resourceAttrs,
        ],
      },
      scopeSpans: [
        {
          scope: {
            name: "langfuse-sdk",
            version: "3.8.1",
            attributes: [
              { key: "public_key", value: { stringValue: "pk-test" } },
            ],
          },
          spans,
        },
      ],
    });

    const expectDropReasons = (expectedReasons: string[]) => {
      const calls = droppedCalls();
      expect(
        calls
          .map(
            ([, , tags]) =>
              (tags as Record<string, string> | undefined)?.reason,
          )
          .sort(),
      ).toEqual([...expectedReasons].sort());
      for (const [, value, tags] of calls) {
        expect((value as number | undefined) ?? 1).toBe(1);
        expect(tags).toEqual(expect.objectContaining({ source: "otel" }));
        expect(["trace", "observation"]).toContain(
          (tags as Record<string, string>)?.domain,
        );
        expect(Object.keys(tags ?? {})).not.toContain("project_id");
        expect(Object.keys(tags ?? {})).not.toContain("projectId");
      }
    };

    // RULING A: dedup is scoped per resourceSpan, not per processor
    // instance — distinct resourceSpans in one job count separately.
    describe("resource-scope dedup", () => {
      it("counts bad resource-level metadata once per resourceSpan, not once per job", async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [{ key: "langfuse.metadata", value: { stringValue: "{bad-one" } }],
            [makeSpan([], "0000000000000001")],
          ),
          makeResourceSpan(
            [{ key: "langfuse.metadata", value: { stringValue: "{bad-two" } }],
            [makeSpan([], "0000000000000002")],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        expectDropReasons(["parse_failure", "parse_failure"]);
      });

      it("counts one resourceSpan's bad resource-level metadata once even with multiple spans", async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [{ key: "langfuse.metadata", value: { stringValue: "{bad-one" } }],
            [
              makeSpan([], "0000000000000001"),
              makeSpan([], "0000000000000002"),
            ],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        expectDropReasons(["parse_failure"]);
      });
    });

    // RULING B: falsy-but-present PRIMARY keys count (supersedes the
    // compat-key-only scoping of round-1 ruling 2). Truly-absent stays
    // zero — pinned by "does not increment when no metadata attribute is
    // present at all" above.
    describe("falsy-present primary keys", () => {
      it("counts langfuse.observation.metadata = false as a primitive drop", async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [],
            [
              makeSpan(
                [
                  {
                    key: "langfuse.observation.metadata",
                    value: { boolValue: false },
                  },
                ],
                "0000000000000001",
              ),
            ],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        const calls = droppedCalls();
        expect(calls).toHaveLength(1);
        expectDropTags(calls[0], {
          reason: "primitive",
          source: "otel",
          domain: "observation",
        });
      });

      it("counts langfuse.observation.metadata = 0 as a primitive drop", async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [],
            [
              makeSpan(
                [
                  {
                    key: "langfuse.observation.metadata",
                    value: { intValue: 0 },
                  },
                ],
                "0000000000000001",
              ),
            ],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        const calls = droppedCalls();
        expect(calls).toHaveLength(1);
        expectDropTags(calls[0], {
          reason: "primitive",
          source: "otel",
          domain: "observation",
        });
      });

      it('counts langfuse.observation.metadata = "" as a parse_failure drop', async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [],
            [
              makeSpan(
                [
                  {
                    key: "langfuse.observation.metadata",
                    value: { stringValue: "" },
                  },
                ],
                "0000000000000001",
              ),
            ],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        const calls = droppedCalls();
        expect(calls).toHaveLength(1);
        expectDropTags(calls[0], {
          reason: "parse_failure",
          source: "otel",
          domain: "observation",
        });
      });

      it("counts a falsy-present primary key AND a malformed compat key as two drops", async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [],
            [
              makeSpan(
                [
                  {
                    key: "langfuse.observation.metadata",
                    value: { boolValue: false },
                  },
                  {
                    key: "langfuse.metadata",
                    value: { stringValue: "{bad" },
                  },
                ],
                "0000000000000001",
              ),
            ],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        expectDropReasons(["parse_failure", "primitive"]);
      });
    });

    // RULING C: logger.warn from the drop path is capped at 10 per
    // processor instance (per job); the metric keeps counting past the cap.
    describe("warn cap", () => {
      it("caps drop-path warns at 10 per instance while increments keep counting", async () => {
        const warnSpy = vi
          .spyOn(serverBarrel.logger, "warn")
          .mockImplementation(() => serverBarrel.logger);

        try {
          const spans = Array.from({ length: 12 }, (_, i) =>
            makeSpan(
              [
                {
                  key: "langfuse.observation.metadata",
                  // Distinct malformed values so per-value dedup keeps all 12.
                  value: { stringValue: `{bad-${i}` },
                },
              ],
              `00000000000000${(i + 1).toString(16).padStart(2, "0")}`,
            ),
          );

          const events = await createProcessor().processToIngestionEvents([
            makeResourceSpan([], spans),
          ]);

          expect(events.length).toBeGreaterThan(0);
          expect(droppedCalls().length).toBeGreaterThan(10);
          expect(warnSpy).toHaveBeenCalledTimes(10);
        } finally {
          warnSpy.mockRestore();
        }
      });
    });
  });
});
