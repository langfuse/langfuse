import { describe, it, expect } from "vitest";
import {
  BlobExportTraffic,
  classifyBlobExportTraffic,
} from "./blobExportTraffic";

describe("classifyBlobExportTraffic", () => {
  it("classifies a custom endpoint as EXTERNAL regardless of region", () => {
    expect(
      classifyBlobExportTraffic(
        "https://accountid.r2.cloudflarestorage.com",
        "auto",
        "us-east-1",
      ),
    ).toBe(BlobExportTraffic.EXTERNAL);
    // Endpoint wins even when regions would otherwise match.
    expect(
      classifyBlobExportTraffic("http://minio:9000", "us-east-1", "us-east-1"),
    ).toBe(BlobExportTraffic.EXTERNAL);
  });

  it("classifies matching S3 regions as SAME_REGION (case-insensitive)", () => {
    expect(classifyBlobExportTraffic(null, "us-east-1", "us-east-1")).toBe(
      BlobExportTraffic.SAME_REGION,
    );
    expect(classifyBlobExportTraffic(null, "US-EAST-1", "us-east-1")).toBe(
      BlobExportTraffic.SAME_REGION,
    );
  });

  it("classifies differing S3 regions as CROSS_REGION", () => {
    expect(classifyBlobExportTraffic(null, "eu-west-1", "us-east-1")).toBe(
      BlobExportTraffic.CROSS_REGION,
    );
  });

  it("returns UNKNOWN when the worker region is not configured", () => {
    expect(classifyBlobExportTraffic(null, "us-east-1", undefined)).toBe(
      BlobExportTraffic.UNKNOWN,
    );
  });

  it("returns UNKNOWN when the destination region is unset or 'auto'", () => {
    expect(classifyBlobExportTraffic(null, "auto", "us-east-1")).toBe(
      BlobExportTraffic.UNKNOWN,
    );
    expect(classifyBlobExportTraffic(null, null, "us-east-1")).toBe(
      BlobExportTraffic.UNKNOWN,
    );
    expect(classifyBlobExportTraffic(null, "", "us-east-1")).toBe(
      BlobExportTraffic.UNKNOWN,
    );
  });
});
