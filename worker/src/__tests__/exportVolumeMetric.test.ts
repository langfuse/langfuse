import { describe, it, expect, vi, beforeEach } from "vitest";

const recordIncrement = vi.fn();
vi.mock("@langfuse/shared/src/server", () => ({
  recordIncrement: (...args: unknown[]) => recordIncrement(...args),
}));

import {
  recordExportVolume,
  EXPORT_VOLUME_METRIC,
} from "../services/exportVolumeMetric";

describe("recordExportVolume", () => {
  beforeEach(() => recordIncrement.mockClear());

  it("emits the unified metric with the byte value and omits projectId for API integrations", () => {
    recordExportVolume({
      integration: "mixpanel",
      bytes: 1234,
      projectId: "p1",
    });
    expect(recordIncrement).toHaveBeenCalledWith(EXPORT_VOLUME_METRIC, 1234, {
      integration: "mixpanel",
    });
    expect(recordIncrement.mock.calls[0][2]).not.toHaveProperty("projectId");
  });

  it("includes blob dimensions and omits undefined tags", () => {
    recordExportVolume({
      integration: "blob_storage",
      bytes: 42,
      projectId: "p2",
      destinationType: "S3",
      source: "json-gzip",
      table: "traces",
      path: "standard",
    });
    expect(recordIncrement).toHaveBeenCalledWith(EXPORT_VOLUME_METRIC, 42, {
      integration: "blob_storage",
      projectId: "p2",
      destination_type: "S3",
      source: "json-gzip",
      table: "traces",
      path: "standard",
    });
  });

  it("omits projectId and unprovided tags for posthog", () => {
    recordExportVolume({
      integration: "posthog",
      bytes: 7,
      projectId: "p3",
    });
    const tags = recordIncrement.mock.calls[0][2];
    expect(tags).not.toHaveProperty("projectId");
    expect(tags).not.toHaveProperty("destination_type");
    expect(tags).not.toHaveProperty("source");
    expect(tags).not.toHaveProperty("table");
  });

  it("emits llmaj egress with only the integration tag", () => {
    recordExportVolume({
      integration: "llmaj",
      bytes: 5120,
      projectId: "p4",
    });
    expect(recordIncrement).toHaveBeenCalledWith(EXPORT_VOLUME_METRIC, 5120, {
      integration: "llmaj",
    });
    const tags = recordIncrement.mock.calls[0][2];
    expect(tags).not.toHaveProperty("projectId");
    expect(tags).not.toHaveProperty("destination_type");
    expect(tags).not.toHaveProperty("source");
    expect(tags).not.toHaveProperty("table");
    expect(tags).not.toHaveProperty("path");
  });
});
