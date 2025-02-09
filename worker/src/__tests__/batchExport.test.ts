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

    const generations = [
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
      }),
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
      }),
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
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
      tableName: BatchExportTableName.Generations,
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
          id: generations[0].id,
          name: generations[0].name,
          test: [score.value],
        }),
        expect.objectContaining({
          id: generations[1].id,
          name: generations[1].name,
        }),
        expect.objectContaining({
          id: generations[2].id,
          name: generations[2].name,
        }),
      ]),
    );
  });

  it("should export observations with filter and sorting", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const generations = [
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
        type: "GENERATION",
        name: "test2",
        start_time: new Date("2024-01-02").getTime(),
      }),
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test3",
        start_time: new Date("2024-01-03").getTime(),
      }),
    ];

    await createObservationsCh(generations);

    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Generations,
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
});
