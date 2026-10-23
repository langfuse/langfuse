// @vitest-environment node

import { getBlobStorageStatus } from "./useBlobStorageIntegration";

const healthyConfig = {
  enabled: true,
  lastError: null,
  lastSyncAt: new Date("2026-01-01T00:00:00Z"),
  nextSyncAt: new Date(Date.now() + 60 * 60 * 1000),
  runStartedAt: null,
};

describe("getBlobStorageStatus", () => {
  it("returns undefined when not configured", () => {
    expect(getBlobStorageStatus(null)).toBeUndefined();
  });

  it.each([
    [{}, "active"],
    [{ enabled: false }, "disabled"],
    [{ lastError: "Access denied" }, "error"],
    [{ runStartedAt: new Date() }, "running"],
    [{ nextSyncAt: new Date(Date.now() - 1000) }, "queued"],
    [{ lastSyncAt: null }, "pending"],
  ])("maps %o to %s", (override, expected) => {
    expect(getBlobStorageStatus({ ...healthyConfig, ...override })).toBe(
      expected,
    );
  });
});
