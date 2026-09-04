import { beforeEach, describe, expect, it, vi } from "vitest";

const redisState = vi.hoisted(() => ({
  store: new Map<string, string>(),
}));

const mocks = vi.hoisted(() => ({
  recordGauge: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...original,
    redis: {
      get: vi.fn(async (key: string) => redisState.store.get(key) ?? null),
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    recordGauge: mocks.recordGauge,
  };
});

import { V4_LEGACY_API_USAGE_HEARTBEAT_KEY } from "@langfuse/shared/src/server";
import {
  emitV4LegacyApiUsageFreshnessMetrics,
  V4_LEGACY_API_USAGE_HEARTBEAT_AGE_METRIC,
} from "../v4LegacyApiUsageMetrics";

describe("emitV4LegacyApiUsageFreshnessMetrics", () => {
  beforeEach(() => {
    redisState.store.clear();
    vi.clearAllMocks();
  });

  it("emits heartbeat age in seconds for a present heartbeat", async () => {
    redisState.store.set(
      V4_LEGACY_API_USAGE_HEARTBEAT_KEY,
      "2026-06-25T10:00:00.000Z",
    );

    await emitV4LegacyApiUsageFreshnessMetrics(
      Date.parse("2026-06-25T10:30:00Z"),
    );

    expect(mocks.recordGauge).toHaveBeenCalledWith(
      V4_LEGACY_API_USAGE_HEARTBEAT_AGE_METRIC,
      1800,
      { unit: "seconds" },
    );
  });

  it("emits nothing when the heartbeat is missing (no-data alert)", async () => {
    await emitV4LegacyApiUsageFreshnessMetrics(
      Date.parse("2026-06-25T10:30:00Z"),
    );

    expect(mocks.recordGauge).not.toHaveBeenCalled();
  });
});
