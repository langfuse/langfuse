import { randomUUID } from "crypto";
import { expect, describe, it } from "vitest";
import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTraceScore,
  createScoresCh,
  createTrace,
  createTracesCh,
  createManyDatasetItems,
  applyCommentFilters,
  createEvent,
  createEventsCh,
  getEventsForBlobStorageExport,
} from "@langfuse/shared/src/server";
import { BatchExportTableName, DatasetStatus } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { getDatabaseReadStreamPaginated } from "../features/database-read-stream/getDatabaseReadStream";
import { getObservationStream } from "../features/database-read-stream/observation-stream";
import { getTraceStream } from "../features/database-read-stream/trace-stream";
import { getEventsStream } from "../features/database-read-stream/event-stream";
// Set environment variable before any imports to ensure it's picked up by env module
process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
  "true";
process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION = "true";

const maybeDescribe =
  process.env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true"
    ? describe
    : describe.skip;

describe("batch export test suite", () => {
  it("should export observations", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();

    const trace = createTrace({
      project_id: projectId,
      id: traceId,
    });

    await createTracesCh([trace]);

    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: traceId,
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

    const score = createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: observations[0].id,
      name: "test",
      value: 123,
    });

    await createScoresCh([score]);
    await createObservationsCh(observations);

    const stream = await getObservationStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
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
          input: "Hello World",
          output: "Hello John",
          metadata: expect.objectContaining({
            source: "API",
            server: "Node",
          }),
        }),
        expect.objectContaining({
          id: observations[1].id,
          name: observations[1].name,
          type: observations[1].type,
          input: "Hello World",
          output: "Hello John",
        }),
        expect.objectContaining({
          id: observations[2].id,
          name: observations[2].name,
          type: observations[2].type,
          input: "Hello World",
          output: "Hello John",
        }),
      ]),
    );
  });

  it("should export filtered observations", async () => {
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

    const stream = await getObservationStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "name",
          value: ["test1", "test2"],
        },
      ],
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(2);

    const exportedNames = rows.map((row) => row.name);
    expect(exportedNames).toEqual(expect.arrayContaining(["test1", "test2"]));
    expect(exportedNames).toHaveLength(2);

    // Verify input/output/metadata are properly exported
    rows.forEach((row) => {
      expect(row.input).toBe("Hello World");
      expect(row.output).toBe("Hello John");
      expect(row.metadata).toEqual(
        expect.objectContaining({
          source: "API",
          server: "Node",
        }),
      );
    });
  });

  it("should export observations with filter", async () => {
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

    const stream = await getObservationStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "name",
          value: ["test1", "test2"],
        },
      ],
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(2);

    const exportedNames = rows.map((row) => row.name);
    expect(exportedNames).toEqual(expect.arrayContaining(["test1", "test2"]));
    expect(exportedNames).toHaveLength(2);

    // Verify input/output/metadata are present
    rows.forEach((row) => {
      expect(row.input).toBe("Hello World");
      expect(row.output).toBe("Hello John");
      expect(row.metadata).toMatchObject({
        source: "API",
        server: "Node",
      });
    });
  });

  it("should export observations filtered by scores", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const trace = createTrace({
      project_id: projectId,
      id: randomUUID(),
    });

    await createTracesCh([trace]);

    // Create observations with different score values
    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: trace.id,
        id: randomUUID(),
        type: "GENERATION",
        name: "high-accuracy",
        start_time: new Date("2024-01-01").getTime(),
      }),
      createObservation({
        project_id: projectId,
        trace_id: trace.id,
        id: randomUUID(),
        type: "GENERATION",
        name: "medium-accuracy",
        start_time: new Date("2024-01-02").getTime(),
      }),
      createObservation({
        project_id: projectId,
        trace_id: trace.id,
        id: randomUUID(),
        type: "GENERATION",
        name: "low-accuracy",
        start_time: new Date("2024-01-03").getTime(),
      }),
    ];

    await createObservationsCh(observations);

    // Create scores with different values
    const scores = [
      createTraceScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observations[0].id,
        name: "accuracy",
        value: 0.95,
        data_type: "NUMERIC",
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observations[1].id,
        name: "accuracy",
        value: 0.75,
        data_type: "NUMERIC",
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observations[2].id,
        name: "accuracy",
        value: 0.45,
        data_type: "NUMERIC",
      }),
    ];

    await createScoresCh(scores);

    // Filter observations with accuracy >= 0.7
    const stream = await getObservationStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "numberObject",
          column: "Scores",
          key: "accuracy",
          operator: ">=",
          value: 0.7,
        },
      ],
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    // Should only include observations with accuracy >= 0.7
    expect(rows).toHaveLength(2);

    const exportedNames = rows.map((row) => row.name).sort();
    expect(exportedNames).toEqual(["high-accuracy", "medium-accuracy"]);

    // Verify scores are included in the export
    const highAccuracyRow = rows.find((r) => r.name === "high-accuracy");
    expect(highAccuracyRow?.accuracy).toEqual([0.95]);

    const mediumAccuracyRow = rows.find((r) => r.name === "medium-accuracy");
    expect(mediumAccuracyRow?.accuracy).toEqual([0.75]);
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

    const score = createTraceScore({
      project_id: projectId,
      trace_id: randomUUID(),
      observation_id: generations[0].id,
      name: "test",
      value: 123,
    });

    await createScoresCh([score]);
    await createObservationsCh(generations);

    const stream = await getDatabaseReadStreamPaginated({
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

    const stream = await getDatabaseReadStreamPaginated({
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

    const score = createTraceScore({
      project_id: projectId,
      trace_id: traces[0].id,
      name: "test",
      value: 123,
    });

    const qualitativeScore = createTraceScore({
      project_id: projectId,
      trace_id: traces[0].id,
      name: "qualitative_test",
      value: undefined,
      string_value: "This is some qualitative text",
      data_type: "CATEGORICAL",
    });

    const booleanScore = createTraceScore({
      project_id: projectId,
      trace_id: traces[0].id,
      name: "is_correct",
      value: 1,
      data_type: "BOOLEAN",
    });

    await createScoresCh([score, qualitativeScore, booleanScore]);

    const stream = await getTraceStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
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
          test: [score.value],
          qualitative_test: ["This is some qualitative text"],
          is_correct: [1],
        }),
        expect.objectContaining({
          id: traces[1].id,
          test: null,
          qualitative_test: null,
          is_correct: null,
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

    const stream = await getTraceStream({
      projectId: projectId,
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
      createTraceScore({
        project_id: projectId,
        trace_id: traces[0].id,
        observation_id: observations[0].id,
        name: "accuracy",
        value: 0.85,
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: traces[0].id,
        observation_id: observations[0].id,
        name: "relevance",
        value: 0.75,
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: traces[1].id,
        observation_id: observations[1].id,
        name: "accuracy",
        value: 0.92,
        timestamp: new Date("2024-01-02").getTime(),
      }),
      createTraceScore({
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
    const stream = await getDatabaseReadStreamPaginated({
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
      createTraceScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observation.id,
        name: "category",
        string_value: "excellent",
        data_type: "CATEGORICAL",
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observation.id,
        name: "feedback",
        string_value: "The response was very helpful and accurate.",
        data_type: "CATEGORICAL",
      }),
    ];

    await createScoresCh(scores);

    // Export all scores
    const stream = await getDatabaseReadStreamPaginated({
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
      createTraceScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observation.id,
        name: "score1",
        value: 0.5,
        timestamp: new Date("2024-01-01T10:00:00Z").getTime(),
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: trace.id,
        observation_id: observation.id,
        name: "score2",
        value: 0.6,
        timestamp: new Date("2024-01-15T10:00:00Z").getTime(),
      }),
      createTraceScore({
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
    const stream = await getDatabaseReadStreamPaginated({
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
      createTraceScore({
        project_id: projectId,
        trace_id: traces[0].id,
        observation_id: observations[0].id,
        name: "quality",
        value: 0.7,
        source: "API",
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: traces[0].id,
        observation_id: observations[0].id,
        name: "quality",
        value: 0.8,
        source: "UI",
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: traces[1].id,
        observation_id: observations[1].id,
        name: "quality",
        value: 0.9,
        source: "API",
      }),
      createTraceScore({
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
    const stream = await getDatabaseReadStreamPaginated({
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

  it("should export dataset items", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create dataset 1
    const datasetId = randomUUID();
    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: "test-dataset",
        projectId,
        description: "Test dataset for export",
        metadata: { purpose: "testing" },
      },
    });
    // Create dataset 2
    const datasetId2 = randomUUID();
    await prisma.dataset.create({
      data: {
        id: datasetId2,
        name: "test-dataset-2",
        projectId,
        description: "Invalid test dataset for export",
        metadata: { purpose: "testing exclusion" },
      },
    });

    // Create dataset items with different statuses and relationships
    const datasetItems = [
      {
        id: randomUUID(),
        datasetId,
        input: { question: "What is AI?" },
        expectedOutput: { answer: "Artificial Intelligence" },
        metadata: { category: "tech" },
        sourceTraceId: undefined,
        sourceObservationId: undefined,
      },
      {
        id: randomUUID(),
        datasetId,
        status: DatasetStatus.ARCHIVED,
        input: { question: "What is ML?" },
        expectedOutput: { answer: "Machine Learning" },
        metadata: { category: "tech" },
        sourceTraceId: randomUUID(),
        sourceObservationId: randomUUID(),
      },
      {
        id: randomUUID(),
        datasetId,
        input: { question: "What is DL?" },
        expectedOutput: { answer: "Deep Learning" },
        metadata: { category: "advanced" },
        sourceTraceId: randomUUID(),
        sourceObservationId: undefined,
      },
      {
        id: randomUUID(),
        datasetId: datasetId2,
        input: { question: "What is DL?" },
        expectedOutput: { answer: "Deep Learning" },
        metadata: { category: "advanced" },
        sourceTraceId: randomUUID(),
        sourceObservationId: undefined,
      },
    ];

    await createManyDatasetItems({
      projectId,
      items: datasetItems,
    });

    // Export dataset items
    const stream = await getDatabaseReadStreamPaginated({
      projectId,
      tableName: BatchExportTableName.DatasetItems,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "datasetId",
          value: [datasetId],
        },
      ],
      orderBy: { column: "createdAt", order: "DESC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    // Should only include dataset items from the correct dataset
    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: datasetItems[0].id,
          datasetName: "test-dataset",
          status: "ACTIVE",
          sourceTraceId: null,
          sourceObservationId: null,
          htmlSourcePath: "",
        }),
        expect.objectContaining({
          id: datasetItems[1].id,
          datasetName: "test-dataset",
          status: "ARCHIVED",
          sourceTraceId: datasetItems[1].sourceTraceId,
          sourceObservationId: datasetItems[1].sourceObservationId,
          htmlSourcePath: `/project/${projectId}/traces/${datasetItems[1].sourceTraceId}?observation=${datasetItems[1].sourceObservationId}`,
        }),
        expect.objectContaining({
          id: datasetItems[2].id,
          datasetName: "test-dataset",
          status: "ACTIVE",
          sourceTraceId: datasetItems[2].sourceTraceId,
          sourceObservationId: null,
          htmlSourcePath: `/project/${projectId}/traces/${datasetItems[2].sourceTraceId}`,
        }),
      ]),
    );
  });

  it("should export dataset items with source relationships", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create dataset
    const datasetId = randomUUID();
    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: "relationship-dataset",
        projectId,
      },
    });

    // Create traces and observations for source relationships
    const traceId1 = randomUUID();
    const traceId2 = randomUUID();
    const observationId1 = randomUUID();
    const observationId2 = randomUUID();

    const traces = [
      createTrace({
        project_id: projectId,
        id: traceId1,
        name: "source-trace-1",
      }),
      createTrace({
        project_id: projectId,
        id: traceId2,
        name: "source-trace-2",
      }),
    ];

    await createTracesCh(traces);

    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: traceId1,
        id: observationId1,
        type: "GENERATION",
        name: "source-observation-1",
      }),
      createObservation({
        project_id: projectId,
        trace_id: traceId2,
        id: observationId2,
        type: "GENERATION",
        name: "source-observation-2",
      }),
    ];

    await createObservationsCh(observations);

    // Create dataset items with different source relationships
    const datasetItems = [
      {
        id: randomUUID(),
        datasetId,
        projectId,
        status: DatasetStatus.ACTIVE,
        sourceTraceId: traceId1,
        sourceObservationId: observationId1,
        input: { from: "trace_and_observation" },
      },
      {
        id: randomUUID(),
        datasetId,
        projectId,
        status: DatasetStatus.ACTIVE,
        sourceTraceId: traceId2,
        sourceObservationId: undefined,
        input: { from: "trace_only" },
      },
      {
        id: randomUUID(),
        datasetId,
        projectId,
        status: DatasetStatus.ACTIVE,
        sourceTraceId: undefined,
        sourceObservationId: undefined,
        input: { from: "manual" },
      },
    ];

    await createManyDatasetItems({
      projectId,
      items: datasetItems,
    });

    // Export dataset items
    const stream = await getDatabaseReadStreamPaginated({
      projectId,
      tableName: BatchExportTableName.DatasetItems,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
      orderBy: { column: "createdAt", order: "ASC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(3);

    // Find items by their input to verify relationships
    const traceAndObsItem = rows.find(
      (r) => r.input?.from === "trace_and_observation",
    );
    const traceOnlyItem = rows.find((r) => r.input?.from === "trace_only");
    const manualItem = rows.find((r) => r.input?.from === "manual");

    expect(traceAndObsItem).toMatchObject({
      sourceTraceId: traceId1,
      sourceObservationId: observationId1,
      datasetName: "relationship-dataset",
    });

    expect(traceOnlyItem).toMatchObject({
      sourceTraceId: traceId2,
      sourceObservationId: null,
      datasetName: "relationship-dataset",
    });

    expect(manualItem).toMatchObject({
      sourceTraceId: null,
      sourceObservationId: null,
      datasetName: "relationship-dataset",
    });
  });

  it("should export audit logs", async () => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();

    // Create some audit log entries directly in the database
    const auditLogEntries = [
      {
        id: randomUUID(),
        projectId: projectId,
        orgId: orgId,
        type: "USER" as const,
        userId: randomUUID(),
        userOrgRole: "OWNER",
        userProjectRole: "ADMIN",
        resourceType: "trace",
        resourceId: randomUUID(),
        action: "CREATE",
        before: null,
        after: JSON.stringify({ name: "test-trace", version: 1 }),
        createdAt: new Date("2024-01-01T10:00:00Z"),
        updatedAt: new Date("2024-01-01T10:00:00Z"),
      },
      {
        id: randomUUID(),
        projectId: projectId,
        orgId: orgId,
        type: "API_KEY" as const,
        apiKeyId: randomUUID(),
        resourceType: "score",
        resourceId: randomUUID(),
        action: "UPDATE",
        before: JSON.stringify({ value: 0.5 }),
        after: JSON.stringify({ value: 0.8 }),
        createdAt: new Date("2024-01-02T10:00:00Z"),
        updatedAt: new Date("2024-01-02T10:00:00Z"),
      },
      {
        id: randomUUID(),
        projectId: projectId,
        orgId: orgId,
        type: "USER" as const,
        userId: randomUUID(),
        userOrgRole: "MEMBER",
        userProjectRole: "VIEWER",
        resourceType: "prompt",
        resourceId: randomUUID(),
        action: "DELETE",
        before: JSON.stringify({ name: "old-prompt", content: "Hello World" }),
        after: null,
        createdAt: new Date("2024-01-03T10:00:00Z"),
        updatedAt: new Date("2024-01-03T10:00:00Z"),
      },
    ];

    // Insert audit log entries
    await prisma.auditLog.createMany({
      data: auditLogEntries,
    });

    // Export audit logs
    const stream = await getDatabaseReadStreamPaginated({
      projectId: projectId,
      tableName: BatchExportTableName.AuditLogs,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
      orderBy: { column: "createdAt", order: "DESC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(3);

    // Verify the audit logs are sorted by createdAt DESC
    expect(rows[0].action).toBe("DELETE");
    expect(rows[0].resourceType).toBe("prompt");
    expect(rows[0].type).toBe("USER");
    expect(rows[0].before).toBe(
      JSON.stringify({ name: "old-prompt", content: "Hello World" }),
    );
    expect(rows[0].after).toBe(null);

    expect(rows[1].action).toBe("UPDATE");
    expect(rows[1].resourceType).toBe("score");
    expect(rows[1].type).toBe("API_KEY");
    expect(rows[1].before).toBe(JSON.stringify({ value: 0.5 }));
    expect(rows[1].after).toBe(JSON.stringify({ value: 0.8 }));

    expect(rows[2].action).toBe("CREATE");
    expect(rows[2].resourceType).toBe("trace");
    expect(rows[2].type).toBe("USER");
    expect(rows[2].before).toBe(null);
    expect(rows[2].after).toBe(
      JSON.stringify({ name: "test-trace", version: 1 }),
    );

    // Verify all rows have the correct project ID
    rows.forEach((row) => {
      expect(row.projectId).toBe(projectId);
      expect(row.orgId).toBe(orgId);
    });
  });

  it("should export traces with searchQuery and searchType filters applied correctly", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create traces with specific searchable content
    const traces = [
      createTrace({
        project_id: projectId,
        id: "search-test-id-1",
        name: "findable-trace-name",
        user_id: "searchable-user-123",
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: "search-test-id-2",
        name: "another-trace",
        user_id: "different-user-456",
        timestamp: new Date("2024-01-02").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: "other-trace-id",
        name: "unrelated-name",
        user_id: "unrelated-user",
        timestamp: new Date("2024-01-03").getTime(),
      }),
    ];

    await createTracesCh(traces);

    const streamByName = await getTraceStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
      searchQuery: "findable-trace",
      searchType: ["id"],
    });

    const rowsByName: any[] = [];
    for await (const chunk of streamByName) {
      rowsByName.push(chunk);
    }

    expect(rowsByName).toHaveLength(1);
    expect(rowsByName[0].name).toBe("findable-trace-name");
    expect(rowsByName[0].id).toBe("search-test-id-1");
  });

  it("should ignore observation-level filters when exporting traces", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create traces with different names
    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace-with-observations",
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "another-trace",
        timestamp: new Date("2024-01-02").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "third-trace",
        timestamp: new Date("2024-01-03").getTime(),
      }),
    ];

    await createTracesCh(traces);

    // Create observations with varying latencies
    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: traces[0].id,
        type: "GENERATION",
        start_time: new Date("2024-01-01T00:00:00Z").getTime(),
        end_time: new Date("2024-01-01T00:00:10Z").getTime(), // 10 seconds
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[1].id,
        type: "GENERATION",
        start_time: new Date("2024-01-02T00:00:00Z").getTime(),
        end_time: new Date("2024-01-02T00:00:02Z").getTime(), // 2 seconds
      }),
    ];

    await createObservationsCh(observations);

    // Apply filters that include observation-level filters
    // These should be ignored and all traces matching trace-level filters should be returned
    const stream = await getTraceStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        // Observation-level filter (should be ignored)
        {
          type: "number",
          operator: ">",
          column: "Latency (s)",
          value: 5,
        },
        // Trace-level filter (should be applied)
        {
          type: "stringOptions",
          operator: "any of",
          column: "Name",
          value: ["trace-with-observations", "another-trace"],
        },
      ],
    });

    const rows: any[] = [];
    for await (const chunk of stream) {
      rows.push(chunk);
    }

    // Should return both traces matching the name filter
    // Latency filter should be ignored since it's observation-level
    expect(rows).toHaveLength(2);
    const exportedNames = rows.map((row) => row.name).sort();
    expect(exportedNames).toEqual(["another-trace", "trace-with-observations"]);
  });

  it("should successfully export traces with mixed trace-level and observation-level filters", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "question_generator",
        environment: "taboola-trs",
        timestamp: new Date("2025-10-21T00:00:00Z").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "question_generator",
        environment: "kfc-search-engine-qna",
        timestamp: new Date("2025-10-21T01:00:00Z").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "other_trace",
        environment: "taboola-trs",
        timestamp: new Date("2025-10-21T02:00:00Z").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "question_generator",
        environment: "production",
        timestamp: new Date("2025-10-21T03:00:00Z").getTime(),
      }),
    ];

    await createTracesCh(traces);

    // This mirrors the query from the issue
    const stream = await getTraceStream({
      projectId: projectId,
      cutoffCreatedAt: new Date("2025-10-22T00:00:00Z"),
      filter: [
        // Observation-level filter (should be ignored)
        {
          type: "number",
          column: "Latency (s)",
          operator: ">",
          value: 5,
        },
        // Trace-level filters (should be applied)
        {
          type: "stringOptions",
          column: "Name",
          operator: "any of",
          value: ["question_generator"],
        },
        {
          type: "datetime",
          column: "timestamp",
          operator: ">=",
          value: new Date("2025-10-20T13:39:58.045Z"),
        },
        {
          type: "datetime",
          column: "timestamp",
          operator: "<=",
          value: new Date("2025-10-21T13:39:58.045Z"),
        },
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["taboola-trs", "kfc-search-engine-qna", "default"],
        },
      ],
    });

    const rows: any[] = [];
    for await (const chunk of stream) {
      rows.push(chunk);
    }

    // Should only return traces matching all trace-level filters
    // Observation-level latency filter should be ignored
    expect(rows).toHaveLength(2);
    const exportedEnvironments = rows.map((row) => row.environment).sort();
    expect(exportedEnvironments).toEqual([
      "kfc-search-engine-qna",
      "taboola-trs",
    ]);

    // All should have the correct name
    rows.forEach((row) => {
      expect(row.name).toBe("question_generator");
    });
  });

  it("should ignore trace-level filters when exporting observations", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create traces with tags
    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace-with-tag",
        tags: ["organizationSlug:karacare"],
        timestamp: new Date("2025-10-21T00:00:00Z").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace-without-tag",
        tags: [],
        timestamp: new Date("2025-10-21T01:00:00Z").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "trace-with-other-tag",
        tags: ["organizationSlug:other"],
        timestamp: new Date("2025-10-21T02:00:00Z").getTime(),
      }),
    ];

    await createTracesCh(traces);

    // Create observations for all traces with specific names
    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: traces[0].id,
        type: "GENERATION",
        name: "makeRecommendations",
        start_time: new Date("2025-10-21T00:00:00Z").getTime(),
        end_time: new Date("2025-10-21T00:00:05Z").getTime(),
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[1].id,
        type: "GENERATION",
        name: "makeRecommendations",
        start_time: new Date("2025-10-21T01:00:00Z").getTime(),
        end_time: new Date("2025-10-21T01:00:03Z").getTime(),
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[2].id,
        type: "EVENT",
        name: "otherOperation",
        start_time: new Date("2025-10-21T02:00:00Z").getTime(),
      }),
    ];

    await createObservationsCh(observations);

    // Apply filters that include trace-level filters (tags)
    // These should be ignored and all observations matching observation-level filters should be returned
    const stream = await getObservationStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        // Trace-level filter (should be ignored)
        {
          type: "arrayOptions",
          operator: "any of",
          column: "Trace Tags",
          value: ["organizationSlug:karacare"],
        },
        // Observation-level filters (should be applied)
        {
          type: "stringOptions",
          operator: "any of",
          column: "type",
          value: ["GENERATION"],
        },
        {
          type: "datetime",
          operator: ">=",
          column: "startTime",
          value: new Date("2025-10-20T22:00:00.000Z"),
        },
        {
          type: "datetime",
          operator: "<=",
          column: "startTime",
          value: new Date("2025-10-23T21:59:59.999Z"),
        },
      ],
      searchQuery: "makeRecommendations",
      searchType: ["id"],
    });

    const rows: any[] = [];
    for await (const chunk of stream) {
      rows.push(chunk);
    }

    // Should return both observations matching the observation-level filters
    // Tags filter should be ignored since it's trace-level
    expect(rows).toHaveLength(2);
    const exportedNames = rows.map((row) => row.name).sort();
    expect(exportedNames).toEqual([
      "makeRecommendations",
      "makeRecommendations",
    ]);

    // Verify both observations are included regardless of trace tags
    const traceIds = rows.map((row) => row.traceId).sort();
    expect(traceIds).toEqual([traces[0].id, traces[1].id].sort());
  });

  it("should successfully export observations with mixed observation-level and trace-level filters", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create traces with various tags and user IDs
    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "api-trace-1",
        tags: ["organizationSlug:acme", "env:production"],
        user_id: "user-123",
        timestamp: new Date("2025-10-21T00:00:00Z").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "api-trace-2",
        tags: ["organizationSlug:acme"],
        user_id: "user-456",
        timestamp: new Date("2025-10-21T01:00:00Z").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        name: "api-trace-3",
        tags: ["organizationSlug:other"],
        user_id: "user-789",
        timestamp: new Date("2025-10-21T02:00:00Z").getTime(),
      }),
    ];

    await createTracesCh(traces);

    // Create observations with specific properties
    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: traces[0].id,
        type: "GENERATION",
        name: "llm-call",
        environment: "production",
        start_time: new Date("2025-10-21T00:00:00Z").getTime(),
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[1].id,
        type: "GENERATION",
        name: "llm-call",
        environment: "production",
        start_time: new Date("2025-10-21T01:00:00Z").getTime(),
      }),
      createObservation({
        project_id: projectId,
        trace_id: traces[2].id,
        type: "GENERATION",
        name: "llm-call",
        environment: "staging",
        start_time: new Date("2025-10-21T02:00:00Z").getTime(),
      }),
    ];

    await createObservationsCh(observations);

    // Apply a mix of trace-level and observation-level filters
    const stream = await getObservationStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        // Trace-level filters (should be ignored)
        {
          type: "arrayOptions",
          operator: "any of",
          column: "Trace Tags",
          value: ["organizationSlug:acme"],
        },
        {
          type: "string",
          operator: "=",
          column: "User ID",
          value: "user-123",
        },
        // Observation-level filters (should be applied)
        {
          type: "stringOptions",
          operator: "any of",
          column: "type",
          value: ["GENERATION"],
        },
        {
          type: "stringOptions",
          operator: "any of",
          column: "environment",
          value: ["production"],
        },
        {
          type: "stringOptions",
          operator: "any of",
          column: "name",
          value: ["llm-call"],
        },
      ],
    });

    const rows: any[] = [];
    for await (const chunk of stream) {
      rows.push(chunk);
    }

    // Should only return observations matching observation-level filters
    // Trace-level filters (tags, userId) should be ignored
    expect(rows).toHaveLength(2);

    // Both observations should have production environment
    rows.forEach((row) => {
      expect(row.environment).toBe("production");
      expect(row.name).toBe("llm-call");
      expect(row.type).toBe("GENERATION");
    });

    // Should include observations from both traces with acme tag
    const traceIds = rows.map((row) => row.traceId).sort();
    expect(traceIds).toEqual([traces[0].id, traces[1].id].sort());
  });

  it("should apply Trace ID filter when exporting traces (bug fix test)", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create multiple traces
    const traces = [
      createTrace({
        project_id: projectId,
        id: "target-trace-id-123",
        name: "target-trace",
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: "other-trace-id-456",
        name: "other-trace",
        timestamp: new Date("2024-01-02").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: "another-trace-id-789",
        name: "another-trace",
        timestamp: new Date("2024-01-03").getTime(),
      }),
    ];

    await createTracesCh(traces);

    // Export traces with Trace ID filter (using both uiTableName and uiTableId)
    const streamById = await getTraceStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "Trace ID", // This should work but currently gets ignored
          value: ["target-trace-id-123"],
        },
      ],
    });

    const rowsById: any[] = [];
    for await (const chunk of streamById) {
      rowsById.push(chunk);
    }

    // Should return only the filtered trace
    expect(rowsById).toHaveLength(1);
    expect(rowsById[0].id).toBe("target-trace-id-123");
    expect(rowsById[0].name).toBe("target-trace");

    // Also test with the column ID variant
    const streamByIdVariant = await getTraceStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "traceId", // Using uiTableId variant
          value: ["other-trace-id-456"],
        },
      ],
    });

    const rowsByIdVariant: any[] = [];
    for await (const chunk of streamByIdVariant) {
      rowsByIdVariant.push(chunk);
    }

    // Should return only the filtered trace
    expect(rowsByIdVariant).toHaveLength(1);
    expect(rowsByIdVariant[0].id).toBe("other-trace-id-456");
    expect(rowsByIdVariant[0].name).toBe("other-trace");
  });

  it("should properly export traces with Thai and other non-ASCII characters", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create traces with Thai, Chinese, Arabic, and emoji characters
    const traces = [
      createTrace({
        project_id: projectId,
        name: "สวัสดี ภาษาไทย", // Thai: "Hello Thai language"
        user_id: "ผู้ใช้", // Thai: "user"
        metadata: {
          description: "การทดสอบภาษาไทย", // Thai: "Thai language test"
          mixed: "Hello สวัสดี 世界 مرحبا 🌍",
        },
        tags: ["ไทย", "テスト", "测试"],
      }),
      createTrace({
        project_id: projectId,
        name: "中文测试", // Chinese: "Chinese test"
        user_id: "用户", // Chinese: "user"
        metadata: {
          description: "这是中文测试", // Chinese: "This is a Chinese test"
        },
        tags: ["中文", "汉字"],
      }),
      createTrace({
        project_id: projectId,
        name: "العربية", // Arabic: "Arabic"
        user_id: "مستخدم", // Arabic: "user"
        metadata: {
          description: "اختبار اللغة العربية", // Arabic: "Arabic language test"
        },
        tags: ["عربي"],
      }),
    ];

    await createTracesCh(traces);

    // Export all traces
    const stream = await getTraceStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
    });

    const rows: any[] = [];
    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(3);

    // Verify Thai characters are preserved
    const thaiTrace = rows.find((r) => r.name === "สวัสดี ภาษาไทย");
    expect(thaiTrace).toBeDefined();
    expect(thaiTrace?.userId).toBe("ผู้ใช้");
    expect(thaiTrace?.metadata).toEqual({
      description: "การทดสอบภาษาไทย",
      mixed: "Hello สวัสดี 世界 مرحبا 🌍",
    });
    expect(thaiTrace?.tags).toEqual(["ไทย", "テスト", "测试"]);

    // Verify Chinese characters are preserved
    const chineseTrace = rows.find((r) => r.name === "中文测试");
    expect(chineseTrace).toBeDefined();
    expect(chineseTrace?.userId).toBe("用户");
    expect(chineseTrace?.metadata).toEqual({
      description: "这是中文测试",
    });
    expect(chineseTrace?.tags).toEqual(["中文", "汉字"]);

    // Verify Arabic characters are preserved
    const arabicTrace = rows.find((r) => r.name === "العربية");
    expect(arabicTrace).toBeDefined();
    expect(arabicTrace?.userId).toBe("مستخدم");
    expect(arabicTrace?.metadata).toEqual({
      description: "اختبار اللغة العربية",
    });
    expect(arabicTrace?.tags).toEqual(["عربي"]);
  });

  it("should export sessions filtered by comment count", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create sessions
    const sessionWithComments = randomUUID();
    const sessionWithoutComments = randomUUID();
    await prisma.traceSession.createMany({
      data: [
        { id: sessionWithComments, projectId },
        { id: sessionWithoutComments, projectId },
      ],
    });

    // Create traces for sessions
    const traces = [
      createTrace({
        project_id: projectId,
        session_id: sessionWithComments,
        id: randomUUID(),
      }),
      createTrace({
        project_id: projectId,
        session_id: sessionWithoutComments,
        id: randomUUID(),
      }),
    ];
    await createTracesCh(traces);

    // Add comment to first session only
    await prisma.comment.create({
      data: {
        projectId,
        objectId: sessionWithComments,
        objectType: "SESSION",
        content: "Test comment for filtering",
      },
    });

    // Apply comment filter preprocessing (mimics what handleBatchExportJob does)
    const { filterState: processedFilter, hasNoMatches } =
      await applyCommentFilters({
        filterState: [
          {
            type: "number",
            operator: ">=",
            column: "commentCount",
            value: 1,
          },
        ],
        prisma,
        projectId,
        objectType: "SESSION",
      });

    expect(hasNoMatches).toBe(false);

    // Export with processed filter
    const stream = await getDatabaseReadStreamPaginated({
      projectId,
      tableName: BatchExportTableName.Sessions,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: processedFilter,
      orderBy: { column: "createdAt", order: "DESC" },
    });

    const rows: any[] = [];
    for await (const chunk of stream) {
      rows.push(chunk);
    }

    // Should only return the session with comments
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(sessionWithComments);
  });

  it("should return empty results when comment filter matches nothing", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create sessions without any comments
    const sessionId = randomUUID();
    await prisma.traceSession.create({
      data: { id: sessionId, projectId },
    });

    const trace = createTrace({
      project_id: projectId,
      session_id: sessionId,
      id: randomUUID(),
    });
    await createTracesCh([trace]);

    // Apply comment filter preprocessing - should match nothing
    const { filterState: processedFilter, hasNoMatches } =
      await applyCommentFilters({
        filterState: [
          {
            type: "number",
            operator: ">=",
            column: "commentCount",
            value: 1,
          },
        ],
        prisma,
        projectId,
        objectType: "SESSION",
      });

    // Should indicate no matches
    expect(hasNoMatches).toBe(true);
  });

  it("should export traces filtered by comment count", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create traces
    const traceWithComments = randomUUID();
    const traceWithoutComments = randomUUID();

    const traces = [
      createTrace({
        project_id: projectId,
        id: traceWithComments,
        name: "trace-with-comments",
      }),
      createTrace({
        project_id: projectId,
        id: traceWithoutComments,
        name: "trace-without-comments",
      }),
    ];
    await createTracesCh(traces);

    // Add comment to first trace only
    await prisma.comment.create({
      data: {
        projectId,
        objectId: traceWithComments,
        objectType: "TRACE",
        content: "Test comment for trace filtering",
      },
    });

    // Apply comment filter preprocessing
    const { filterState: processedFilter, hasNoMatches } =
      await applyCommentFilters({
        filterState: [
          {
            type: "number",
            operator: ">=",
            column: "commentCount",
            value: 1,
          },
        ],
        prisma,
        projectId,
        objectType: "TRACE",
      });

    expect(hasNoMatches).toBe(false);

    // Export with processed filter
    const stream = await getTraceStream({
      projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: processedFilter,
    });

    const rows: any[] = [];
    for await (const chunk of stream) {
      rows.push(chunk);
    }

    // Should only return the trace with comments
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(traceWithComments);
    expect(rows[0].name).toBe("trace-with-comments");
  });

  // ==================== EVENTS TABLE EXPORT TESTS ====================

  maybeDescribe("events table export tests", () => {
    it("should export events from events table", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      const now = Date.now() * 1000; // Events use microseconds

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: traceId,
          type: "SPAN",
          name: "span-event",
          start_time: now,
          end_time: now + 1000000, // 1 second later in microseconds
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "generation-event",
          provided_model_name: "gpt-4",
          start_time: now,
          end_time: now + 2000000, // 2 seconds later
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "EVENT",
          name: "simple-event",
          start_time: now,
        }),
      ];

      await createEventsCh(events);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(3);
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: events[0].span_id,
            name: "span-event",
            type: "SPAN",
          }),
          expect.objectContaining({
            id: events[1].span_id,
            name: "generation-event",
            type: "GENERATION",
            providedModelName: "gpt-4",
          }),
          expect.objectContaining({
            id: events[2].span_id,
            name: "simple-event",
            type: "EVENT",
          }),
        ]),
      );
    });

    it("should export events with filters", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "generation-1",
          start_time: now,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "generation-2",
          start_time: now + 1000000,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "SPAN",
          name: "span-1",
          start_time: now + 2000000,
        }),
      ];

      await createEventsCh(events);

      // Filter by type
      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [
          {
            type: "stringOptions",
            operator: "any of",
            column: "type",
            value: ["GENERATION"],
          },
        ],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.type === "GENERATION")).toBe(true);

      const exportedNames = rows.map((row) => row.name);
      expect(exportedNames).toEqual(
        expect.arrayContaining(["generation-1", "generation-2"]),
      );
    });

    it("should export events with name filter", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "api-call",
          start_time: now,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "database-query",
          start_time: now + 1000000,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "api-call",
          start_time: now + 2000000,
        }),
      ];

      await createEventsCh(events);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [
          {
            type: "stringOptions",
            operator: "any of",
            column: "name",
            value: ["api-call"],
          },
        ],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.name === "api-call")).toBe(true);
    });

    it("should export events with scores", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      const now = Date.now() * 1000;

      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "scored-event",
        start_time: now,
      });

      await createEventsCh([event]);

      // Create scores linked to this event
      const score = createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: event.span_id,
        name: "quality",
        value: 0.95,
        data_type: "NUMERIC",
      });

      await createScoresCh([score]);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("scored-event");
      // Verify score is included
      expect(rows[0].quality).toEqual([0.95]);
    });

    it("should export events with categorical scores", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      const now = Date.now() * 1000;

      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "categorically-scored-event",
        start_time: now,
      });

      await createEventsCh([event]);

      // Create categorical score
      const score = createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: event.span_id,
        name: "sentiment",
        value: undefined,
        string_value: "positive",
        data_type: "CATEGORICAL",
      });

      await createScoresCh([score]);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("categorically-scored-event");
      // Verify categorical score is included
      expect(rows[0].sentiment).toEqual(["positive"]);
    });

    it("should handle empty events export", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(0);
    });

    it("should export events with environment filter", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "prod-event",
          environment: "production",
          start_time: now,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "staging-event",
          environment: "staging",
          start_time: now + 1000000,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "another-prod-event",
          environment: "production",
          start_time: now + 2000000,
        }),
      ];

      await createEventsCh(events);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [
          {
            type: "stringOptions",
            operator: "any of",
            column: "environment",
            value: ["production"],
          },
        ],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.environment === "production")).toBe(true);

      const exportedNames = rows.map((row) => row.name);
      expect(exportedNames).toEqual(
        expect.arrayContaining(["prod-event", "another-prod-event"]),
      );
    });

    it("should export events with date range filter", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      // Create events with different timestamps
      const jan1 = new Date("2024-01-01T10:00:00Z").getTime() * 1000;
      const jan15 = new Date("2024-01-15T10:00:00Z").getTime() * 1000;
      const jan30 = new Date("2024-01-30T10:00:00Z").getTime() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "early-january-event",
          start_time: jan1,
          created_at: jan1,
          updated_at: jan1,
          event_ts: jan1,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "mid-january-event",
          start_time: jan15,
          created_at: jan15,
          updated_at: jan15,
          event_ts: jan15,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "late-january-event",
          start_time: jan30,
          created_at: jan30,
          updated_at: jan30,
          event_ts: jan30,
        }),
      ];

      await createEventsCh(events);

      // Filter for mid-January only
      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date("2024-02-01T00:00:00Z"),
        filter: [
          {
            type: "datetime",
            operator: ">=",
            column: "startTime",
            value: new Date("2024-01-10T00:00:00Z"),
          },
          {
            type: "datetime",
            operator: "<",
            column: "startTime",
            value: new Date("2024-01-20T00:00:00Z"),
          },
        ],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("mid-january-event");
    });

    it("should export events with usage details and cost details", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      const event = createEvent({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "event-with-usage",
        usage_details: { input: 100, output: 200, total: 300 },
        cost_details: { input: 0.01, output: 0.02, total: 0.03 },
        start_time: now,
      });

      await createEventsCh([event]);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("event-with-usage");
      expect(rows[0].usageDetails).toEqual({
        input: 100,
        output: 200,
        total: 300,
      });
      expect(rows[0].costDetails).toEqual({
        input: 0.01,
        output: 0.02,
        total: 0.03,
      });
    });

    it("should export events with searchQuery filter", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "searchable-generation",
          start_time: now,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "other-generation",
          start_time: now + 1000000,
        }),
      ];

      await createEventsCh(events);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
        searchQuery: "searchable",
        searchType: ["id"],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("searchable-generation");
    });

    it("should export events with trace metadata (denormalized fields)", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      const userId = randomUUID();
      const sessionId = randomUUID();
      const now = Date.now() * 1000;

      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        trace_name: "parent-trace",
        user_id: userId,
        session_id: sessionId,
        type: "GENERATION",
        name: "event-with-trace-data",
        tags: ["tag1", "tag2"],
        release: "v1.2.3",
        start_time: now,
      });

      await createEventsCh([event]);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        name: "event-with-trace-data",
        traceId: traceId,
        traceName: "parent-trace",
        userId: userId,
        sessionId: sessionId,
        tags: ["tag1", "tag2"],
        release: "v1.2.3",
      });
    });

    it("should export events respecting row limit", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      // Create 10 events
      const events = Array.from({ length: 10 }, (_, i) =>
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: `event-${i}`,
          start_time: now + i * 1000000,
        }),
      );

      await createEventsCh(events);

      // Limit to 5 rows
      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
        rowLimit: 5,
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(5);
    });

    it("should export events with multiple score types", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      const now = Date.now() * 1000;

      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "multi-scored-event",
        start_time: now,
      });

      await createEventsCh([event]);

      // Create multiple scores of different types
      const scores = [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: event.span_id,
          name: "accuracy",
          value: 0.95,
          data_type: "NUMERIC",
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: event.span_id,
          name: "category",
          value: undefined,
          string_value: "excellent",
          data_type: "CATEGORICAL",
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: event.span_id,
          name: "is_correct",
          value: 1,
          data_type: "BOOLEAN",
        }),
      ];

      await createScoresCh(scores);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("multi-scored-event");
      expect(rows[0].accuracy).toEqual([0.95]);
      expect(rows[0].category).toEqual(["excellent"]);
      expect(rows[0].is_correct).toEqual([1]);
    });

    it("should export events with filter and sorting", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      // Create events with different timestamps and types
      const jan1 = new Date("2024-01-01T10:00:00Z").getTime() * 1000;
      const jan2 = new Date("2024-01-02T10:00:00Z").getTime() * 1000;
      const jan3 = new Date("2024-01-03T10:00:00Z").getTime() * 1000;
      const jan4 = new Date("2024-01-04T10:00:00Z").getTime() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "gen-event-1",
          environment: "production",
          start_time: jan1,
          created_at: jan1,
          updated_at: jan1,
          event_ts: jan1,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "SPAN",
          name: "span-event-1",
          environment: "production",
          start_time: jan2,
          created_at: jan2,
          updated_at: jan2,
          event_ts: jan2,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "gen-event-2",
          environment: "staging",
          start_time: jan3,
          created_at: jan3,
          updated_at: jan3,
          event_ts: jan3,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "gen-event-3",
          environment: "production",
          start_time: jan4,
          created_at: jan4,
          updated_at: jan4,
          event_ts: jan4,
        }),
      ];

      await createEventsCh(events);

      // Filter by type=GENERATION AND environment=production
      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date("2024-01-05T00:00:00Z"),
        filter: [
          {
            type: "stringOptions",
            operator: "any of",
            column: "type",
            value: ["GENERATION"],
          },
          {
            type: "stringOptions",
            operator: "any of",
            column: "environment",
            value: ["production"],
          },
        ],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      // Should only return GENERATION events in production environment
      expect(rows).toHaveLength(2);

      // Verify all results match filters
      expect(rows.every((r) => r.type === "GENERATION")).toBe(true);
      expect(rows.every((r) => r.environment === "production")).toBe(true);

      // Results should be sorted by start_time DESC (default)
      const exportedNames = rows.map((row) => row.name);
      expect(exportedNames).toEqual(["gen-event-3", "gen-event-1"]);
    });

    // ==================== EVENTS TABLE EXPORT TESTS ====================

    it("should export events from events table", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      const now = Date.now() * 1000; // Events use microseconds

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: traceId,
          type: "SPAN",
          name: "span-event",
          start_time: now,
          end_time: now + 1000000, // 1 second later in microseconds
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "generation-event",
          provided_model_name: "gpt-4",
          start_time: now,
          end_time: now + 2000000, // 2 seconds later
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "EVENT",
          name: "simple-event",
          start_time: now,
        }),
      ];

      await createEventsCh(events);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(3);
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: events[0].span_id,
            name: "span-event",
            type: "SPAN",
          }),
          expect.objectContaining({
            id: events[1].span_id,
            name: "generation-event",
            type: "GENERATION",
            providedModelName: "gpt-4",
          }),
          expect.objectContaining({
            id: events[2].span_id,
            name: "simple-event",
            type: "EVENT",
          }),
        ]),
      );
    });

    it("should export events with filters", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "generation-1",
          start_time: now,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "generation-2",
          start_time: now + 1000000,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "SPAN",
          name: "span-1",
          start_time: now + 2000000,
        }),
      ];

      await createEventsCh(events);

      // Filter by type
      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [
          {
            type: "stringOptions",
            operator: "any of",
            column: "type",
            value: ["GENERATION"],
          },
        ],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.type === "GENERATION")).toBe(true);

      const exportedNames = rows.map((row) => row.name);
      expect(exportedNames).toEqual(
        expect.arrayContaining(["generation-1", "generation-2"]),
      );
    });

    it("should export events with name filter", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "api-call",
          start_time: now,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "database-query",
          start_time: now + 1000000,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "api-call",
          start_time: now + 2000000,
        }),
      ];

      await createEventsCh(events);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [
          {
            type: "stringOptions",
            operator: "any of",
            column: "name",
            value: ["api-call"],
          },
        ],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.name === "api-call")).toBe(true);
    });

    it("should export events with scores", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      const now = Date.now() * 1000;

      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "scored-event",
        start_time: now,
      });

      await createEventsCh([event]);

      // Create scores linked to this event
      const score = createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: event.span_id,
        name: "quality",
        value: 0.95,
        data_type: "NUMERIC",
      });

      await createScoresCh([score]);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("scored-event");
      // Verify score is included
      expect(rows[0].quality).toEqual([0.95]);
    });

    it("should export events with categorical scores", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      const now = Date.now() * 1000;

      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "categorically-scored-event",
        start_time: now,
      });

      await createEventsCh([event]);

      // Create categorical score
      const score = createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: event.span_id,
        name: "sentiment",
        value: undefined,
        string_value: "positive",
        data_type: "CATEGORICAL",
      });

      await createScoresCh([score]);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("categorically-scored-event");
      // Verify categorical score is included
      expect(rows[0].sentiment).toEqual(["positive"]);
    });

    it("should handle empty events export", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(0);
    });

    it("should export events with environment filter", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "prod-event",
          environment: "production",
          start_time: now,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "staging-event",
          environment: "staging",
          start_time: now + 1000000,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "another-prod-event",
          environment: "production",
          start_time: now + 2000000,
        }),
      ];

      await createEventsCh(events);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [
          {
            type: "stringOptions",
            operator: "any of",
            column: "environment",
            value: ["production"],
          },
        ],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.environment === "production")).toBe(true);

      const exportedNames = rows.map((row) => row.name);
      expect(exportedNames).toEqual(
        expect.arrayContaining(["prod-event", "another-prod-event"]),
      );
    });

    it("should export events with date range filter", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      // Create events with different timestamps
      const jan1 = new Date("2024-01-01T10:00:00Z").getTime() * 1000;
      const jan15 = new Date("2024-01-15T10:00:00Z").getTime() * 1000;
      const jan30 = new Date("2024-01-30T10:00:00Z").getTime() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "early-january-event",
          start_time: jan1,
          created_at: jan1,
          updated_at: jan1,
          event_ts: jan1,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "mid-january-event",
          start_time: jan15,
          created_at: jan15,
          updated_at: jan15,
          event_ts: jan15,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "late-january-event",
          start_time: jan30,
          created_at: jan30,
          updated_at: jan30,
          event_ts: jan30,
        }),
      ];

      await createEventsCh(events);

      // Filter for mid-January only
      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date("2024-02-01T00:00:00Z"),
        filter: [
          {
            type: "datetime",
            operator: ">=",
            column: "startTime",
            value: new Date("2024-01-10T00:00:00Z"),
          },
          {
            type: "datetime",
            operator: "<",
            column: "startTime",
            value: new Date("2024-01-20T00:00:00Z"),
          },
        ],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("mid-january-event");
    });

    it("should export events with usage details and cost details", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      const event = createEvent({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "event-with-usage",
        usage_details: { input: 100, output: 200, total: 300 },
        cost_details: { input: 0.01, output: 0.02, total: 0.03 },
        start_time: now,
      });

      await createEventsCh([event]);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("event-with-usage");
      expect(rows[0].usageDetails).toEqual({
        input: 100,
        output: 200,
        total: 300,
      });
      expect(rows[0].costDetails).toEqual({
        input: 0.01,
        output: 0.02,
        total: 0.03,
      });
    });

    it("should export events with searchQuery filter", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "searchable-generation",
          start_time: now,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "other-generation",
          start_time: now + 1000000,
        }),
      ];

      await createEventsCh(events);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
        searchQuery: "searchable",
        searchType: ["id"],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("searchable-generation");
    });

    it("should export events with trace metadata (denormalized fields)", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      const userId = randomUUID();
      const sessionId = randomUUID();
      const now = Date.now() * 1000;

      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        trace_name: "parent-trace",
        user_id: userId,
        session_id: sessionId,
        type: "GENERATION",
        name: "event-with-trace-data",
        tags: ["tag1", "tag2"],
        release: "v1.2.3",
        start_time: now,
      });

      await createEventsCh([event]);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        name: "event-with-trace-data",
        traceId: traceId,
        traceName: "parent-trace",
        userId: userId,
        sessionId: sessionId,
        tags: ["tag1", "tag2"],
        release: "v1.2.3",
      });
    });

    it("should export events respecting row limit", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const now = Date.now() * 1000;

      // Create 10 events
      const events = Array.from({ length: 10 }, (_, i) =>
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: `event-${i}`,
          start_time: now + i * 1000000,
        }),
      );

      await createEventsCh(events);

      // Limit to 5 rows
      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
        rowLimit: 5,
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(5);
    });

    it("should export events with multiple score types", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      const traceId = randomUUID();
      const now = Date.now() * 1000;

      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "multi-scored-event",
        start_time: now,
      });

      await createEventsCh([event]);

      // Create multiple scores of different types
      const scores = [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: event.span_id,
          name: "accuracy",
          value: 0.95,
          data_type: "NUMERIC",
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: event.span_id,
          name: "category",
          value: undefined,
          string_value: "excellent",
          data_type: "CATEGORICAL",
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: event.span_id,
          name: "is_correct",
          value: 1,
          data_type: "BOOLEAN",
        }),
      ];

      await createScoresCh(scores);

      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        filter: [],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("multi-scored-event");
      expect(rows[0].accuracy).toEqual([0.95]);
      expect(rows[0].category).toEqual(["excellent"]);
      expect(rows[0].is_correct).toEqual([1]);
    });

    it("should export events with filter and sorting", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      // Create events with different timestamps and types
      const jan1 = new Date("2024-01-01T10:00:00Z").getTime() * 1000;
      const jan2 = new Date("2024-01-02T10:00:00Z").getTime() * 1000;
      const jan3 = new Date("2024-01-03T10:00:00Z").getTime() * 1000;
      const jan4 = new Date("2024-01-04T10:00:00Z").getTime() * 1000;

      const events = [
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "gen-event-1",
          environment: "production",
          start_time: jan1,
          created_at: jan1,
          updated_at: jan1,
          event_ts: jan1,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "SPAN",
          name: "span-event-1",
          environment: "production",
          start_time: jan2,
          created_at: jan2,
          updated_at: jan2,
          event_ts: jan2,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "gen-event-2",
          environment: "staging",
          start_time: jan3,
          created_at: jan3,
          updated_at: jan3,
          event_ts: jan3,
        }),
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          type: "GENERATION",
          name: "gen-event-3",
          environment: "production",
          start_time: jan4,
          created_at: jan4,
          updated_at: jan4,
          event_ts: jan4,
        }),
      ];

      await createEventsCh(events);

      // Filter by type=GENERATION AND environment=production
      const stream = await getEventsStream({
        projectId: projectId,
        cutoffCreatedAt: new Date("2024-01-05T00:00:00Z"),
        filter: [
          {
            type: "stringOptions",
            operator: "any of",
            column: "type",
            value: ["GENERATION"],
          },
          {
            type: "stringOptions",
            operator: "any of",
            column: "environment",
            value: ["production"],
          },
        ],
      });

      const rows: any[] = [];

      for await (const chunk of stream) {
        rows.push(chunk);
      }

      // Should only return GENERATION events in production environment
      expect(rows).toHaveLength(2);

      // Verify all results match filters
      expect(rows.every((r) => r.type === "GENERATION")).toBe(true);
      expect(rows.every((r) => r.environment === "production")).toBe(true);

      // Results should be sorted by start_time DESC (default)
      const exportedNames = rows.map((row) => row.name);
      expect(exportedNames).toEqual(["gen-event-3", "gen-event-1"]);
    });
  });
});

