import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventRecordInsertType } from "../../../src/server";
import { topicEventsToOtel, topicOtelId } from "./topics-otel";
import { topicsScenario } from "./topics";
import { traceLink } from "./verify";

vi.mock("../../../src/server", () => ({
  createTrace: vi.fn(),
  createObservation: vi.fn(),
  createEvent: vi.fn(),
  createTracesCh: vi.fn(),
  createObservationsCh: vi.fn(),
  createEventsCh: vi.fn(),
}));
vi.mock("./verify", () => ({
  countRows: vi.fn(),
  traceLink: vi.fn(() => "trace-link"),
  tracesListLink: vi.fn(() => "traces-link"),
}));

const event = (overrides: Partial<EventRecordInsertType> = {}) =>
  ({
    trace_id: topicOtelId("fixture-e00", 16),
    span_id: "root",
    parent_span_id: "",
    name: "request",
    trace_name: "assistant-request",
    type: "SPAN",
    environment: "default",
    tags: ["seed", "topics", "evaluation"],
    level: "DEFAULT",
    input: '[{"role":"user","content":"Original request"}]',
    output: '[{"role":"assistant","content":"Answer"}]',
    metadata_names: ["batch"],
    metadata_values: ["evaluation"],
    start_time: "2026-10-06 00:00:00.123",
    end_time: "2026-10-06 00:00:01.923",
    ...overrides,
  }) as EventRecordInsertType;

afterEach(() => {
  vi.useRealTimers();
});

describe("Topics OTLP seeder", () => {
  it("preserves parent links, original input and tool failures in OTLP", () => {
    const spans = topicEventsToOtel([
      event(),
      event({
        span_id: "tool",
        parent_span_id: "root",
        type: "TOOL",
        level: "ERROR",
        status_message: "Request timed out",
        input: '{"query":"Original request"}',
        output: '{"error":"TimeoutError"}',
      }),
    ]).resourceSpans[0]!.scopeSpans[0]!.spans;
    expect(spans[0]!.traceId).toMatch(/^[a-f0-9]{32}$/);
    expect(spans[0]!.spanId).toMatch(/^[a-f0-9]{16}$/);
    expect(spans[1]!.parentSpanId).toBe(spans[0]!.spanId);
    const attributes = (index: number) =>
      Object.fromEntries(
        spans[index]!.attributes.map(({ key, value }) => [
          key,
          value.stringValue,
        ]),
      );
    expect(attributes(0)["langfuse.trace.input"]).toContain("Original request");
    expect(attributes(1)).toMatchObject({
      "langfuse.observation.type": "tool",
      "langfuse.observation.level": "ERROR",
      "langfuse.observation.status_message": "Request timed out",
      "langfuse.observation.output": '{"error":"TimeoutError"}',
    });
    expect(spans[1]!.status).toEqual({ code: 2, message: "Request timed out" });
  });

  it("keeps OTLP traces in the past at midnight and stable across retries and partial batches", async () => {
    const midnight = Date.parse("2026-10-06T00:00:00.000Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(midnight);
    const context = {
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      environment: "default",
      seed: 42,
      idPrefix: "threshold-fixture",
      dryRun: true,
      baseUrl: "http://localhost:3000",
      log: vi.fn(),
    };
    const timestampsFor = async (
      params: Record<string, string | number | boolean>,
    ) => {
      vi.mocked(traceLink).mockClear();
      await topicsScenario.run(context, { transport: "otel", ...params });
      return vi
        .mocked(traceLink)
        .mock.calls.map(([, , timestamp]) => timestamp);
    };
    const all = await timestampsFor({ batch: "evaluation" });
    expect(Math.max(...all) + 1800).toBeLessThan(midnight);
    const first = await timestampsFor({ batch: "evaluation", limit: 99 });
    vi.setSystemTime(midnight + 30_000);
    const last = await timestampsFor({
      batch: "evaluation",
      offset: 99,
      limit: 1,
    });
    expect([...first, ...last]).toEqual(all);
    expect(await timestampsFor({ batch: "evaluation" })).toEqual(all);
  });
});
