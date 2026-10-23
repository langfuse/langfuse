import { expect, it, vi } from "vitest";

const { createEventUploadStorageService } = vi.hoisted(() => ({
  createEventUploadStorageService: vi
    .fn()
    .mockImplementation(
      (_bucketName: string, options?: { maxAttempts?: number }) => ({
        options,
      }),
    ),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  createEventUploadStorageService,
}));

vi.mock("../../../env", () => ({
  env: {
    LANGFUSE_S3_EVENT_UPLOAD_BUCKET: "event-bucket",
  },
}));

import {
  getEvalS3StorageClient,
  getEvalScoreS3StorageClient,
} from "../s3StorageClient";

it("raises retries only for evaluator score uploads", () => {
  const observationClient = getEvalS3StorageClient();
  const scoreClient = getEvalScoreS3StorageClient();

  expect(observationClient).not.toBe(scoreClient);
  expect(createEventUploadStorageService).toHaveBeenNthCalledWith(
    1,
    "event-bucket",
  );
  expect(createEventUploadStorageService).toHaveBeenNthCalledWith(
    2,
    "event-bucket",
    { maxAttempts: 6 },
  );
});
