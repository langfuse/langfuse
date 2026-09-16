import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClickhouseStream } from "../repositories/clickhouse";
import { loadTraceSnapshot } from "./load-trace";

vi.mock("../repositories/clickhouse", () => ({
  queryClickhouseStream: vi.fn(),
}));

const row = {
  project_id: "project",
  trace_id: "trace",
  span_id: "span",
  parent_span_id: null,
  start_time: "2026-09-15 10:00:00.000",
  end_time: "2026-09-15 10:00:01.000",
  event_ts: "2026-09-15 10:00:02.000",
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
    expect(result.timestamp).toBe("2026-09-15T10:00:00.000Z");
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
});
