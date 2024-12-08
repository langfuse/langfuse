import { randomUUID } from "crypto";
import { expect, test, describe, vi, beforeEach, it } from "vitest";
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
import { array } from "zod";

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
});
