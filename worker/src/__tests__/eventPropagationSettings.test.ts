import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryClickhouse: vi.fn(),
  commandClickhouse: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  maxBlockSize: undefined as number | undefined,
  minInsertBlockSizeRows: undefined as number | undefined,
  minInsertBlockSizeBytes: undefined as number | undefined,
}));

vi.mock("@langfuse/shared/src/server", () => ({
  queryClickhouse: mocks.queryClickhouse,
  commandClickhouse: mocks.commandClickhouse,
  getCurrentSpan: vi.fn(() => undefined),
  logger: { info: vi.fn(), error: vi.fn() },
  traceException: vi.fn(),
  recordGauge: vi.fn(),
  redis: { get: mocks.redisGet, set: mocks.redisSet },
}));

vi.mock("../env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../env")>();
  return {
    ...mod,
    env: {
      ...mod.env,
      get LANGFUSE_EVENT_PROPAGATION_MAX_BLOCK_SIZE() {
        return mocks.maxBlockSize;
      },
      get LANGFUSE_EVENT_PROPAGATION_MIN_INSERT_BLOCK_SIZE_ROWS() {
        return mocks.minInsertBlockSizeRows;
      },
      get LANGFUSE_EVENT_PROPAGATION_MIN_INSERT_BLOCK_SIZE_BYTES() {
        return mocks.minInsertBlockSizeBytes;
      },
    },
  };
});

import { handleEventPropagationJob } from "../features/eventPropagation/handleEventPropagationJob";

const cursorKey = "langfuse:event-propagation:last-processed-partition";
const previousPartition = "2026-09-13 23:15:00";
const nextPartition = "2026-09-13 23:18:00";
const job = {
  data: { id: "event-propagation-settings-test" },
} as Parameters<typeof handleEventPropagationJob>[0];

describe("event propagation query settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maxBlockSize = undefined;
    mocks.minInsertBlockSizeRows = undefined;
    mocks.minInsertBlockSizeBytes = undefined;
    mocks.queryClickhouse.mockResolvedValue([{ partition: nextPartition }]);
    mocks.commandClickhouse.mockResolvedValue(undefined);
    mocks.redisGet.mockResolvedValue(previousPartition);
    mocks.redisSet.mockResolvedValue("OK");
  });

  it("preserves ClickHouse block defaults when no overrides are configured", async () => {
    await handleEventPropagationJob(job);

    const settings =
      mocks.commandClickhouse.mock.calls[0]![0].clickhouseSettings;
    expect(settings).not.toHaveProperty("max_block_size");
    expect(settings).not.toHaveProperty("min_insert_block_size_rows");
    expect(settings).not.toHaveProperty("min_insert_block_size_bytes");
    expect(mocks.redisSet).toHaveBeenCalledWith(cursorKey, nextPartition);
  });

  it("applies block overrides only to the insert and preserves a zero row threshold", async () => {
    mocks.maxBlockSize = 256;
    mocks.minInsertBlockSizeRows = 0;
    mocks.minInsertBlockSizeBytes = 67_108_864;

    await handleEventPropagationJob(job);

    expect(mocks.commandClickhouse).toHaveBeenCalledWith(
      expect.objectContaining({
        clickhouseSettings: expect.objectContaining({
          max_block_size: "256",
          min_insert_block_size_rows: "0",
          min_insert_block_size_bytes: "67108864",
        }),
      }),
    );
    expect(mocks.queryClickhouse).toHaveBeenCalledTimes(1);
    expect(mocks.queryClickhouse.mock.calls[0]![0]).not.toHaveProperty(
      "clickhouseSettings",
    );
    expect(mocks.redisSet).toHaveBeenCalledWith(cursorKey, nextPartition);
  });

  it("preserves an explicit zero byte threshold independently of the other overrides", async () => {
    mocks.minInsertBlockSizeBytes = 0;

    await handleEventPropagationJob(job);

    const settings =
      mocks.commandClickhouse.mock.calls[0]![0].clickhouseSettings;
    expect(settings).toHaveProperty("min_insert_block_size_bytes", "0");
    expect(settings).not.toHaveProperty("max_block_size");
    expect(settings).not.toHaveProperty("min_insert_block_size_rows");
  });

  it("keeps the partition cursor unchanged when the configured insert fails", async () => {
    mocks.maxBlockSize = 256;
    mocks.minInsertBlockSizeRows = 0;
    mocks.minInsertBlockSizeBytes = 67_108_864;
    const failure = new Error("ClickHouse insert failed");
    mocks.commandClickhouse.mockRejectedValueOnce(failure);

    await expect(handleEventPropagationJob(job)).rejects.toBe(failure);

    expect(mocks.redisSet).not.toHaveBeenCalledWith(cursorKey, nextPartition);
    expect(mocks.redisSet).toHaveBeenCalledTimes(1);
  });
});
