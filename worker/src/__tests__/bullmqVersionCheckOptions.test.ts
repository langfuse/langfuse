import { afterEach, describe, expect, test, vi } from "vitest";

const requiredSharedEnv = {
  CLICKHOUSE_URL: "http://localhost:8123",
  CLICKHOUSE_USER: "default",
  CLICKHOUSE_PASSWORD: "password",
  LANGFUSE_S3_EVENT_UPLOAD_BUCKET: "test-bucket",
};

const requiredRedisEnv = {
  REDIS_HOST: "localhost",
  REDIS_PORT: "6379",
  REDIS_AUTH: "password",
  REDIS_KEY_PREFIX: "test-prefix",
};

const originalEnv = { ...process.env };

const setRequiredEnv = () => {
  for (const [key, value] of Object.entries({
    ...requiredSharedEnv,
    ...requiredRedisEnv,
  })) {
    process.env[key] ??= value;
  }
};

const mockIoredis = () => {
  const redisInstances: MockRedis[] = [];

  class MockRedis {
    public options: Record<string, unknown>;
    public status = "ready";
    public isCluster = false;
    public on = vi.fn();
    public duplicate = vi.fn(() => new MockRedis(this.options));

    constructor(...args: unknown[]) {
      this.options =
        typeof args[0] === "string"
          ? ((args[1] ?? {}) as Record<string, unknown>)
          : ((args[0] ?? {}) as Record<string, unknown>);
      redisInstances.push(this);
    }
  }

  class MockCluster extends MockRedis {
    public isCluster = true;

    constructor(_nodes: unknown, options: Record<string, unknown>) {
      super(options);
    }
  }

  vi.doMock("ioredis", () => ({
    default: MockRedis,
    Cluster: MockCluster,
  }));

  return redisInstances;
};

const importRedisModule = async () => {
  setRequiredEnv();
  const redisInstances = mockIoredis();

  const redisModule =
    await import("../../../packages/shared/src/server/redis/redis");
  redisInstances.length = 0;

  return { redisInstances, redisModule };
};

describe("BullMQ Redis version check options", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    delete (globalThis as Record<string, unknown>).redis;
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  test("does not skip Redis version checks by default", async () => {
    delete process.env.LANGFUSE_BULLMQ_SKIP_REDIS_VERSION_CHECK;

    const { redisInstances, redisModule } = await importRedisModule();
    const options = redisModule.createBullMQQueueOptionsWithRedis("test-queue");

    expect(options?.connection).toBe(redisInstances[0]);
    expect(options).toMatchObject({ prefix: "test-prefix" });
    expect(options).not.toHaveProperty("skipVersionCheck");
    expect(redisInstances[0]?.options).toMatchObject({
      enableOfflineQueue: false,
      retryStrategy: expect.any(Function),
    });
  });

  test("skips Redis version checks when configured", async () => {
    process.env.LANGFUSE_BULLMQ_SKIP_REDIS_VERSION_CHECK = "true";

    const { redisModule } = await importRedisModule();
    const options = redisModule.createBullMQQueueOptionsWithRedis("test-queue");

    expect(options).toMatchObject({
      prefix: "test-prefix",
      skipVersionCheck: true,
    });
  });

  test("uses worker Redis retry options without disabling offline queue", async () => {
    const { redisInstances, redisModule } = await importRedisModule();
    const options =
      redisModule.createBullMQWorkerOptionsWithRedis("test-queue");

    expect(options?.connection).toBe(redisInstances[0]);
    expect(redisInstances[0]?.options).toMatchObject({
      retryStrategy: expect.any(Function),
    });
    expect(redisInstances[0]?.options).not.toHaveProperty("enableOfflineQueue");
  });

  test("passes centralized options to BullMQ workers", async () => {
    const workerOptionsWithRedis = {
      connection: {},
      prefix: "test-prefix",
      skipVersionCheck: true,
    };
    const createBullMQWorkerOptionsWithRedis = vi.fn(
      () => workerOptionsWithRedis,
    );
    const workerInstances: Array<{
      queueName: string;
      options: Record<string, unknown>;
    }> = [];

    vi.doMock("bullmq", () => ({
      Job: class {},
      Worker: class {
        constructor(
          queueName: string,
          _processor: unknown,
          options: Record<string, unknown>,
        ) {
          workerInstances.push({ queueName, options });
        }

        isRunning = () => true;
        on = vi.fn();
        close = vi.fn(async () => undefined);
      },
    }));

    vi.doMock("@langfuse/shared/src/server", () => ({
      QueueName: {
        IngestionQueue: "ingestion-queue",
      },
      convertQueueNameToMetricName: (queueName: string) => queueName,
      createBullMQWorkerOptionsWithRedis,
      logger: {
        error: vi.fn(),
        info: vi.fn(),
      },
      recordGauge: vi.fn(),
      recordHistogram: vi.fn(),
      recordIncrement: vi.fn(),
      traceException: vi.fn(),
    }));

    vi.doMock("../env", () => ({
      env: {
        LANGFUSE_QUEUE_METRICS_SAMPLE_RATE: 0,
      },
    }));

    vi.doMock("../queues/shardedQueueRegistry", () => ({
      resolveQueueInstance: vi.fn(),
      SHARDED_QUEUE_BASE_NAMES: [],
    }));

    const { WorkerManager } = await import("../queues/workerManager");

    WorkerManager.register("ingestion-queue" as never, async () => true, {
      concurrency: 7,
    });

    expect(createBullMQWorkerOptionsWithRedis).toHaveBeenCalledWith(
      "ingestion-queue",
    );
    expect(workerInstances).toHaveLength(1);
    expect(workerInstances[0]?.options).toMatchObject({
      ...workerOptionsWithRedis,
      concurrency: 7,
    });
  });

  test("passes centralized options to BullMQ queue producers", async () => {
    const queueOptionsWithRedis = {
      connection: {},
      prefix: "test-prefix",
      skipVersionCheck: true,
    };
    const createBullMQQueueOptionsWithRedis = vi.fn(
      () => queueOptionsWithRedis,
    );
    const queueInstances: Array<{
      queueName: string;
      options: Record<string, unknown>;
    }> = [];

    vi.doMock("bullmq", () => ({
      Queue: class {
        constructor(queueName: string, options: Record<string, unknown>) {
          queueInstances.push({ queueName, options });
        }

        on = vi.fn();
      },
    }));

    vi.doMock("../../../packages/shared/src/server/redis/redis", () => ({
      createBullMQQueueOptionsWithRedis,
    }));

    vi.doMock("../../../packages/shared/src/server/logger", () => ({
      logger: {
        error: vi.fn(),
      },
    }));

    vi.doMock("../../../packages/shared/src/server/queues", () => ({
      QueueName: {
        BatchExport: "batch-export-queue",
      },
      TQueueJobTypes: {},
    }));

    const { BatchExportQueue } =
      await import("../../../packages/shared/src/server/redis/batchExport");

    BatchExportQueue.getInstance();

    expect(createBullMQQueueOptionsWithRedis).toHaveBeenCalledWith(
      "batch-export-queue",
    );
    expect(queueInstances).toHaveLength(1);
    expect(queueInstances[0]?.options).toMatchObject({
      ...queueOptionsWithRedis,
      defaultJobOptions: expect.objectContaining({
        attempts: 8,
        removeOnComplete: true,
        removeOnFail: 10_000,
      }),
    });
  });
});
