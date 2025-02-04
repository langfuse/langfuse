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
        id: randomUUID(),
        timestamp: new Date("2024-01-01").getTime(),
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
          cutoffCreatedAt: new Date("2024-01-02"),
        },
      },
      progress: 0,
      updateProgress: vi.fn(),
    } as any;

    await handleSelectAllJob(selectAllJob);

    // Should have processed in chunks of 1000
    expect(selectAllJob.updateProgress).toHaveBeenCalledTimes(3);

    // Verify traces were deleted
    const stream = await getDatabaseReadStream({
      projectId,
      tableName: BatchExportTableName.Traces,
      cutoffCreatedAt: new Date("2024-01-02"),
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
        timestamp: new Date("2024-01-01").getTime(),
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
          cutoffCreatedAt: new Date("2024-01-02"),
        },
      },
      progress: 1, // Simulate already processed first chunk
      updateProgress: vi.fn(),
    } as any;

    await handleSelectAllJob(selectAllJob);

    // Should only process remaining chunks
    expect(selectAllJob.updateProgress).toHaveBeenCalledTimes(2);
  });

  it("should handle filtered queries", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traces = [
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        user_id: "user1",
        timestamp: new Date("2024-01-01").getTime(),
      }),
      createTrace({
        project_id: projectId,
        id: randomUUID(),
        user_id: "user2",
        timestamp: new Date("2024-01-01").getTime(),
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
                operator: "=",
                column: "User ID",
                value: "user1",
              },
            ],
            orderBy: { column: "timestamp", order: "DESC" },
          }),
          cutoffCreatedAt: new Date("2024-01-02"),
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
      cutoffCreatedAt: new Date("2024-01-02"),
      filter: [],
      orderBy: { column: "timestamp", order: "DESC" },
    });

    const remainingRows: any[] = [];
    for await (const chunk of stream) {
      remainingRows.push(chunk);
    }
    expect(remainingRows).toHaveLength(1);
    expect(remainingRows[0].userId).toBe("user2");
  });
});
