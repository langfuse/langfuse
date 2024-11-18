import {
  createObservation,
  createTraces,
} from "@/src/__tests__/server/repositories/clickhouse-helpers";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { getTracesTable } from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("UI Traces table", () => {
  beforeEach(async () => {
    await pruneDatabase();
  });

  it("should return a single trace", async () => {
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
      tags: ["tag-alpha", "tag-beta"],
      release: "alpha",
      version: "1.0.0",
      user_id: "user-id-1",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      is_deleted: 0,
    };

    await createTraces([trace]);

    const result = await getTracesTable(
      projectId,
      [],
      undefined,
      undefined,
      10,
      0,
    );

    expect(result.length).toEqual(1);

    expect(result[0].id).toEqual(trace.id);
    expect(result[0].projectId).toEqual(trace.project_id);
    expect(result[0].name).toEqual(trace.name);
    expect(result[0].timestamp).toEqual(new Date(trace.timestamp));
    expect(result[0].tags).toEqual(trace.tags);
    expect(result[0].bookmarked).toEqual(trace.bookmarked);
    expect(result[0].release).toEqual(trace.release);
    expect(result[0].version).toEqual(trace.version);
    expect(result[0].userId).toEqual(trace.user_id);
    expect(result[0].sessionId).toEqual(trace.session_id);
    expect(result[0].public).toEqual(trace.public);
    expect(result[0].tags).toEqual(trace.tags);
  });

  it("should return a trace joined with an observation", async () => {
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
      tags: ["tag-alpha", "tag-beta"],
      release: "alpha",
      version: "1.0.0",
      user_id: "user-id-1",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      is_deleted: 0,
    };

    const observation = {
      id: v4(),
      project_id: projectId,
      trace_id: traceId,
      prompt_id: v4(),
      type: "GENERATION",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      is_deleted: 0,
      metadata: {
        some: "metadata",
      },
      start_time: Date.now(),
      provided_usage_details: {},
      provided_cost_details: {},
      usage_details: { input: 100, output: 200 },
      cost_details: { input: 100, output: 200 },
      name: "Test Observation",
      level: "WARNING",
      input: "some llm input",
      output: "some llm output",
      version: "1.2.0",
      parent_observation_id: null,
      status_message: "this is an error",
      provided_model_name: "anthropic",
      internal_model_id: "some-model-id",
      model_parameters: JSON.stringify({
        model: "test-model",
        model_version: "1",
        model_parameters: {},
      }),
      total_cost: 100,
      prompt_name: "Test Prompt",
      prompt_version: 1,
      end_time: Date.now(),
      completion_start_time: Date.now(),
    };

    await createTraces([trace]);
    await createObservation(observation);

    const result = await getTracesTable(
      projectId,
      [],
      undefined,
      undefined,
      10,
      0,
    );

    expect(result.length).toEqual(1);

    expect(result[0].id).toEqual(trace.id);
    expect(result[0].projectId).toEqual(trace.project_id);
    expect(result[0].name).toEqual(trace.name);
    expect(result[0].timestamp).toEqual(new Date(trace.timestamp));
    expect(result[0].tags).toEqual(trace.tags);
    expect(result[0].bookmarked).toEqual(trace.bookmarked);
    expect(result[0].release).toEqual(trace.release);
    expect(result[0].version).toEqual(trace.version);
    expect(result[0].userId).toEqual(trace.user_id);
    expect(result[0].sessionId).toEqual(trace.session_id);
    expect(result[0].public).toEqual(trace.public);
    expect(result[0].observationCount).toEqual(1);
    expect(result[0].costDetails).toEqual({
      input: 100,
      output: 200,
    });
  });
});
