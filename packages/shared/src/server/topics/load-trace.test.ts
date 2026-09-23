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
  parent_span_id: null,
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

describe("Topics snapshot loader", () => {
  it("loads complete I/O through a project-scoped latest-version query", async () => {
    vi.mocked(queryClickhouseStream).mockImplementation(async function* () {
      yield row;
      yield {
        ...row,
        span_id: "earlier",
        start_time: "2026-09-15 09:00:00.000",
      };
    });
    const result = await loadTraceSnapshot({
      projectId: "project",
      traceId: "trace",
    });
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
    expect(result.sessionId).toBe("session");
    expect(result.environment).toBe("production");
    expect(result.traceName).toBe("Billing requests");
  });

  it("rejects cross-project rows and refuses oversized snapshots", async () => {
    vi.mocked(queryClickhouseStream).mockImplementationOnce(async function* () {
      yield { ...row, project_id: "other" };
    });
    await expect(
      loadTraceSnapshot({ projectId: "project", traceId: "trace" }),
    ).rejects.toThrow("scope mismatch");
    vi.mocked(queryClickhouseStream).mockImplementationOnce(async function* () {
      yield { ...row, output: "x".repeat(10 * 1024 * 1024) };
    });
    await expect(
      loadTraceSnapshot({ projectId: "project", traceId: "trace" }),
    ).rejects.toThrow("limit");
  });

  it("keeps observations while taking the latest non-empty trace metadata", async () => {
    vi.mocked(queryClickhouseStream).mockImplementation(async function* () {
      yield {
        ...row,
        span_id: "newest",
        session_id: "",
        environment: "",
        trace_name: "",
      };
      yield {
        ...row,
        span_id: "current",
        session_id: "current-session",
        environment: "production",
        trace_name: "Current trace",
      };
      yield {
        ...row,
        span_id: "older",
        session_id: "previous-session",
        environment: "staging",
        trace_name: "Old trace",
      };
    });
    const result = await loadTraceSnapshot({
      projectId: "project",
      traceId: "trace",
    });
    expect(result.sessionId).toBe("current-session");
    expect(result.environment).toBe("production");
    expect(result.traceName).toBe("Current trace");
    expect(result.observations.map((observation) => observation.id)).toEqual([
      "newest",
      "current",
      "older",
    ]);
  });
  it.each([
    { parent_span_id: "", is_app_root: false },
    { parent_span_id: "external-parent", is_app_root: true },
  ])(
    "prefers an explicit trace name over a newer root fallback: %j",
    async (root) => {
      const latestRoot = {
        ...row,
        ...root,
        span_id: "root",
        trace_name: "",
        name: "Root fallback",
      };
      const olderChild = {
        ...row,
        span_id: "child",
        parent_span_id: "root",
        trace_name: "Explicit trace name",
        name: "Child generation",
      };
      vi.mocked(queryClickhouseStream).mockImplementationOnce(
        async function* () {
          yield latestRoot;
          yield olderChild;
        },
      );
      const explicit = await loadTraceSnapshot({
        projectId: "project",
        traceId: "trace",
      });
      expect(explicit.traceName).toBe("Explicit trace name");
      vi.mocked(queryClickhouseStream).mockImplementationOnce(
        async function* () {
          yield latestRoot;
          yield { ...olderChild, trace_name: "" };
        },
      );
      const fallback = await loadTraceSnapshot({
        projectId: "project",
        traceId: "trace",
      });
      expect(fallback.traceName).toBe("Root fallback");
    },
  );

  it("defaults an absent environment and keeps unnamed child-only traces unnamed", async () => {
    vi.mocked(queryClickhouseStream).mockImplementation(async function* () {
      yield {
        ...row,
        parent_span_id: "missing-root",
        environment: "",
        trace_name: "",
        name: "Child generation",
      };
    });
    const result = await loadTraceSnapshot({
      projectId: "project",
      traceId: "trace",
    });
    expect(result.environment).toBe("default");
    expect(result.traceName).toBe("");
    expect(result.observations[0].name).toBe("Child generation");
  });
});
