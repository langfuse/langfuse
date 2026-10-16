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

// The handler rethrows read-stream failures as the cause of its own error.
const rejectWithReadError = (message: string) => {
  const resourceError = ClickHouseResourceError.wrapIfResourceError(
    new Error(`${message} [query_id: q-1]`),
  );
  const handlerError = new Error("[BATCH EXPORT] Reading export data failed", {
    cause: resourceError,
  });
  mocks.handleBatchExportJob.mockRejectedValue(handlerError);
  return handlerError;
};

describe("batchExportQueueProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "Timeout exceeded: elapsed 185002.1 ms, maximum: 185000 ms.",
    "(for query) memory limit exceeded: would use 10.00 GiB, maximum: 9.31 GiB.",
    "Memory limit (for query) exceeded: would use 10.00 GiB, maximum: 9.31 GiB.",
  ])("fails without retry on a query-bound limit: %s", async (message) => {
    rejectWithReadError(message);

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

  it.each([
    "Timeout error.",
    "Timeout exceeded while reading from socket (10.0.0.1:8443, 30000 ms)",
    "(total) memory limit exceeded: would use 212.42 GiB, maximum: 212.40 GiB. OvercommitTracker decision: Query was selected to stop by OvercommitTracker.",
  ])("keeps retrying a load-dependent failure: %s", async (message) => {
    const handlerError = rejectWithReadError(message);

    const thrown = await batchExportQueueProcessor(job).catch((e) => e);

    expect(thrown).toBe(handlerError);
    expect(mocks.updateBatchExport).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ log: "An internal error occurred" }),
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
