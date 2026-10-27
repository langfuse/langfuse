import {
  buildTracePageContext,
  type ObservationForPageContext,
  type TraceForPageContext,
} from "@/src/features/page-context/fns/buildTracePageContext";
import {
  PAGE_CONTEXT_LIMITS,
  PageContextSnapshotSchema,
} from "@/src/features/page-context/types";

const start = new Date("2026-01-01T10:00:00.000Z");
const at = (ms: number) => new Date(start.getTime() + ms);

const trace: TraceForPageContext = {
  id: "trace-1",
  name: "support-copilot",
  environment: "default",
  tags: [],
  sessionId: "session-1",
  userId: null,
  latency: 2.4,
};

function observation(
  overrides: Partial<ObservationForPageContext> & { id: string },
): ObservationForPageContext {
  return {
    name: overrides.id,
    type: "SPAN",
    startTime: start,
    endTime: at(100),
    level: "DEFAULT",
    model: null,
    statusMessage: null,
    totalCost: null,
    totalUsage: 0,
    ...overrides,
  };
}

const observations = [
  observation({ id: "root", type: "AGENT", endTime: at(2_400) }),
  observation({
    id: "draft-reply",
    type: "GENERATION",
    startTime: at(600),
    endTime: at(1_800),
    model: "gpt-4.1",
    totalCost: 0.0031,
    totalUsage: 2_400,
  }),
  observation({
    id: "lookup-order",
    type: "TOOL",
    startTime: at(200),
    endTime: at(500),
    level: "ERROR",
    statusMessage: "Order service timed out",
  }),
  observation({
    id: "classify",
    type: "GENERATION",
    startTime: at(100),
    endTime: at(400),
    totalCost: 0.0004,
    totalUsage: 600,
  }),
];

function build(
  overrides: Partial<Parameters<typeof buildTracePageContext>[0]> = {},
) {
  return buildTracePageContext({
    trace,
    observations,
    totals: { totalCostUsd: 0.0035, durationMs: 2_400 },
    selectedObservationId: null,
    surface: "page",
    path: "/project/p/traces/trace-1",
    ...overrides,
  });
}

function factKeys(facts: { key: string }[]) {
  return facts.map((item) => item.key);
}

describe("buildTracePageContext", () => {
  it("produces a snapshot that passes the server-side schema", () => {
    expect(PageContextSnapshotSchema.safeParse(build()).success).toBe(true);
  });

  it("summarizes the trace with raw values next to their display strings", () => {
    const snapshot = build();

    expect(snapshot).toMatchObject({
      kind: "trace",
      id: "trace-1",
      title: "support-copilot",
    });
    expect(factKeys(snapshot.facts)).toEqual([
      "latency_ms",
      "cost_usd",
      "observations",
      "tokens",
      "errors",
      "session_id",
    ]);
    expect(snapshot.facts.find((item) => item.key === "tokens")).toMatchObject({
      value: 3_000,
      display: "3K",
    });
    expect(snapshot.facts.find((item) => item.key === "errors")?.value).toBe(1);
  });

  it("falls back to the trace latency when the tree has no duration total", () => {
    const snapshot = build({ totals: {} });

    expect(
      snapshot.facts.find((item) => item.key === "latency_ms")?.value,
    ).toBe(2_400);
    expect(factKeys(snapshot.facts)).not.toContain("cost_usd");
  });

  it("names the selected observation as the focus", () => {
    const snapshot = build({ selectedObservationId: "draft-reply" });

    expect(snapshot.focus).toMatchObject({
      kind: "observation",
      label: "Generation",
      id: "draft-reply",
    });
    expect(
      snapshot.focus?.facts.find((item) => item.key === "latency_ms")?.display,
    ).toBe("1.2s (50%)");
    expect(snapshot.related?.map((item) => item.id)).not.toContain(
      "draft-reply",
    );
  });

  it("ignores a selection that is not one of the trace's observations", () => {
    expect(build({ selectedObservationId: "trace-1" }).focus).toBeUndefined();
  });

  it("points at errors first, then the slowest non-wrapper steps, then the costliest", () => {
    expect(build().related?.map((item) => [item.id, item.reason])).toEqual([
      ["lookup-order", "error"],
      ["draft-reply", "slowest step"],
      ["classify", "slowest step"],
    ]);
  });

  it("stays inside the serialized budget for pathological traces", () => {
    const longName = "x".repeat(5_000);
    const snapshot = build({
      trace: { ...trace, name: longName, tags: Array(200).fill(longName) },
      observations: Array.from({ length: 2_000 }, (_, index) =>
        observation({
          id: `obs-${index}`,
          name: longName,
          endTime: at(index),
          level: "ERROR",
          statusMessage: longName,
          model: longName,
        }),
      ),
      selectedObservationId: "obs-3",
      path: `/project/p/traces/${longName}`,
    });

    expect(JSON.stringify(snapshot).length).toBeLessThanOrEqual(
      PAGE_CONTEXT_LIMITS.serializedLength,
    );
    expect(PageContextSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });
});
