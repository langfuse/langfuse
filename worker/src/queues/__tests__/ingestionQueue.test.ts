import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Job } from "bullmq";
import {
  getS3EventStorageClient,
  hasS3SlowdownFlag,
  markProjectIngestFailure,
  markProjectS3Slowdown,
  type QueueName,
  StorageServiceFactory,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { ingestionQueueProcessorBuilder } from "../ingestionQueue";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  getS3EventStorageClient: vi.fn(),
  hasS3SlowdownFlag: vi.fn(),
  markProjectS3Slowdown: vi.fn(),
  markProjectIngestFailure: vi.fn(),
}));

vi.mock("../../services/ClickhouseWriter", () => ({
  ClickhouseWriter: { getInstance: vi.fn(() => ({})) },
  TableName: {},
}));

const projectId = "slowdown-project";

const ingestionJob = {
  data: {
    id: "job-1",
    timestamp: new Date(),
    name: "ingestion-job",
    payload: {
      authCheck: {
        validKey: true,
        scope: { projectId, accessLevel: "project" },
      },
      data: {
        type: "trace-create",
        eventBodyId: "trace-1",
        fileKey: "file-1",
        skipS3List: true,
      },
    },
  },
  attemptsMade: 0,
  opts: { attempts: 5 },
} as unknown as Job<TQueueJobTypes[QueueName.IngestionQueue]>;

describe("ingestion queue S3 SlowDown handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasS3SlowdownFlag).mockResolvedValue(false);

    const storage = StorageServiceFactory.getInstance({
      bucketName: "events",
      accessKeyId: "test",
      secretAccessKey: "test",
      region: "us-east-1",
      endpoint: "http://127.0.0.1:1",
      forcePathStyle: true,
      useAzureBlob: false,
      useGoogleCloudStorage: false,
    });
    const slowDown = Object.assign(
      new Error("Please reduce your request rate."),
      { name: "SlowDown", Code: "SlowDown" },
    );
    vi.spyOn(
      (storage as unknown as { client: { send: () => Promise<unknown> } })
        .client,
      "send",
    ).mockRejectedValue(slowDown);
    vi.mocked(getS3EventStorageClient).mockReturnValue(storage);
  });

  it("marks the project for the secondary queue when the storage client wraps a SlowDown", async () => {
    const processor = ingestionQueueProcessorBuilder(true);

    await expect(processor(ingestionJob)).rejects.toThrow(
      "Failed to download file from S3",
    );

    expect(markProjectS3Slowdown).toHaveBeenCalledWith(projectId);
    expect(markProjectIngestFailure).toHaveBeenCalledWith(projectId, {
      source: "ingestion_queue",
      reason: "s3_slowdown",
    });
  });
});
