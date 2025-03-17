import { randomUUID } from "crypto";
import { expect, describe, it } from "vitest";
import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createScore,
  createScoresCh,
  createTrace,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { getDatabaseReadStream } from "../features/batchExport/handleBatchExportJob";
import { BatchExportTableName } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

describe("batch export test suite", () => {
  it("should export observations", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "SPAN",
      }),
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
      }),
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "EVENT",
      }),
    ];

    const score = createScore({
      project_id: projectId,
      trace_id: randomUUID(),
      observation_id: observations[0].id,
      name: "test",
      value: 123,
    });

    await createScoresCh([score]);
    await createObservationsCh(observations);

    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Observations,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
      orderBy: { column: "startTime", order: "DESC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: observations[0].id,
          name: observations[0].name,
          type: observations[0].type,
          test: [score.value],
        }),
        expect.objectContaining({
          id: observations[1].id,
          name: observations[1].name,
          type: observations[1].type,
        }),
        expect.objectContaining({
          id: observations[2].id,
          name: observations[2].name,
          type: observations[2].type,
        }),
      ]),
    );
  });

  it("should export observations with filter and sorting", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test1",
        start_time: new Date("2024-01-01").getTime(),
      }),
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "EVENT",
        name: "test2",
        start_time: new Date("2024-01-02").getTime(),
      }),
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "SPAN",
        name: "test3",
        start_time: new Date("2024-01-03").getTime(),
      }),
    ];

    await createObservationsCh(observations);

    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Observations,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "name",
          value: ["test1", "test2"],
        },
      ],
      orderBy: { column: "startTime", order: "ASC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("test1");
    expect(rows[1].name).toBe("test2");
  });

  it("should export sessions", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const sessionId = randomUUID();
    const sessionId2 = randomUUID();

    await prisma.traceSession.createMany({
      data: [
        {
          id: sessionId,
          projectId,
        },
        {
          id: sessionId2,
          projectId,
        },
      ],
    });

    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId,
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId2,
      }),
    ];

    await createTracesCh(traces);

    const generations = [
      createObservation({
        project_id: projectId,
        trace_id: traces[0].id,
        type: "GENERATION",
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[1].id,
        type: "GENERATION",
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[1].id,
        type: "GENERATION",
      }),
    ];

    const score = createScore({
      project_id: projectId,
      trace_id: randomUUID(),
      observation_id: generations[0].id,
      name: "test",
      value: 123,
    });

    await createScoresCh([score]);
    await createObservationsCh(generations);

    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Sessions,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
      orderBy: { column: "createdAt", order: "DESC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(2);

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: traces[0].session_id,
          countTraces: 1,
        }),
        expect.objectContaining({
          id: traces[1].session_id,
          countTraces: 1,
        }),
      ]),
    );
  });

  it("should export sessions with filter and sorting", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();
    const sessionId3 = randomUUID();

    await prisma.traceSession.createMany({
      data: [
        {
          id: sessionId1,
          projectId,
        },
        {
          id: sessionId2,
          projectId,
        },
        {
          id: sessionId3,
          projectId,
        },
      ],
    });

    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId1,
        name: "trace1",
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId2,
        name: "trace2",
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId3,
        name: "trace3",
      }),
    ];

    await createTracesCh(traces);

    const generations = [
      createObservation({
        project_id: projectId,
        trace_id: traces[0].id,
        type: "GENERATION",
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[1].id,
        type: "GENERATION",
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[2].id,
        type: "GENERATION",
      }),
    ];

    await createObservationsCh(generations);

    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Sessions,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "ID",
          value: [sessionId1, sessionId2],
        },
      ],
      orderBy: { column: "id", order: "ASC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(2);

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sessionId1,
          countTraces: 1,
        }),
        expect.objectContaining({
          id: sessionId2,
          countTraces: 1,
        }),
      ]),
    );
  });

  it("should export traces", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
      }),
    ];

    await createTracesCh(traces);

    const generations = [
      createObservation({
        project_id: projectId,
        trace_id: traces[0].id,
        type: "GENERATION",
        start_time: new Date().getTime() - 1000,
        end_time: new Date().getTime(),
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[1].id,
        type: "GENERATION",
        start_time: new Date().getTime() - 2000,
        end_time: new Date().getTime(),
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[1].id,
        type: "GENERATION",
        start_time: new Date().getTime() - 2123,
        end_time: new Date().getTime(),
      }),
    ];

    const score = createScore({
      project_id: projectId,
      trace_id: traces[0].id,
      observation_id: generations[0].id,
      name: "test",
      value: 123,
    });

    const qualitativeScore = createScore({
      project_id: projectId,
      trace_id: traces[0].id,
      observation_id: generations[0].id,
      name: "qualitative_test",
      value: undefined,
      string_value: "This is some qualitative text",
      data_type: "CATEGORICAL",
    });

    await createScoresCh([score, qualitativeScore]);
    await createObservationsCh(generations);

    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Traces,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
      orderBy: { column: "timestamp", order: "DESC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(2);

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: traces[0].id,
          latency: expect.closeTo(1.0, 0.1), // allows deviation of ±0.1
          test: [score.value],
          qualitative_test: ["This is some qualitative text"],
        }),
        expect.objectContaining({
          id: traces[1].id,
          latency: expect.closeTo(2.123, 0.1), // allows deviation of ±0.1
          test: null,
          qualitative_test: null,
        }),
      ]),
    );
  });
  it("should export traces with filter and sort", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace0",
        timestamp: new Date("2024-01-01").getTime(),
        bookmarked: true,
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace1",
        timestamp: new Date("2024-01-02").getTime(),
        bookmarked: true,
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace2",
        timestamp: new Date("2024-01-02").getTime(),
        bookmarked: false,
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace3",
        timestamp: new Date("2024-01-02").getTime(),
        bookmarked: false,
      }),
    ];

    await createTracesCh(traces);

    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Traces,
      cutoffCreatedAt: new Date("2024-01-02"),
      filter: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "name",
          value: ["trace0", "trace2"],
        },
        {
          type: "boolean",
          operator: "=",
          column: "bookmarked",
          value: true,
        },
      ],
      orderBy: { column: "timestamp", order: "ASC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(1);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "trace0",
        }),
      ]),
    );
  });

  it("should export scores with filter and sorting", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create traces to associate scores with
    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace-for-scores-1",
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace-for-scores-2",
        timestamp: new Date("2024-01-02").getTime(),
      }),
    ];

    await createTracesCh(traces);

    // Create observations to associate scores with
    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: traces[0].id,
        id: randomUUID(),
        type: "GENERATION",
        name: "observation-for-scores-1",
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[1].id,
        id: randomUUID(),
        type: "GENERATION",
        name: "observation-for-scores-2",
      }),
    ];

    await createObservationsCh(observations);

    // Create scores with different names and values
    const scores = [
      createScore({
        project_id: projectId,
        trace_id: traces[0].id,
        observation_id: observations[0].id,
        name: "accuracy",
        value: 0.85,
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createScore({
        project_id: projectId,
        trace_id: traces[0].id,
        observation_id: observations[0].id,
        name: "relevance",
        value: 0.75,
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createScore({
        project_id: projectId,
        trace_id: traces[1].id,
        observation_id: observations[1].id,
        name: "accuracy",
        value: 0.92,
        timestamp: new Date("2024-01-02").getTime(),
      }),
      createScore({
        project_id: projectId,
        trace_id: traces[1].id,
        observation_id: observations[1].id,
        name: "helpfulness",
        value: 0.88,
        timestamp: new Date("2024-01-02").getTime(),
      }),
    ];

    await createScoresCh(scores);

    // Export scores with filter on name and sort by timestamp
    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Scores,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "name",
          value: ["accuracy", "relevance"],
        },
      ],
      orderBy: { column: "timestamp", order: "ASC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    // Should only include scores with names "accuracy" or "relevance"
    expect(rows).toHaveLength(3);

    // Verify the scores are sorted by timestamp ASC
    expect(rows[0].name).toBe("accuracy");
    expect(rows[0].value).toBe(0.85);
    expect(rows[0].traceId).toBe(traces[0].id);

    expect(rows[1].name).toBe("relevance");
    expect(rows[1].value).toBe(0.75);
    expect(rows[1].traceId).toBe(traces[0].id);

    expect(rows[2].name).toBe("accuracy");
    expect(rows[2].value).toBe(0.92);
    expect(rows[2].traceId).toBe(traces[1].id);
  });

  it("should export scores with qualitative values", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create a trace to associate scores with
    const trace = createTrace({
      project_id: projectId,
      id: randomUUID(),
      name: "trace-for-qualitative-scores",
    });

    await createTracesCh([trace]);

    // Create an observation to associate scores with
    const observation = createObservation({
      project_id: projectId,
      trace_id: trace.id,
      id: randomUUID(),
      type: "GENERATION",
      name: "observation-for-qualitative-scores",
    });

    await createObservationsCh([observation]);

    // Create scores with string values
    const scores = [
      createScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observation.id,
        name: "category",
        string_value: "excellent",
      }),
      createScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observation.id,
        name: "feedback",
        string_value: "The response was very helpful and accurate.",
      }),
    ];

    await createScoresCh(scores);

    // Export all scores
    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Scores,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
      orderBy: { column: "name", order: "ASC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(2);

    // Verify the qualitative scores - just check the essential properties
    expect(
      rows.map((row) => ({
        name: row.name,
        stringValue: row.stringValue,
        traceId: row.traceId,
      })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "category",
          stringValue: "excellent",
          traceId: trace.id,
        }),
        expect.objectContaining({
          name: "feedback",
          stringValue: "The response was very helpful and accurate.",
          traceId: trace.id,
        }),
      ]),
    );
  });

  it("should export scores with date range filtering", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create a trace to associate scores with
    const trace = createTrace({
      project_id: projectId,
      id: randomUUID(),
      name: "trace-for-date-range",
    });

    await createTracesCh([trace]);

    // Create an observation to associate scores with
    const observation = createObservation({
      project_id: projectId,
      trace_id: trace.id,
      id: randomUUID(),
      type: "GENERATION",
      name: "observation-for-date-range",
    });

    await createObservationsCh([observation]);

    // Create scores with different timestamps
    const scores = [
      createScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observation.id,
        name: "score1",
        value: 0.5,
        timestamp: new Date("2024-01-01T10:00:00Z").getTime(),
      }),
      createScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observation.id,
        name: "score2",
        value: 0.6,
        timestamp: new Date("2024-01-15T10:00:00Z").getTime(),
      }),
      createScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observation.id,
        name: "score3",
        value: 0.7,
        timestamp: new Date("2024-01-30T10:00:00Z").getTime(),
      }),
    ];

    await createScoresCh(scores);

    // Export scores with date range filter
    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Scores,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "datetime",
          operator: ">=",
          column: "timestamp",
          value: new Date("2024-01-10T00:00:00Z"),
        },
        {
          type: "datetime",
          operator: "<",
          column: "timestamp",
          value: new Date("2024-01-20T00:00:00Z"),
        },
      ],
      orderBy: { column: "timestamp", order: "ASC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    // Should only include scores within the date range
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("score2");
    expect(rows[0].value).toBe(0.6);
    expect(new Date(rows[0].timestamp).toISOString()).toBe(
      "2024-01-15T10:00:00.000Z",
    );
  });

  it("should export scores with multiple filter conditions", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create traces to associate scores with
    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace-multi-filter-1",
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace-multi-filter-2",
      }),
    ];

    await createTracesCh(traces);

    // Create observations to associate scores with
    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: traces[0].id,
        id: randomUUID(),
        type: "GENERATION",
        name: "observation-multi-filter-1",
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[1].id,
        id: randomUUID(),
        type: "GENERATION",
        name: "observation-multi-filter-2",
      }),
    ];

    await createObservationsCh(observations);

    // Create scores with different attributes
    const scores = [
      createScore({
        project_id: projectId,
        trace_id: traces[0].id,
        observation_id: observations[0].id,
        name: "quality",
        value: 0.7,
        source: "API",
      }),
      createScore({
        project_id: projectId,
        trace_id: traces[0].id,
        observation_id: observations[0].id,
        name: "quality",
        value: 0.8,
        source: "UI",
      }),
      createScore({
        project_id: projectId,
        trace_id: traces[1].id,
        observation_id: observations[1].id,
        name: "quality",
        value: 0.9,
        source: "API",
      }),
      createScore({
        project_id: projectId,
        trace_id: traces[1].id,
        observation_id: observations[1].id,
        name: "relevance",
        value: 0.85,
        source: "API",
      }),
    ];

    await createScoresCh(scores);

    // Export scores with multiple filter conditions
    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Scores,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "name",
          value: ["quality"],
        },
        {
          type: "stringOptions",
          operator: "any of",
          column: "source",
          value: ["API"],
        },
        {
          type: "number",
          operator: ">=",
          column: "value",
          value: 0.8,
        },
      ],
      orderBy: { column: "value", order: "ASC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    // Should only include scores that match all filter conditions
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("quality");
    expect(rows[0].source).toBe("API");
    expect(rows[0].value).toBe(0.9);
    expect(rows[0].traceId).toBe(traces[1].id);
  });
});
