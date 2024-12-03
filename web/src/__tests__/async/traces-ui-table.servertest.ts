import { v4 } from "uuid";
import {
  createObservationsCh,
  createTracesCh,
} from "@/src/__tests__/async/repositories/clickhouse-helpers";
import {
  createObservation,
  createTrace,
} from "@/src/__tests__/fixtures/tracing-factory";
import {
  getTracesTable,
  type TracesAllUiReturnType,
  type ObservationRecordInsertType,
  type TraceRecordInsertType,
} from "@langfuse/shared/src/server";
import { type FilterState } from "@langfuse/shared";

describe("Traces table API test", () => {
  it("should get a correct trace without observation", async () => {
    const project_id = v4();
    const trace_id = v4();

    const trace = createTrace({ id: trace_id, project_id });
    await createTracesCh([trace]);

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
  });

  it("should get a correct trace with observations", async () => {
    const project_id = v4();
    const trace_id = v4();

    const trace = createTrace({ id: trace_id, project_id });
    await createTracesCh([trace]);

    const obs1 = createObservation({ trace_id, project_id });
    const obs2 = createObservation({ trace_id, project_id });
    await createObservationsCh([obs1, obs2]);

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
  });

  type TestCase = {
    traceInput: Partial<TraceRecordInsertType>;
    observationInput: Partial<ObservationRecordInsertType>[];
    filterstate: FilterState;
    expected: Partial<TracesAllUiReturnType>[];
  };

  [
    {
      traceInput: {},
      observationInput: [
        { cost_details: { total: 100 } },
        { cost_details: { total: 200 } },
      ],
      filterstate: [
        {
          column: "totalCost",
          operator: ">" as const,
          value: 100000,
          type: "number" as const,
        },
      ],
      expected: [],
    },
    {
      traceInput: {},
      observationInput: [],
      filterstate: [
        {
          column: "id",
          operator: "=" as const,
          value: "some-id",
          type: "string" as const,
        },
      ],
      expected: [],
    },
    {
      traceInput: {},
      observationInput: [],
      filterstate: [
        {
          column: "Latency (s)",
          operator: ">" as const,
          value: 5_000_000, // Verify that we can pass large values
          type: "number" as const,
        },
      ],
      expected: [],
    },
  ].forEach(async (testConfig: TestCase) => {
    it(`should get a correct trace with filters ${JSON.stringify(testConfig)}`, async () => {
      const project_id = v4();
      const trace_id = v4();

      const trace = createTrace({
        id: trace_id,
        project_id,
        ...testConfig.traceInput,
      });
      await createTracesCh([trace]);

      expect(testConfig.observationInput.length).not.toBeGreaterThan(2);

      const obs1 = createObservation({
        trace_id,
        project_id,
        ...(testConfig.observationInput.length > 0
          ? testConfig.observationInput[0]
          : {}),
      });
      const obs2 = createObservation({
        trace_id,
        project_id,
        ...(testConfig.observationInput.length > 1
          ? testConfig.observationInput[1]
          : {}),
      });
      await createObservationsCh([obs1, obs2]);

      const tableRows = await getTracesTable(
        project_id,
        testConfig.filterstate,
        undefined,
        undefined,
        1,
        0,
      );

      expect(tableRows).toHaveLength(testConfig.expected.length);
      testConfig.expected.forEach((expectedTrace, index) => {
        if (expectedTrace.id !== undefined) {
          expect(tableRows[index].id).toEqual(expectedTrace.id);
        }
        if (expectedTrace.projectId !== undefined) {
          expect(tableRows[index].projectId).toEqual(expectedTrace.projectId);
        }
        if (expectedTrace.tags !== undefined) {
          expect(tableRows[index].tags).toEqual(expectedTrace.tags);
        }
        if (expectedTrace.name !== undefined) {
          expect(tableRows[index].name).toEqual(expectedTrace.name);
        }
        if (expectedTrace.bookmarked !== undefined) {
          expect(tableRows[index].bookmarked).toEqual(expectedTrace.bookmarked);
        }
        if (expectedTrace.release !== undefined) {
          expect(tableRows[index].release).toEqual(expectedTrace.release);
        }
        if (expectedTrace.version !== undefined) {
          expect(tableRows[index].version).toEqual(expectedTrace.version);
        }
        if (expectedTrace.userId !== undefined) {
          expect(tableRows[index].userId).toEqual(expectedTrace.userId);
        }
        if (expectedTrace.sessionId !== undefined) {
          expect(tableRows[index].sessionId).toEqual(expectedTrace.sessionId);
        }
        if (expectedTrace.public !== undefined) {
          expect(tableRows[index].public).toEqual(expectedTrace.public);
        }
      });
    });
  });
});
