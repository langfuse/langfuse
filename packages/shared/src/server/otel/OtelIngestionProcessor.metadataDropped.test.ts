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
});
