import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryClickhouse: vi.fn(),
  commandClickhouse: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  deferNgramIndex: "false",
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

vi.mock("../env", () => ({
  env: {
    LANGFUSE_EVENT_PROPAGATION_EXCLUDE_PROJECT_IDS: [],
    LANGFUSE_EVENT_PROPAGATION_MAX_INSERT_THREADS: 8,
    LANGFUSE_EXPERIMENT_EVENT_PROPAGATION_PARTITION_DELAY_MINUTES: 10,
    get LANGFUSE_EVENT_PROPAGATION_DEFER_NGRAM_INDEX() {
      return mocks.deferNgramIndex;
    },
  },
}));

import { handleEventPropagationJob } from "../features/eventPropagation/handleEventPropagationJob";

const cursorKey = "langfuse:event-propagation:last-processed-partition";
const nextPartition = "2026-01-01 00:03:00";
const job = {
  data: { id: "event-propagation-index-settings-test" },
} as Parameters<typeof handleEventPropagationJob>[0];

describe("event propagation index materialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deferNgramIndex = "false";
    mocks.queryClickhouse.mockResolvedValue([{ partition: nextPartition }]);
    mocks.commandClickhouse.mockResolvedValue(undefined);
    mocks.redisGet.mockResolvedValue("2026-01-01 00:00:00");
    mocks.redisSet.mockResolvedValue("OK");
  });

  it("preserves ClickHouse index settings when deferral is disabled", async () => {
    await handleEventPropagationJob(job);

    const settings =
      mocks.commandClickhouse.mock.calls[0]![0].clickhouseSettings;
    expect(settings).not.toHaveProperty(
      "exclude_materialize_skip_indexes_on_insert",
    );
    expect(settings).not.toHaveProperty("materialize_skip_indexes_on_insert");
    expect(mocks.redisSet).toHaveBeenCalledWith(cursorKey, nextPartition);
  });

  it("defers only the metadata n-gram index on the propagation insert", async () => {
    mocks.deferNgramIndex = "true";

    await handleEventPropagationJob(job);

    const settings =
      mocks.commandClickhouse.mock.calls[0]![0].clickhouseSettings;
    expect(settings).toHaveProperty(
      "exclude_materialize_skip_indexes_on_insert",
      "idx_ngram_metadata_values",
    );
    expect(settings).not.toHaveProperty("materialize_skip_indexes_on_insert");
    expect(mocks.queryClickhouse.mock.calls[0]![0]).not.toHaveProperty(
      "clickhouseSettings",
    );
    expect(mocks.redisSet).toHaveBeenCalledWith(cursorKey, nextPartition);
  });

  it("does not advance the cursor if the insert with deferred indexing fails", async () => {
    mocks.deferNgramIndex = "true";
    const failure = new Error("ClickHouse insert failed");
    mocks.commandClickhouse.mockRejectedValueOnce(failure);

    await expect(handleEventPropagationJob(job)).rejects.toBe(failure);

    expect(mocks.redisSet).not.toHaveBeenCalledWith(cursorKey, nextPartition);
  });
});
