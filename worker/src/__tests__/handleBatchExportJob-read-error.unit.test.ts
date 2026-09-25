import { PassThrough, Readable } from "stream";
import { expect, it, vi } from "vitest";
import {
  BatchExportFileFormat,
  BatchExportStatus,
  BatchExportTableName,
} from "@langfuse/shared";

const mocks = vi.hoisted(() => ({
  findBatchExport: vi.fn(),
  updateBatchExport: vi.fn().mockResolvedValue(undefined),
  applyCommentFilters: vi
    .fn()
    .mockResolvedValue({ filterState: [], hasNoMatches: false }),
  getEventsStream: vi.fn(),
  uploadFileBuffered: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    batchExport: {
      findFirst: mocks.findBatchExport,
      update: mocks.updateBatchExport,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  applyCommentFilters: mocks.applyCommentFilters,
  getCurrentSpan: vi.fn(() => undefined),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sendBatchExportSuccessEmail: vi.fn(),
  StorageServiceFactory: {
    getInstance: () => ({
      uploadFileBuffered: mocks.uploadFileBuffered,
      getSignedUrl: mocks.getSignedUrl,
    }),
  },
  // Object-mode passthrough so the piped stream error propagates to the uploader.
  streamTransformations: {
    [BatchExportFileFormat.JSONL]: () => new PassThrough({ objectMode: true }),
  },
}));

vi.mock("../env", () => ({
  env: {
    LANGFUSE_S3_BATCH_EXPORT_ENABLED: "true",
    LANGFUSE_S3_BATCH_EXPORT_BUCKET: "export-bucket",
    LANGFUSE_S3_BATCH_EXPORT_PREFIX: "",
    BATCH_EXPORT_DOWNLOAD_LINK_EXPIRATION_HOURS: 24,
    BATCH_EXPORT_S3_PART_SIZE_MIB: 20,
  },
}));

vi.mock("../features/database-read-stream/event-stream", () => ({
  getEventsStream: mocks.getEventsStream,
}));

import { handleBatchExportJob } from "../features/batchExport/handleBatchExportJob";

const seedQueuedExport = () =>
  mocks.findBatchExport.mockResolvedValue({
    createdAt: new Date(),
    status: BatchExportStatus.QUEUED,
    format: BatchExportFileFormat.JSONL,
    query: {
      tableName: BatchExportTableName.Events,
      filter: null,
      orderBy: null,
    },
  });

const runAndCatch = () =>
  handleBatchExportJob({
    projectId: "project-1",
    batchExportId: "export-1",
  }).then(
    () => {
      throw new Error("expected handleBatchExportJob to reject");
    },
    (err) => err,
  );

it("surfaces the read error, not the storage error, when the read stream fails", async () => {
  const readError = new Error(
    "Read timeout: query exceeded max_execution_time",
  );

  const readStream = new Readable({ objectMode: true, read() {} });
  setImmediate(() => readStream.destroy(readError));
  mocks.getEventsStream.mockResolvedValue(readStream);

  // Uploader rewraps a mid-stream failure as a storage error whose cause is the
  // piped read error, mirroring StorageService.handleStorageError.
  mocks.uploadFileBuffered.mockImplementation(
    ({ data }: { data: Readable }) =>
      new Promise((_resolve, reject) => {
        data.on("data", () => {});
        data.on("end", () => reject(new Error("stream ended without error")));
        data.on("error", (err) =>
          reject(
            new Error("Failed to upload file to S3 (buffered)", { cause: err }),
          ),
        );
      }),
  );

  seedQueuedExport();

  const thrown = await runAndCatch();

  expect(thrown).toBeInstanceOf(Error);
  expect(thrown.message).toContain(readError.message);
  expect(thrown.message).not.toContain("S3");
  expect(thrown.cause).toBe(readError);
  expect(mocks.getSignedUrl).not.toHaveBeenCalled();
});

it("keeps reporting a genuine storage failure as a storage error", async () => {
  // Read stream stays healthy and keeps producing rows.
  const readStream = new Readable({
    objectMode: true,
    read() {
      this.push({ id: "row" });
    },
  });
  mocks.getEventsStream.mockResolvedValue(readStream);

  const s3Error = new Error("S3 AccessDenied");
  const storageError = new Error("Failed to upload file to S3 (buffered)", {
    cause: s3Error,
  });

  // A real part-upload failure aborts the piped stream (as BufferedStreamUploader
  // does on its early break), which trips the pipeline's premature-close error,
  // then rejects with the storage error — whose cause is the S3 failure, not the
  // premature-close.
  mocks.uploadFileBuffered.mockImplementation(
    ({ data }: { data: Readable }) =>
      new Promise((_resolve, reject) => {
        data.once("data", () => {
          data.destroy();
          setImmediate(() => reject(storageError));
        });
      }),
  );

  seedQueuedExport();

  const thrown = await runAndCatch();

  expect(thrown).toBe(storageError);
  expect(thrown.message).toContain("S3");
  expect(mocks.getSignedUrl).not.toHaveBeenCalled();
});
