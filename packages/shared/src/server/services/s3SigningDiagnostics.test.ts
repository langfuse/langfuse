import { describe, expect, it } from "vitest";
import {
  buildS3RequestDiagnostics,
  classifyContentSha256Mode,
  summarizeS3Error,
  summarizeS3SigningHeaders,
} from "./s3SigningDiagnostics";

describe("classifyContentSha256Mode", () => {
  it("reports a single-chunk signed payload for a hex digest", () => {
    expect(classifyContentSha256Mode("a".repeat(64))).toBe(
      "single-chunk-sha256",
    );
    // mixed case hex is still a valid digest
    expect(classifyContentSha256Mode("ABCDEF" + "0".repeat(58))).toBe(
      "single-chunk-sha256",
    );
  });

  it("passes streaming/trailer modes through verbatim", () => {
    expect(
      classifyContentSha256Mode("STREAMING-UNSIGNED-PAYLOAD-TRAILER"),
    ).toBe("STREAMING-UNSIGNED-PAYLOAD-TRAILER");
    expect(
      classifyContentSha256Mode("STREAMING-AWS4-HMAC-SHA256-PAYLOAD"),
    ).toBe("STREAMING-AWS4-HMAC-SHA256-PAYLOAD");
    expect(classifyContentSha256Mode("UNSIGNED-PAYLOAD")).toBe(
      "UNSIGNED-PAYLOAD",
    );
  });

  it("handles absent and unexpected values without throwing", () => {
    expect(classifyContentSha256Mode(undefined)).toBe("absent");
    expect(classifyContentSha256Mode("")).toBe("absent");
    expect(classifyContentSha256Mode("not-a-hash")).toBe("other");
  });
});

describe("summarizeS3SigningHeaders", () => {
  it("flags the checksum/aws-chunked framing that GCS rejects", () => {
    const summary = summarizeS3SigningHeaders({
      "Content-Encoding": "aws-chunked",
      "x-amz-content-sha256": "STREAMING-UNSIGNED-PAYLOAD-TRAILER",
      "x-amz-trailer": "x-amz-checksum-crc32",
      "x-amz-sdk-checksum-algorithm": "CRC32",
    });

    expect(summary.usesAwsChunkedEncoding).toBe(true);
    expect(summary.hasChecksumTrailer).toBe(true);
    expect(summary.contentSha256Mode).toBe(
      "STREAMING-UNSIGNED-PAYLOAD-TRAILER",
    );
    expect(summary.checksumHeaders).toEqual(["x-amz-sdk-checksum-algorithm"]);
  });

  it("reports a clean single-chunk PUT (the curl-equivalent request)", () => {
    const summary = summarizeS3SigningHeaders({
      "x-amz-content-sha256": "b".repeat(64),
    });

    expect(summary.usesAwsChunkedEncoding).toBe(false);
    expect(summary.hasChecksumTrailer).toBe(false);
    expect(summary.contentSha256Mode).toBe("single-chunk-sha256");
    expect(summary.checksumHeaders).toEqual([]);
    expect(summary.contentEncoding).toBeUndefined();
  });

  it("is case-insensitive on header names and tolerates missing headers", () => {
    expect(summarizeS3SigningHeaders(undefined).contentSha256Mode).toBe(
      "absent",
    );
    const summary = summarizeS3SigningHeaders({
      "X-Amz-Checksum-Crc32": "abc",
      "X-AMZ-TRAILER": "x-amz-checksum-crc32",
    });
    expect(summary.hasChecksumTrailer).toBe(true);
    expect(summary.checksumHeaders).toEqual(["x-amz-checksum-crc32"]);
  });
});

describe("summarizeS3Error", () => {
  it("extracts structured fields from an AWS SDK service exception", () => {
    const err = Object.assign(
      new Error("The request signature we calculated"),
      {
        name: "SignatureDoesNotMatch",
        Code: "SignatureDoesNotMatch",
        $fault: "client",
        $metadata: {
          httpStatusCode: 403,
          requestId: "req-123",
          extendedRequestId: "ext-456",
        },
      },
    );

    expect(summarizeS3Error(err)).toEqual({
      name: "SignatureDoesNotMatch",
      code: "SignatureDoesNotMatch",
      fault: "client",
      httpStatusCode: 403,
      requestId: "req-123",
      extendedRequestId: "ext-456",
      message: "The request signature we calculated",
    });
  });

  it("never throws on non-object errors", () => {
    expect(summarizeS3Error("boom")).toEqual({ message: "boom" });
    expect(summarizeS3Error(undefined)).toEqual({ message: "undefined" });
  });
});

describe("buildS3RequestDiagnostics", () => {
  const context = {
    bucketName: "ct-langfuse-test",
    endpoint: "https://storage.googleapis.com",
    region: "europe-west1",
    forcePathStyle: true,
  };

  it("combines signing context, request framing, and error", () => {
    const request = {
      method: "PUT",
      hostname: "storage.googleapis.com",
      path: "/ct-langfuse-test/langfuse-validation-test.txt",
      headers: {
        "content-encoding": "aws-chunked",
        "x-amz-content-sha256": "STREAMING-UNSIGNED-PAYLOAD-TRAILER",
        "x-amz-trailer": "x-amz-checksum-crc32",
        // Authorization must never be surfaced.
        authorization: "AWS4-HMAC-SHA256 Credential=GOOG.../...",
      },
    };

    const diagnostics = buildS3RequestDiagnostics(
      request,
      Object.assign(new Error("mismatch"), { name: "SignatureDoesNotMatch" }),
      context,
    );

    expect(diagnostics.region).toBe("europe-west1");
    expect(diagnostics.forcePathStyle).toBe(true);
    expect(diagnostics.request.method).toBe("PUT");
    expect(diagnostics.request.usesAwsChunkedEncoding).toBe(true);
    expect(diagnostics.request.hasChecksumTrailer).toBe(true);
    expect(diagnostics.error.name).toBe("SignatureDoesNotMatch");
    expect(JSON.stringify(diagnostics)).not.toContain("AWS4-HMAC-SHA256");
  });

  it("tolerates a non-HttpRequest value without throwing", () => {
    const diagnostics = buildS3RequestDiagnostics(undefined, "boom", context);
    expect(diagnostics.request.method).toBeUndefined();
    expect(diagnostics.request.contentSha256Mode).toBe("absent");
    expect(diagnostics.error.message).toBe("boom");
  });
});
