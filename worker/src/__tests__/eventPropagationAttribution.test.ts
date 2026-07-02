import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commandClickhouse: vi.fn(),
  queryClickhouse: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  recordGauge: vi.fn(),
  traceException: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  commandClickhouse: mocks.commandClickhouse,
  getCurrentSpan: () => ({ setAttribute: vi.fn() }),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
  queryClickhouse: mocks.queryClickhouse,
  QueueName: {
    EventPropagationQueue: "event-propagation",
  },
  recordGauge: mocks.recordGauge,
  redis: {
    get: mocks.redisGet,
    set: mocks.redisSet,
  },
  traceException: mocks.traceException,
}));

import { handleEventPropagationJob } from "../features/eventPropagation/handleEventPropagationJob";

describe("handleEventPropagationJob attribution propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commandClickhouse.mockResolvedValue(undefined);
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.queryClickhouse.mockResolvedValue([
      { partition: "2024-10-12 12:10:00.000" },
    ]);
  });

  it("copies ingestion attribution from observation staging rows into events_full", async () => {
    await handleEventPropagationJob({
      data: { id: "event-propagation-job-id" },
    } as Parameters<typeof handleEventPropagationJob>[0]);

    expect(mocks.commandClickhouse).toHaveBeenCalledTimes(1);
    const query = mocks.commandClickhouse.mock.calls[0][0].query as string;

    expect(query).toMatch(
      /INSERT INTO events_full \([\s\S]*is_deleted,\s*ingestion_api_key,\s*ingestion_sdk_name,\s*ingestion_sdk_version\s*\)/,
    );
    expect(query).toContain("obs.ingestion_api_key AS ingestion_api_key");
    expect(query).toContain("obs.ingestion_sdk_name AS ingestion_sdk_name");
    expect(query).toContain(
      "obs.ingestion_sdk_version AS ingestion_sdk_version",
    );
  });
});
