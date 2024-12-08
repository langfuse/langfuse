import { randomUUID } from "crypto";
import { expect, test, describe, vi, beforeEach, it } from "vitest";
import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTracesCh,
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

    await createObservationsCh(generations);

    const stream = await getDatabaseReadStream({
      projectId: projectId,
      tableName: BatchExportTableName.Generations,
      cutoffCreatedAt: new Date(),
      filter: [],
      orderBy: { column: "timestamp", order: "DESC" },
    });

    const rows: any[] = [];

    for await (const chunk of stream) {
      rows.push(...chunk);
    }

    expect(rows.length).toBeGreaterThanOrEqual(1);
    console.log(rows);
  });
});
