import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { env } from "../../env";
import { ingestionQueueProcessorBuilder } from "../ingestionQueue";

const { addToQueueMock, redisMock } = vi.hoisted(() => ({
  addToQueueMock: vi.fn(),
  redisMock: { exists: vi.fn(), set: vi.fn() },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  getS3EventStorageClient: vi.fn(),
  hasS3SlowdownFlag: vi.fn(),
  markProjectS3Slowdown: vi.fn(),
  markProjectIngestFailure: vi.fn(),
  redis: redisMock,
}));

vi.mock("../../services/ClickhouseWriter", () => ({
  ClickhouseWriter: {
    getInstance: vi.fn(() => ({ addToQueue: addToQueueMock })),
  },
  TableName: { BlobStorageFileLog: "blob_storage_file_log" },
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
    redisMock.exists.mockResolvedValue(0);

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

describe("ingestion queue recently-processed cache", () => {
  const originalSeenEventCache = env.LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE;

  beforeEach(() => {
    vi.clearAllMocks();
    (env as any).LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE = "true";
  });

  afterEach(() => {
    (env as any).LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE =
      originalSeenEventCache;
  });

  it("logs the file of a skipped job so deletions can find it", async () => {
    redisMock.exists.mockResolvedValue(1);
    const processor = ingestionQueueProcessorBuilder(true);

    await processor(ingestionJob);

    expect(getS3EventStorageClient).not.toHaveBeenCalled();
    expect(addToQueueMock).toHaveBeenCalledWith(
      "blob_storage_file_log",
      expect.objectContaining({
        project_id: projectId,
        entity_type: "trace",
        entity_id: "trace-1",
        event_id: "file-1",
        bucket_path: expect.stringMatching(/trace-1\/file-1\.json$/),
        is_deleted: 0,
      }),
    );
  });
});
