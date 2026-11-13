import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRACE_BATCH_INPUT_PREFIX,
  TRACE_BATCH_INPUT_RETENTION_MS,
} from "../../../../packages/shared/src/server/traceBatch/storage";
import { env } from "../../env";
import { TraceBatchInputCleaner } from "./index";

const mocks = vi.hoisted(() => ({
  listFilePage: vi.fn(),
  deleteFiles: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const storage =
    await import("../../../../packages/shared/src/server/traceBatch/storage");
  return {
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    recordIncrement: vi.fn(),
    recordGauge: vi.fn(),
    recordDistribution: vi.fn(),
    traceException: vi.fn(),
    getCurrentSpan: vi.fn(),
    instrumentAsync: async (
      _config: unknown,
      fn: (span: { setAttribute: () => void }) => unknown,
    ) => fn({ setAttribute() {} }),
    contextWithLangfuseProps: () => ({}),
    getS3EventStorageClient: () => mocks,
    TRACE_BATCH_INPUT_PREFIX: storage.TRACE_BATCH_INPUT_PREFIX,
    TRACE_BATCH_INPUT_RETENTION_MS: storage.TRACE_BATCH_INPUT_RETENTION_MS,
  };
});

vi.mock("../../utils/RedisLock", () => ({
  RedisLock: class {
    key = "test-lock";
    async extend() {
      return true;
    }
    async withLock<T>(operation: () => Promise<T>) {
      return operation();
    }
  },
}));

describe("TraceBatchInputCleaner", () => {
  const prefix = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${TRACE_BATCH_INPUT_PREFIX}`;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteFiles.mockResolvedValue(undefined);
  });

  it("deletes objects older than the retention window and keeps newer ones", async () => {
    const fresh = `${prefix}fresh.json`;
    const expired = `${prefix}old.json`;
    mocks.listFilePage
      .mockResolvedValueOnce({
        files: [{ file: fresh, createdAt: new Date() }],
        continuationToken: "page-2",
      })
      .mockResolvedValueOnce({
        files: [
          {
            file: expired,
            createdAt: new Date(
              Date.now() - TRACE_BATCH_INPUT_RETENTION_MS - 60_000,
            ),
          },
        ],
      });

    await new TraceBatchInputCleaner().processBatch();

    expect(mocks.listFilePage).toHaveBeenNthCalledWith(1, {
      prefix,
      continuationToken: undefined,
    });
    expect(mocks.listFilePage).toHaveBeenNthCalledWith(2, {
      prefix,
      continuationToken: "page-2",
    });
    expect(mocks.deleteFiles).toHaveBeenCalledTimes(1);
    expect(mocks.deleteFiles).toHaveBeenCalledWith([expired]);
  });
});
