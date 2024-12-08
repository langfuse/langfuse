import { randomUUID } from "crypto";
import { expect, test, describe, vi, beforeEach, it } from "vitest";
import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createScore,
  createScoresCh,
} from "@langfuse/shared/src/server";
import { getDatabaseReadStream } from "../features/batchExport/handleBatchExportJob";
import { BatchExportTableName } from "@langfuse/shared";

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
});
