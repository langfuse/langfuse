import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClickhouseStream } from "../repositories/clickhouse";
import { loadTopicTranscript } from "./trace-input";

vi.mock("../repositories/clickhouse", () => ({
  queryClickhouseStream: vi.fn(),
}));

const row = {
  project_id: "project",
  trace_id: "trace",
  session_id: "session",
  environment: "production",
  trace_name: "Billing requests",
  span_id: "span",
  parent_span_id: null as string | null,
  is_app_root: false,
  start_time: "2026-09-15 10:00:00.000",
  type: "GENERATION",
  name: "chat",
  input: JSON.stringify([
    { role: "user", content: "Please cancel my subscription." },
  ]),
  output: JSON.stringify({
    role: "assistant",
    content: "Your subscription was cancelled.",
  }),
  metadata: {},
};

beforeEach(() => vi.clearAllMocks());

function loadRows(...rows: Partial<typeof row>[]) {
  vi.mocked(queryClickhouseStream).mockImplementationOnce(async function* () {
    for (const overrides of rows) yield { ...row, ...overrides };
  });
  return loadTopicTranscript({ projectId: "project", traceId: "trace" });
}

describe("Topics transcript input", () => {
  it("loads project-scoped I/O and latest source metadata", async () => {
    const result = await loadRows(
      {
        span_id: "wrapper",
        type: "SPAN",
        session_id: "",
        environment: "",
        trace_name: "",
      },
      {
        span_id: "current",
        parent_span_id: "wrapper",
        session_id: "current-session",
        trace_name: "Current trace",
      },
      {
        span_id: "older",
        type: "SPAN",
        session_id: "previous-session",
        environment: "staging",
        trace_name: "Old trace",
        start_time: "2026-09-15 09:00:00.000",
      },
    );
    const request = vi.mocked(queryClickhouseStream).mock.calls[0][0];
    expect(request.query).toContain("events_full");
    expect(request.query).toContain("LIMIT 1 BY e.span_id, e.project_id");
    expect(request.query).toContain("e.event_ts DESC");
    expect(request.query).not.toContain("leftUTF8");
    expect(request.query).not.toContain("FINAL");
    expect(request.params).toMatchObject({
      projectId: "project",
      traceId: "trace",
    });
    expect(result).toMatchObject({
      unitStartTime: "2026-09-15T09:00:00.000Z",
      sessionId: "current-session",
      environment: "production",
      traceName: "Current trace",
    });
    const json = JSON.stringify(result.transcript);
    expect(json).toContain("Please cancel my subscription.");
    expect(json).toContain("Your subscription was cancelled.");
    expect(result.transcript?.threads[0].currentTurn.observations).toEqual([
      { id: "current", traceId: "trace" },
    ]);
  });

  it("rejects foreign, missing, duplicate and oversized source snapshots", async () => {
    for (const scope of [{ project_id: "other" }, { trace_id: "other" }])
      await expect(loadRows(scope)).rejects.toThrow("scope mismatch");
    await expect(loadRows()).rejects.toThrow("Trace not found");
    await expect(loadRows({}, {})).rejects.toThrow("duplicate observation IDs");
    await expect(
      loadRows({ output: "x".repeat(10 * 1024 * 1024) }),
    ).rejects.toThrow("limit");
    await expect(
      loadRows(
        ...Array.from({ length: 2_001 }, (_, i) => ({ span_id: String(i) })),
      ),
    ).rejects.toThrow("limit");
  });

  it.each([
    { parent_span_id: "", is_app_root: false },
    { parent_span_id: "external-parent", is_app_root: true },
  ])("prefers explicit trace names over root fallback: %j", async (root) => {
    const latestRoot = {
      ...root,
      span_id: "root",
      trace_name: "",
      name: "Root fallback",
    };
    const olderChild = {
      span_id: "child",
      parent_span_id: "root",
      trace_name: "Explicit trace name",
    };
    expect((await loadRows(latestRoot, olderChild)).traceName).toBe(
      "Explicit trace name",
    );
    expect(
      (await loadRows(latestRoot, { ...olderChild, trace_name: "" })).traceName,
    ).toBe("Root fallback");
  });

  it("defaults missing source context", async () => {
    const result = await loadRows({
      parent_span_id: "missing-root",
      environment: "",
      trace_name: "",
    });
    expect(result).toMatchObject({
      environment: "default",
      traceName: "",
    });
  });

  it("applies the Topics cap with stable equal-time ordering", async () => {
    const rows = [0, 1, 2].map((index) => ({
      span_id: `generation-${index}`,
      input: JSON.stringify([{ role: "user", content: `Request ${index}` }]),
      output: "response".repeat(4_000),
    }));
    const result = await loadRows(...rows);
    expect(result.transcript?.truncated).toBe(true);
    expect(JSON.stringify(result.transcript).length).toBeLessThanOrEqual(
      10_000,
    );
    expect((await loadRows(...rows.reverse())).transcript).toEqual(
      result.transcript,
    );
  });
});
