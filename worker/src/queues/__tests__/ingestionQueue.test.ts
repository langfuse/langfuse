import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Job } from "bullmq";
import type { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import {
  getS3EventStorageClient,
  hasS3SlowdownFlag,
  markProjectIngestFailure,
  markProjectS3Slowdown,
  redis,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { ingestionQueueProcessorBuilder } from "../ingestionQueue";

const testDoubles = vi.hoisted(() => ({
  redisEntries: new Map<string, string>(),
  s3: {
    listFiles: vi.fn(),
    download: vi.fn(),
  },
  mergeAndWrite: vi.fn(),
  addToQueue: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  clickhouseClient: vi.fn(() => ({})),
  getS3EventStorageClient: vi.fn(),
  hasS3SlowdownFlag: vi.fn(),
  getClickhouseEntityType: vi.fn(() => "observations"),
  getCurrentSpan: vi.fn(() => null),
  isS3SlowDownError: vi.fn(
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      (("name" in error && error.name === "SlowDown") ||
        ("Code" in error && error.Code === "SlowDown")),
  ),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  markProjectS3Slowdown: vi.fn(),
  markProjectIngestFailure: vi.fn(),
  QueueName: {
    IngestionQueue: "ingestion-queue",
    IngestionSecondaryQueue: "secondary-ingestion-queue",
  },
  rawEventBucketPrefix: vi.fn(
    ({ projectId, entityType, rawEntityIdSegment }) =>
      `${projectId}/${entityType}/${rawEntityIdSegment}/`,
  ),
  recordDistribution: vi.fn(),
  recordHistogram: vi.fn(),
  recordIncrement: vi.fn(),
  redis: {
    exists: vi.fn(),
    set: vi.fn(),
  },
  SecondaryIngestionQueue: { getInstance: vi.fn(() => null) },
  UNKNOWN_INGESTION_SDK_VALUE: "unknown",
  toClickhouseDateTime: vi.fn(() => new Date()),
  traceException: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({ prisma: {} }));

vi.mock("@langfuse/shared", () => ({
  removeEmptyEnvVariables: (runtimeEnv: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(runtimeEnv)) {
      if (value === "") delete runtimeEnv[key];
    }
    return runtimeEnv;
  },
}));

vi.mock("../../services/ClickhouseWriter", () => ({
  ClickhouseWriter: {
    getInstance: vi.fn(() => ({ addToQueue: testDoubles.addToQueue })),
  },
  TableName: { BlobStorageFileLog: "blob_storage_file_log" },
}));

vi.mock("../../services/IngestionService", () => ({
  IngestionService: vi.fn().mockImplementation(function () {
    return { mergeAndWrite: testDoubles.mergeAndWrite };
  }),
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

    const slowDown = Object.assign(
      new Error("Failed to download file from S3"),
      { name: "SlowDown", Code: "SlowDown" },
    );
    testDoubles.s3.download.mockRejectedValue(slowDown);
    vi.mocked(getS3EventStorageClient).mockReturnValue(
      testDoubles.s3 as unknown as ReturnType<typeof getS3EventStorageClient>,
    );
  });

  afterEach(() => {
    testDoubles.s3.listFiles.mockReset();
    testDoubles.s3.download.mockReset();
    vi.clearAllMocks();
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

describe("ingestion queue Redis seen-event cache", () => {
  let originalSeenCacheFlag: "true" | "false";
  let originalBlobStorageFileLogFlag: "true" | "false";

  beforeEach(() => {
    vi.clearAllMocks();
    testDoubles.redisEntries.clear();
    originalSeenCacheFlag = env.LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE;
    originalBlobStorageFileLogFlag = env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG;
    env.LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE = "true";
    env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG = "false";

    vi.mocked(hasS3SlowdownFlag).mockResolvedValue(false);
    vi.mocked(redis.exists).mockImplementation(async (key: string) =>
      testDoubles.redisEntries.has(key) ? 1 : 0,
    );
    vi.mocked(redis.set).mockImplementation(
      async (key: string, value: string) => {
        testDoubles.redisEntries.set(key, value);
        return "OK";
      },
    );
    vi.mocked(getS3EventStorageClient).mockReturnValue(
      testDoubles.s3 as unknown as ReturnType<typeof getS3EventStorageClient>,
    );
    vi.mocked(testDoubles.mergeAndWrite).mockResolvedValue(undefined);
  });

  afterEach(() => {
    env.LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE = originalSeenCacheFlag;
    env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG =
      originalBlobStorageFileLogFlag;
    testDoubles.redisEntries.clear();
    testDoubles.s3.listFiles.mockReset();
    testDoubles.s3.download.mockReset();
    vi.clearAllMocks();
  });

  it("ingests a distinct event whose file key collides after the first .json", async () => {
    const prefix = "project-1/observation/span-1/";
    const eventAId = "a.json.b";
    const eventBId = "a.b.json";
    const fileA = `${prefix}${eventAId}.json`;
    const fileB = `${prefix}${eventBId}.json`;
    const eventA = {
      id: eventAId,
      type: "span-create",
      timestamp: "2026-10-31T10:00:00.000Z",
      body: { id: "span-1" },
    };
    const eventB = {
      id: eventBId,
      type: "span-create",
      timestamp: "2026-10-31T10:00:01.000Z",
      body: { id: "span-1" },
    };
    const objects = new Map<string, string>([
      [fileA, JSON.stringify([eventA])],
    ]);
    let signalADownloadStarted!: () => void;
    let releaseADownload!: () => void;
    let gateFirstADownload = true;
    let processingA: Promise<unknown> | undefined;
    const aDownloadStarted = new Promise<void>((resolve) => {
      signalADownloadStarted = resolve;
    });
    const aDownloadGate = new Promise<void>((resolve) => {
      releaseADownload = resolve;
    });

    testDoubles.s3.listFiles.mockImplementation(async () =>
      Array.from(objects.keys(), (file) => ({ file, createdAt: new Date() })),
    );
    testDoubles.s3.download.mockImplementation(async (file: string) => {
      if (file === fileA && gateFirstADownload) {
        gateFirstADownload = false;
        signalADownloadStarted();
        await aDownloadGate;
      }
      const content = objects.get(file);
      if (content === undefined) {
        throw new Error(`Unexpected S3 object requested: ${file}`);
      }
      return content;
    });

    const createJob = (fileKey: string, id: string) =>
      ({
        data: {
          id,
          timestamp: new Date(),
          name: "ingestion-job",
          payload: {
            authCheck: {
              validKey: true,
              scope: { projectId: "project-1", accessLevel: "project" },
            },
            data: {
              type: "span-create",
              eventBodyId: "span-1",
              fileKey,
              bucketPrefix: prefix,
              skipS3List: false,
              forwardToEventsTable: false,
            },
          },
        },
        attemptsMade: 0,
        opts: { attempts: 5 },
      }) as unknown as Job<TQueueJobTypes[QueueName.IngestionQueue]>;

    const processor = ingestionQueueProcessorBuilder(false);
    try {
      processingA = processor(createJob(eventAId, "job-a"));
      await Promise.race([
        aDownloadStarted,
        processingA.then(() => {
          throw new Error("Event A completed before its S3 download started");
        }),
      ]);

      // A has already taken its listing, which contains only A. B becomes
      // visible while A is downloading, before A writes its seen-cache key.
      objects.set(fileB, JSON.stringify([eventB]));
      releaseADownload();
      await processingA;

      await processor(createJob(eventBId, "job-b"));

      expect(testDoubles.mergeAndWrite).toHaveBeenCalledTimes(2);
      expect(testDoubles.mergeAndWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          events: expect.arrayContaining([
            expect.objectContaining({ id: eventBId }),
          ]),
        }),
      );
    } finally {
      // Release the deferred operation even if an earlier assertion/setup step
      // fails, so the test cannot leave a pending processor promise behind.
      releaseADownload();
      await processingA;
    }
  });

  it("deduplicates a repeated event with a normal S3 filename", async () => {
    const event = {
      id: "event-1",
      type: "trace-create",
      timestamp: "2026-10-31T10:00:00.000Z",
      body: { id: "trace-1" },
    };
    testDoubles.s3.download.mockResolvedValue(JSON.stringify([event]));

    const processor = ingestionQueueProcessorBuilder(false);
    await processor(ingestionJob);
    await processor(ingestionJob);

    expect(testDoubles.s3.download).toHaveBeenCalledTimes(1);
    expect(testDoubles.mergeAndWrite).toHaveBeenCalledTimes(1);
  });
});
