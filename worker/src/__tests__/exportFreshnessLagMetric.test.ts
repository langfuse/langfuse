import { describe, it, expect, vi, beforeEach } from "vitest";

const recordDistribution = vi.fn();
vi.mock("@langfuse/shared/src/server", () => ({
  recordDistribution: (...args: unknown[]) => recordDistribution(...args),
}));

import {
  recordExportFreshnessLag,
  windowClassFromBlobFrequency,
  EXPORT_FRESHNESS_LAG_METRIC,
} from "../services/exportFreshnessLagMetric";

describe("recordExportFreshnessLag", () => {
  const runStartTime = new Date("2026-09-08T12:00:00.000Z");

  beforeEach(() => recordDistribution.mockClear());

  it("emits runStart − watermark in seconds as a distribution, without project_id", () => {
    recordExportFreshnessLag({
      integration: "blob_storage",
      window: "20m",
      status: "success",
      runStartTime,
      maxExportedTimestamp: new Date("2026-09-08T11:40:00.000Z"),
    });

    expect(recordDistribution).toHaveBeenCalledWith(
      EXPORT_FRESHNESS_LAG_METRIC,
      1200,
      {
        integration: "blob_storage",
        window: "20m",
        status: "success",
        unit: "seconds",
      },
    );
    expect(recordDistribution.mock.calls[0][2]).not.toHaveProperty(
      "project_id",
    );
    expect(recordDistribution.mock.calls[0][2]).not.toHaveProperty("projectId");
  });

  it("emits failing runs against the unchanged watermark so stall shows as rising lag", () => {
    recordExportFreshnessLag({
      integration: "posthog",
      window: "1h",
      status: "failure",
      runStartTime,
      maxExportedTimestamp: new Date("2026-09-08T06:00:00.000Z"),
    });

    expect(recordDistribution).toHaveBeenCalledWith(
      EXPORT_FRESHNESS_LAG_METRIC,
      6 * 60 * 60,
      {
        integration: "posthog",
        window: "1h",
        status: "failure",
        unit: "seconds",
      },
    );
  });

  it("skips when there is no watermark yet", () => {
    recordExportFreshnessLag({
      integration: "mixpanel",
      window: "1h",
      status: "failure",
      runStartTime,
      maxExportedTimestamp: null,
    });
    recordExportFreshnessLag({
      integration: "mixpanel",
      window: "1h",
      status: "success",
      runStartTime,
      maxExportedTimestamp: undefined,
    });
    expect(recordDistribution).not.toHaveBeenCalled();
  });

  it("clamps a watermark ahead of run start to zero", () => {
    recordExportFreshnessLag({
      integration: "blob_storage",
      window: "1d",
      status: "success",
      runStartTime,
      maxExportedTimestamp: new Date("2026-09-08T12:05:00.000Z"),
    });
    expect(recordDistribution).toHaveBeenCalledWith(
      EXPORT_FRESHNESS_LAG_METRIC,
      0,
      expect.objectContaining({ status: "success", window: "1d" }),
    );
  });
});

describe("windowClassFromBlobFrequency", () => {
  it("maps configured blob cadences to window classes", () => {
    expect(windowClassFromBlobFrequency("every_20_minutes")).toBe("20m");
    expect(windowClassFromBlobFrequency("hourly")).toBe("1h");
    expect(windowClassFromBlobFrequency("daily")).toBe("1d");
    expect(windowClassFromBlobFrequency("weekly")).toBe("1w");
  });

  it("rejects an unknown frequency", () => {
    expect(() => windowClassFromBlobFrequency("monthly")).toThrow(
      /Unsupported export frequency/,
    );
  });
});
