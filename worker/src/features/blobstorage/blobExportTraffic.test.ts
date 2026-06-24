import { describe, it, expect } from "vitest";
import {
  BlobExportTraffic,
  classifyBlobExportTraffic,
} from "./blobExportTraffic";

describe("classifyBlobExportTraffic", () => {
  it("classifies a custom endpoint as EXTERNAL", () => {
    expect(
      classifyBlobExportTraffic("https://accountid.r2.cloudflarestorage.com"),
    ).toBe(BlobExportTraffic.EXTERNAL);
    expect(classifyBlobExportTraffic("http://minio:9000")).toBe(
      BlobExportTraffic.EXTERNAL,
    );
  });

  it("classifies native AWS S3 (no endpoint) as SAME_CLOUD", () => {
    expect(classifyBlobExportTraffic(null)).toBe(BlobExportTraffic.SAME_CLOUD);
    expect(classifyBlobExportTraffic(undefined)).toBe(
      BlobExportTraffic.SAME_CLOUD,
    );
    expect(classifyBlobExportTraffic("")).toBe(BlobExportTraffic.SAME_CLOUD);
  });
});
