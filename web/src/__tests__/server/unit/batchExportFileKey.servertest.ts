import { describe, it, expect } from "vitest";

import { parseBatchExportFileKeyFromUrl } from "@/src/features/batch-exports/server/batchExportFileKey";

describe("parseBatchExportFileKeyFromUrl", () => {
  const key = "exports/1753699200000-lf-traces-export-cmproj123.csv";

  it("parses virtual-hosted-style AWS URLs", () => {
    const url = `https://my-bucket.s3.eu-west-1.amazonaws.com/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=86400&X-Amz-Signature=abc`;
    expect(parseBatchExportFileKeyFromUrl(url, "my-bucket")).toBe(key);
  });

  it("parses path-style URLs (MinIO / forcePathStyle)", () => {
    const url = `http://localhost:9090/langfuse/${key}?X-Amz-Signature=abc`;
    expect(parseBatchExportFileKeyFromUrl(url, "langfuse")).toBe(key);
  });

  it("parses GCS-style URLs where the bucket is the first path segment", () => {
    const url = `https://storage.googleapis.com/my-bucket/${key}?X-Goog-Signature=abc`;
    expect(parseBatchExportFileKeyFromUrl(url, "my-bucket")).toBe(key);
  });

  it("parses Azure-style URLs where the container is the first path segment", () => {
    const url = `https://myaccount.blob.core.windows.net/my-container/${key}?sv=2023-01-01&sig=abc`;
    expect(parseBatchExportFileKeyFromUrl(url, "my-container")).toBe(key);
  });

  it("does not strip a path prefix that merely resembles the bucket name", () => {
    const url = `https://langfuse.s3.amazonaws.com/langfuse-exports/file.csv`;
    expect(parseBatchExportFileKeyFromUrl(url, "langfuse")).toBe(
      "langfuse-exports/file.csv",
    );
  });

  it("decodes percent-encoded characters in the key", () => {
    const url = `https://my-bucket.s3.amazonaws.com/exports/123-lf-sessions%20test.csv`;
    expect(parseBatchExportFileKeyFromUrl(url, "my-bucket")).toBe(
      "exports/123-lf-sessions test.csv",
    );
  });

  it("returns null for malformed URLs", () => {
    expect(parseBatchExportFileKeyFromUrl("not a url", "bucket")).toBeNull();
  });

  it("returns null for URLs without a path", () => {
    expect(
      parseBatchExportFileKeyFromUrl(
        "https://my-bucket.s3.amazonaws.com/",
        "my-bucket",
      ),
    ).toBeNull();
  });
});
