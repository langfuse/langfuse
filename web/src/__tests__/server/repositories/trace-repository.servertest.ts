import { createTrace } from "@/src/__tests__/server/repositories/clickhouse-helpers";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { getTraceByIdOrThrow } from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("Clickhouse Traces Repository Test", () => {
  beforeEach(async () => {
    await pruneDatabase();
  });

  it("should throw if no traces are found", async () => {
    await expect(getTraceByIdOrThrow(v4(), v4())).rejects.toThrow();
  });

  it("should return a trace if it exists", async () => {
    const traceId = v4();

    const trace = {
      id: traceId,
      project_id: projectId,
      session_id: v4(),
      timestamp: Date.now(),
      metadata: {},
      public: false,
      bookmarked: false,
      name: "Test Trace",
      tags: [],
      release: null,
      version: null,
      user_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      is_deleted: 0,
    };

    await createTrace(trace);

    const result = await getTraceByIdOrThrow(
      traceId,
      projectId,
      new Date(trace.timestamp),
    );
    expect(result.id).toEqual(trace.id);
    expect(result.projectId).toEqual(trace.project_id);
    expect(result.name).toEqual(trace.name);
    expect(result.timestamp).toEqual(new Date(trace.timestamp));
    expect(result.tags).toEqual(trace.tags);
    expect(result.bookmarked).toEqual(trace.bookmarked);
    expect(result.release).toEqual(trace.release);
    expect(result.version).toEqual(trace.version);
    expect(result.userId).toEqual(trace.user_id);
    expect(result.sessionId).toEqual(trace.session_id);
    expect(result.public).toEqual(trace.public);
    expect(result.input).toEqual(null);
    expect(result.output).toEqual(null);
    expect(result.metadata).toEqual(trace.metadata);
    expect(result.createdAt).toEqual(new Date(trace.created_at));
    expect(result.updatedAt).toEqual(new Date(trace.updated_at));
  });

  it("should find a trace if no timestamp is provided", async () => {
    const traceId = v4();

    const trace = {
      id: traceId,
      project_id: projectId,
      session_id: v4(),
      timestamp: Date.now(),
      metadata: {},
      public: false,
      bookmarked: false,
      name: "Test Trace",
      tags: [],
      release: null,
      version: null,
      user_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      is_deleted: 0,
    };

    await createTrace(trace);

    const result = await getTraceByIdOrThrow(traceId, projectId);
    expect(result.id).toEqual(trace.id);
    expect(result.projectId).toEqual(trace.project_id);
    expect(result.name).toEqual(trace.name);
    expect(result.timestamp).toEqual(new Date(trace.timestamp));
    expect(result.tags).toEqual(trace.tags);
    expect(result.bookmarked).toEqual(trace.bookmarked);
    expect(result.release).toEqual(trace.release);
    expect(result.version).toEqual(trace.version);
    expect(result.userId).toEqual(trace.user_id);
    expect(result.sessionId).toEqual(trace.session_id);
    expect(result.public).toEqual(trace.public);
    expect(result.input).toEqual(null);
    expect(result.output).toEqual(null);
    expect(result.metadata).toEqual(trace.metadata);
    expect(result.createdAt).toEqual(new Date(trace.created_at));
    expect(result.updatedAt).toEqual(new Date(trace.updated_at));
  });
});
