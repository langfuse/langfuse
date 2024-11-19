import { v4 } from "uuid";
import {
  createObservations,
  createTraces,
} from "@/src/__tests__/server/repositories/clickhouse-helpers";
import {
  createObservation,
  createTrace,
} from "@/src/__tests__/fixtures/tracing-factory";
import { getTracesTable } from "@langfuse/shared/src/server";

describe("Traces table API test", () => {
  it("should get a correct trace without observation row for the UI", async () => {
    const project_id = v4();
    const trace_id = v4();

    const trace = createTrace({ id: trace_id, project_id });
    await createTraces([trace]);

    const tableRows = await getTracesTable(
      project_id,
      [],
      undefined,
      undefined,
      1,
      0,
    );

    expect(tableRows).toHaveLength(1);
    expect(tableRows[0].id).toEqual(trace_id);
    expect(tableRows[0].projectId).toEqual(project_id);
    expect(tableRows[0].tags).toEqual(trace.tags);
    expect(tableRows[0].name).toEqual(trace.name);
    expect(tableRows[0].bookmarked).toEqual(trace.bookmarked);
    expect(tableRows[0].release).toEqual(trace.release);
    expect(tableRows[0].version).toEqual(trace.version);
    expect(tableRows[0].userId).toEqual(trace.user_id);
    expect(tableRows[0].sessionId).toEqual(trace.session_id);
    expect(tableRows[0].public).toEqual(trace.public);
    expect(tableRows[0].latencyMilliseconds).toBeGreaterThanOrEqual(0);
    expect(tableRows[0].usageDetails).toEqual({});
    expect(tableRows[0].costDetails).toEqual({});
    expect(tableRows[0].level).toBeDefined();
    expect(tableRows[0].observationCount).toBeGreaterThanOrEqual(0);
    expect(tableRows[0].scoresAvg).toEqual([]);
  });

  it("should get a correct trace with observations row for the UI", async () => {
    const project_id = v4();
    const trace_id = v4();

    const trace = createTrace({ id: trace_id, project_id });
    await createTraces([trace]);

    const obs1 = createObservation({ trace_id, project_id });
    const obs2 = createObservation({ trace_id, project_id });
    await createObservations([obs1, obs2]);

    const tableRows = await getTracesTable(
      project_id,
      [],
      undefined,
      undefined,
      1,
      0,
    );

    expect(tableRows).toHaveLength(1);
    expect(tableRows[0].id).toEqual(trace_id);
    expect(tableRows[0].projectId).toEqual(project_id);
    expect(tableRows[0].tags).toEqual(trace.tags);
    expect(tableRows[0].name).toEqual(trace.name);
    expect(tableRows[0].bookmarked).toEqual(trace.bookmarked);
    expect(tableRows[0].release).toEqual(trace.release);
    expect(tableRows[0].version).toEqual(trace.version);
    expect(tableRows[0].userId).toEqual(trace.user_id);
    expect(tableRows[0].sessionId).toEqual(trace.session_id);
    expect(tableRows[0].public).toEqual(trace.public);
    expect(tableRows[0].latencyMilliseconds).toBeGreaterThanOrEqual(0);
    expect(tableRows[0].usageDetails).toEqual({
      input: (obs1.usage_details.input + obs2.usage_details.input).toString(),
      output: (
        obs1.usage_details.output + obs2.usage_details.output
      ).toString(),
      total: (obs1.usage_details.total + obs2.usage_details.total).toString(),
    });
    expect(tableRows[0].costDetails).toEqual({
      input: obs1.cost_details.input + obs2.cost_details.input,
      output: obs1.cost_details.output + obs2.cost_details.output,
      total: obs1.cost_details.total + obs2.cost_details.total,
    });
    expect(tableRows[0].level).toBeDefined();
    expect(tableRows[0].observationCount).toBeGreaterThanOrEqual(0);
    expect(tableRows[0].scoresAvg).toEqual([]);
  });
});