maybeDescribe("getEventsForBlobStorageExport", () => {
  it("should stream events for blob storage export", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const now = Date.now();
    const traceId = randomUUID();

    const event = createEvent({
      project_id: projectId,
      trace_id: traceId,
      type: "GENERATION",
      name: "test-blob-event",
      start_time: now * 1000, // microseconds
    });

    await createEventsCh([event]);

    const stream = getEventsForBlobStorageExport(
      projectId,
      new Date(now - 60 * 60 * 1000), // 1 hour ago
      new Date(now + 60 * 60 * 1000), // 1 hour from now
    );

    const rows: Record<string, unknown>[] = [];
    for await (const row of stream) {
      rows.push(row);
    }

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(event.span_id);
    expect(rows[0].name).toBe("test-blob-event");
    expect(rows[0].type).toBe("GENERATION");
  });

  it("should filter events by time range", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const now = Date.now();
    const traceId = randomUUID();

    // Create events at different times
    const oldEvent = createEvent({
      project_id: projectId,
      trace_id: traceId,
      type: "SPAN",
      name: "old-event",
      start_time: (now - 3 * 60 * 60 * 1000) * 1000, // 3 hours ago (microseconds)
    });

    const recentEvent = createEvent({
      project_id: projectId,
      trace_id: traceId,
      type: "GENERATION",
      name: "recent-event",
      start_time: now * 1000, // now (microseconds)
    });

    await createEventsCh([oldEvent, recentEvent]);

    // Query for events in the last 2 hours only
    const stream = getEventsForBlobStorageExport(
      projectId,
      new Date(now - 2 * 60 * 60 * 1000), // 2 hours ago
      new Date(now + 60 * 60 * 1000), // 1 hour from now
    );

    const rows: Record<string, unknown>[] = [];
    for await (const row of stream) {
      rows.push(row);
    }

    // Should only include the recent event (old event is outside time range)
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(recentEvent.span_id);
    expect(rows[0].name).toBe("recent-event");
  });

  it("should return empty stream when no events match time range", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const now = Date.now();
    const traceId = randomUUID();

    // Create event in the past
    const pastEvent = createEvent({
      project_id: projectId,
      trace_id: traceId,
      type: "SPAN",
      name: "past-event",
      start_time: (now - 5 * 60 * 60 * 1000) * 1000, // 5 hours ago (microseconds)
    });

    await createEventsCh([pastEvent]);

    // Query for events in the last hour only (event is older)
    const stream = getEventsForBlobStorageExport(
      projectId,
      new Date(now - 60 * 60 * 1000), // 1 hour ago
      new Date(now + 60 * 60 * 1000), // 1 hour from now
    );

    const rows: Record<string, unknown>[] = [];
    for await (const row of stream) {
      rows.push(row);
    }

    expect(rows).toHaveLength(0);
  });
});
