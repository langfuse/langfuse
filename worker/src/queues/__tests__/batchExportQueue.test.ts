import { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BatchExportStatus } from "@langfuse/shared";
import {
  ClickHouseResourceError,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";

const mocks = vi.hoisted(() => ({
  handleBatchExportJob: vi.fn(),
  updateBatchExport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { batchExport: { update: mocks.updateBatchExport } },
}));

vi.mock("../../features/batchExport/handleBatchExportJob", () => ({
  handleBatchExportJob: mocks.handleBatchExportJob,
}));

import { batchExportQueueProcessor } from "../batchExportQueue";

const job = {
  data: { payload: { projectId: "project-1", batchExportId: "export-1" } },
} as Job<TQueueJobTypes[QueueName.BatchExport]>;

describe("batchExportQueueProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails without retry when a ClickHouse resource error caused the failure", async () => {
    const resourceError = new ClickHouseResourceError(
      "TIMEOUT",
      new Error("Timeout exceeded: elapsed 180 seconds"),
    );
    // The handler rethrows read-stream failures as the cause of its own error.
    mocks.handleBatchExportJob.mockRejectedValue(
      new Error("[BATCH EXPORT] Reading export data failed", {
        cause: resourceError,
      }),
    );

    const thrown = await batchExportQueueProcessor(job).catch((e) => e);

    expect(thrown.name).toBe("UnrecoverableError");
    expect(mocks.updateBatchExport).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BatchExportStatus.FAILED,
          log: ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
        }),
      }),
    );
  });

  it("rethrows other errors so BullMQ retries them", async () => {
    const uploadError = new Error("Failed to upload file to S3 (buffered)");
    mocks.handleBatchExportJob.mockRejectedValue(uploadError);

    const thrown = await batchExportQueueProcessor(job).catch((e) => e);

    expect(thrown).toBe(uploadError);
  });
});
