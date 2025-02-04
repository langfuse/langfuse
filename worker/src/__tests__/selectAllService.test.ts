import { BatchExportTableName } from "@langfuse/shared";
import { expect, describe, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { handleSelectAllJob } from "../features/selectAll/handleSelectAllJob";
import { getDatabaseReadStream } from "../features/batchExport/handleBatchExportJob";
import {
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
} from "@langfuse/shared/src/server";

describe("select all test suite", () => {
  it("should process items in chunks", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Create test traces
    const traces = Array.from({ length: 2500 }).map(() =>
      createTrace({
        project_id: projectId,
        id: "12345",
      }),
    );

    await createTracesCh(traces);

    const selectAllJob = {
      data: {
        payload: {
          projectId,
          actionId: "trace-delete",
          tableName: BatchExportTableName.Traces,
          query: JSON.stringify({
            filter: [],
            orderBy: { column: "timestamp", order: "DESC" },
          }),
          cutoffCreatedAt: new Date().toISOString(),
        },
      },
      progress: 0,
      updateProgress: vi.fn(),
    } as any;

    await handleSelectAllJob(selectAllJob);

    // Should have processed in chunks of 1000
    expect(selectAllJob.updateProgress).toHaveBeenCalledTimes(2);

    // Verify traces were deleted
    const stream = await getDatabaseReadStream({
      projectId,
      tableName: BatchExportTableName.Traces,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
      orderBy: { column: "timestamp", order: "DESC" },
    });

    const remainingRows: any[] = [];
    for await (const chunk of stream) {
      remainingRows.push(chunk);
    }
    expect(remainingRows).toHaveLength(0);
  });

  it("should skip already processed chunks on retry", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traces = Array.from({ length: 2500 }).map(() =>
      createTrace({
        project_id: projectId,
        id: randomUUID(),
      }),
    );

    await createTracesCh(traces);

    const selectAllJob = {
      data: {
        payload: {
          projectId,
          actionId: "trace-delete",
          tableName: BatchExportTableName.Traces,
          query: JSON.stringify({
            filter: [],
            orderBy: { column: "timestamp", order: "DESC" },
          }),
          cutoffCreatedAt: new Date().toISOString(),
        },
      },
      progress: 1000, // Simulate already processed first chunk
      updateProgress: vi.fn(),
    } as any;

    await handleSelectAllJob(selectAllJob);

    // Should only process remaining chunks
    expect(selectAllJob.updateProgress).toHaveBeenCalledTimes(1);
  });

  it("should handle filtered queries", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        user_id: "user1",
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        user_id: "user2",
      }),
    ];

    await createTracesCh(traces);

    const selectAllJob = {
      data: {
        payload: {
          projectId,
          actionId: "trace-delete",
          tableName: BatchExportTableName.Traces,
          query: JSON.stringify({
            filter: [
              {
                type: "string",
                value: "user1",
                column: "User ID",
                operator: "equals",
              },
            ],
            orderBy: { column: "timestamp", order: "DESC" },
          }),
          cutoffCreatedAt: new Date().toISOString(),
        },
      },
      progress: 0,
      updateProgress: vi.fn(),
    } as any;

    await handleSelectAllJob(selectAllJob);

    // Verify only filtered traces were processed
    const stream = await getDatabaseReadStream({
      projectId,
      tableName: BatchExportTableName.Traces,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
      orderBy: { column: "timestamp", order: "DESC" },
    });

    const remainingRows: any[] = [];
    for await (const chunk of stream) {
      remainingRows.push(chunk);
    }
    expect(remainingRows).toHaveLength(1);
    expect(remainingRows[0].user_id).toBe("user2");
  });
});
