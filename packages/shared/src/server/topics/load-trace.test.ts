import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClickhouseStream } from "../repositories/clickhouse";
import { loadTraceSnapshot } from "./load-trace";

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
  end_time: "2026-09-15 10:00:01.000",
  type: "GENERATION",
  name: "chat",
  level: "DEFAULT",
  status_message: null,
  input: "[]",
  output: "false",
  metadata: {},
};

beforeEach(() => vi.clearAllMocks());

function loadRows(...rows: Partial<typeof row>[]) {
  vi.mocked(queryClickhouseStream).mockImplementationOnce(async function* () {
    for (const overrides of rows) yield { ...row, ...overrides };
  });
  return loadTraceSnapshot({ projectId: "project", traceId: "trace" });
}

describe("Topics snapshot loader", () => {
  it("loads complete I/O and latest non-empty metadata through a project-scoped query", async () => {
    const result = await loadRows(
      {
        span_id: "newest",
        session_id: "",
        environment: "",
        trace_name: "",
      },
      {
        span_id: "current",
        session_id: "current-session",
        trace_name: "Current trace",
      },
      {
        span_id: "older",
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
    expect(result.observations[0].output).toBe("false");
    expect(result.timestamp).toBe("2026-09-15T09:00:00.000Z");
    expect(result.sessionId).toBe("current-session");
    expect(result.environment).toBe("production");
    expect(result.traceName).toBe("Current trace");
    expect(result.observations.map((observation) => observation.id)).toEqual([
      "newest",
      "current",
      "older",
    ]);
  });

  it("rejects cross-project rows and refuses oversized snapshots", async () => {
    await expect(loadRows({ project_id: "other" })).rejects.toThrow(
      "scope mismatch",
    );
    await expect(
      loadRows({ output: "x".repeat(10 * 1024 * 1024) }),
    ).rejects.toThrow("limit");
  });

  it.each([
    { parent_span_id: "", is_app_root: false },
    { parent_span_id: "external-parent", is_app_root: true },
  ])(
    "prefers an explicit trace name over a newer root fallback: %j",
    async (root) => {
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
        name: "Child generation",
      };
      const explicit = await loadRows(latestRoot, olderChild);
      expect(explicit.traceName).toBe("Explicit trace name");
      const fallback = await loadRows(latestRoot, {
        ...olderChild,
        trace_name: "",
      });
      expect(fallback.traceName).toBe("Root fallback");
    },
  );

  it("defaults an absent environment and keeps unnamed child-only traces unnamed", async () => {
    const result = await loadRows({
      parent_span_id: "missing-root",
      environment: "",
      trace_name: "",
      name: "Child generation",
    });
    expect(result.environment).toBe("default");
    expect(result.traceName).toBe("");
    expect(result.observations[0].name).toBe("Child generation");
  });
});
