import { v4 } from "uuid";
import {
  createObservationsCh,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { createObservation, createTrace } from "@langfuse/shared/src/server";
import {
  createScoresCh,
  createTraceScore,
  getTracesTable,
  getTracesTableCount,
  type TracesTableUiReturnType,
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

    const tableRows = await getTracesTable({
      projectId: project_id,
      filter: [],
      searchQuery: undefined,
      orderBy: undefined,
      limit: 1,
      page: 0,
    });

    expect(tableRows).toHaveLength(1);
    expect(tableRows[0].id).toEqual(trace_id);
    expect(tableRows[0].projectId).toEqual(project_id);
    expect(tableRows[0].tags.sort()).toEqual(trace.tags.sort());
    expect(tableRows[0].name).toEqual(trace.name);
    expect(tableRows[0].bookmarked).toEqual(trace.bookmarked);
    expect(tableRows[0].release).toEqual(trace.release);
    expect(tableRows[0].version).toEqual(trace.version);
    expect(tableRows[0].userId).toEqual(trace.user_id);
    expect(tableRows[0].sessionId).toEqual(trace.session_id);
    expect(tableRows[0].public).toEqual(trace.public);
  });

  it("#5274: should get a traces in expected default order", async () => {
    const project_id = v4();
    const trace_id = v4();

    // Trace1 happened after Trace2, but Trace2 got updated.
    const trace1 = createTrace({
      id: `${trace_id}-1`,
      project_id,
      timestamp: new Date().getTime(),
      event_ts: new Date().getTime(),
    });
    const trace2 = createTrace({
      id: `${trace_id}-2`,
      project_id,
      timestamp: new Date().getTime() - 5000,
      event_ts: new Date().getTime() + 5000,
    });
    await createTracesCh([trace1, trace2]);

    const tableRows = await getTracesTable({
      projectId: project_id,
      filter: [],
      searchQuery: undefined,
      orderBy: { column: "timestamp", order: "DESC" },
      limit: 2,
      page: 0,
    });

    expect(tableRows).toHaveLength(2);
    expect(tableRows[0].id).toEqual(`${trace_id}-1`);
    expect(tableRows[1].id).toEqual(`${trace_id}-2`);
  });

  it("should get a correct trace with observations", async () => {
    const project_id = v4();
    const trace_id = v4();

    const trace = createTrace({ id: trace_id, project_id });
    await createTracesCh([trace]);

    const obs1 = createObservation({ trace_id, project_id });
    const obs2 = createObservation({ trace_id, project_id });
    await createObservationsCh([obs1, obs2]);

    const tableRows = await getTracesTable({
      projectId: project_id,
      filter: [],
      searchQuery: undefined,
      orderBy: undefined,
      limit: 1,
      page: 0,
    });

    expect(tableRows).toHaveLength(1);
    expect(tableRows[0].id).toEqual(trace_id);
    expect(tableRows[0].projectId).toEqual(project_id);
    expect(tableRows[0].tags.sort()).toEqual(trace.tags.sort());
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
    expected: Partial<TracesTableUiReturnType>[];
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
      observationInput: [
        { usage_details: { total: 100 } },
        { usage_details: { total: 200 } },
      ],
      filterstate: [
        {
          column: "totalTokens",
          operator: ">" as const,
          value: 3456789,
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

      const tableRows = await getTracesTable({
        projectId: project_id,
        filter: testConfig.filterstate,
        searchQuery: undefined,
        orderBy: undefined,
        limit: 1,
        page: 0,
      });

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

  // The scores CTE is restricted to the score names referenced by the filters.
  // These cover the cases where that restriction could change results: scores
  // under other names must not affect matching, and negated operators must still
  // see traces that carry no score of the filtered name at all.
  describe("score name pushdown", () => {
    const seedProject = async () => {
      const project_id = v4();
      const matching = v4();
      const wrongValue = v4();
      const otherNameOnly = v4();
      const noScores = v4();
      const timestamp = new Date().getTime();

      await createTracesCh(
        [matching, wrongValue, otherNameOnly, noScores].map((id) =>
          createTrace({ id, project_id, timestamp }),
        ),
      );

      await createScoresCh([
        // Target name, passes `< 0`. Also carries an unrelated score so the CTE
        // has a name to drop for a trace that must still match.
        createTraceScore({
          project_id,
          trace_id: matching,
          name: "target",
          value: -5,
          timestamp,
        }),
        createTraceScore({
          project_id,
          trace_id: matching,
          name: "unrelated",
          value: 100,
          timestamp,
        }),
        // Target name, fails `< 0`.
        createTraceScore({
          project_id,
          trace_id: wrongValue,
          name: "target",
          value: 7,
          timestamp,
        }),
        // Only an unrelated name: must not match a positive filter on "target".
        createTraceScore({
          project_id,
          trace_id: otherNameOnly,
          name: "unrelated",
          value: -42,
          timestamp,
        }),
        // Boolean scores for the negated-operator case. `matching` carries
        // flag:true, `wrongValue` carries flag:false, and the remaining two
        // traces carry no "flag" score at all.
        createTraceScore({
          project_id,
          trace_id: matching,
          name: "flag",
          value: 1,
          string_value: "true",
          data_type: "BOOLEAN",
          timestamp,
        }),
        createTraceScore({
          project_id,
          trace_id: wrongValue,
          name: "flag",
          value: 0,
          string_value: "false",
          data_type: "BOOLEAN",
          timestamp,
        }),
      ]);

      return { project_id, matching, wrongValue, otherNameOnly, noScores };
    };

    it("matches only traces whose named score satisfies the filter", async () => {
      const { project_id, matching } = await seedProject();

      const filter: FilterState = [
        {
          column: "scores_avg",
          type: "numberObject",
          key: "target",
          operator: "<",
          value: 0,
        },
      ];

      const rows = await getTracesTable({
        projectId: project_id,
        filter,
        searchQuery: undefined,
        orderBy: undefined,
        limit: 50,
        page: 0,
      });

      expect(rows.map((r) => r.id)).toEqual([matching]);

      // countAll takes the same CTE path and must agree with the row query.
      const count = await getTracesTableCount({
        projectId: project_id,
        filter,
        searchType: [],
      });
      expect(count).toEqual(1);
    });

    it("keeps negated operators consistent for traces without the named score", async () => {
      const { project_id, matching, wrongValue, otherNameOnly, noScores } =
        await seedProject();

      // NOT has(score_booleans, 'flag:true'). The pushdown restricts the CTE to
      // name = 'flag', which leaves traces that never had a "flag" score without
      // a CTE row at all. The LEFT JOIN fills those with an empty array, so they
      // must still satisfy the negation — exactly as they would have with the
      // unrestricted CTE.
      const rows = await getTracesTable({
        projectId: project_id,
        filter: [
          {
            column: "score_booleans",
            type: "booleanObject",
            key: "flag",
            operator: "<>",
            value: true,
          },
        ],
        searchQuery: undefined,
        orderBy: undefined,
        limit: 50,
        page: 0,
      });

      const ids = rows.map((r) => r.id).sort();
      expect(ids).toEqual([wrongValue, otherNameOnly, noScores].sort());
      expect(ids).not.toContain(matching);
    });
  });
});
