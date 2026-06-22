import { describe, expect, it } from "vitest";
import {
  buildS3RequestDiagnostics,
  classifyContentSha256Mode,
  isS3SigningError,
  summarizeCredentialShape,
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
      path: "/ct-langfuse-test/org-123/user-456/secret-key.txt",
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
    expect(diagnostics.request.hostname).toBe("storage.googleapis.com");
    expect(diagnostics.request.usesAwsChunkedEncoding).toBe(true);
    expect(diagnostics.request.hasChecksumTrailer).toBe(true);
    expect(diagnostics.error.name).toBe("SignatureDoesNotMatch");

    const serialized = JSON.stringify(diagnostics);
    // Never surface credentials or the object key (may embed tenant/user ids).
    expect(serialized).not.toContain("AWS4-HMAC-SHA256");
    expect(serialized).not.toContain("org-123");
    expect(serialized).not.toContain("user-456");
    expect(serialized).not.toContain("secret-key.txt");
  });

  it("tolerates a non-HttpRequest value without throwing", () => {
    const diagnostics = buildS3RequestDiagnostics(undefined, "boom", context);
    expect(diagnostics.request.method).toBeUndefined();
    expect(diagnostics.request.contentSha256Mode).toBe("absent");
    expect(diagnostics.error.message).toBe("boom");
  });
});

describe("summarizeCredentialShape", () => {
  // A representative GCS HMAC secret: 40 chars, base64 alphabet, no whitespace.
  const cleanGcsSecret = "Ab3+/Cd4ef5GH6ij7KL8mn9OP0qr1ST2uv3WX4yz";

  it("reports a clean GCS HMAC credential pair", () => {
    const shape = summarizeCredentialShape(
      "GOOG1EXAMPLEACCESSKEYID",
      cleanGcsSecret,
    );

    expect(shape).toEqual({
      accessKeyIdPresent: true,
      accessKeyIdLength: 23,
      accessKeyIdType: "gcs-hmac",
      secretPresent: true,
      secretLength: 40,
      secretLooksBase64: true,
      secretHasWhitespace: false,
      secretHasSurroundingWhitespace: false,
      secretHasNonAscii: false,
    });
  });

  it("flags a truncated secret (wrong length, the SignatureDoesNotMatch tell)", () => {
    const shape = summarizeCredentialShape(
      "GOOG1EXAMPLE",
      cleanGcsSecret.slice(0, 20),
    );
    expect(shape.secretLength).toBe(20);
    expect(shape.secretPresent).toBe(true);
  });

  it("flags stray surrounding whitespace from a sloppy paste", () => {
    const shape = summarizeCredentialShape(
      "GOOG1EXAMPLE",
      `  ${cleanGcsSecret}\n`,
    );
    expect(shape.secretHasWhitespace).toBe(true);
    expect(shape.secretHasSurroundingWhitespace).toBe(true);
  });

  it("flags a trailing non-breaking space across every relevant signal", () => {
    // U+00A0 (NBSP) is a Unicode space separator: ECMAScript WhiteSpace
    // includes it, so `\s` matches it and `trim()` strips it. A trailing NBSP
    // therefore lights up all three signals — assert each so none regresses.
    const nbsp = String.fromCharCode(0x00a0);
    const shape = summarizeCredentialShape(
      "GOOG1EXAMPLE",
      `${cleanGcsSecret}${nbsp}`,
    );
    expect(shape.secretHasWhitespace).toBe(true);
    expect(shape.secretHasSurroundingWhitespace).toBe(true);
    expect(shape.secretHasNonAscii).toBe(true);
    expect(shape.secretLooksBase64).toBe(false);
  });

  it("flags a non-ascii character that the whitespace checks miss", () => {
    // The reason secretHasNonAscii exists separately: a non-whitespace unicode
    // char (here a “smart” double quote, U+201C) is neither matched by `\s`
    // nor stripped by `trim()`, so only secretHasNonAscii catches it.
    const smartQuote = String.fromCharCode(0x201c);
    const shape = summarizeCredentialShape(
      "GOOG1EXAMPLE",
      `${smartQuote}${cleanGcsSecret}`,
    );
    expect(shape.secretHasNonAscii).toBe(true);
    expect(shape.secretHasWhitespace).toBe(false);
    expect(shape.secretHasSurroundingWhitespace).toBe(false);
    expect(shape.secretLooksBase64).toBe(false);
  });

  it("classifies an AWS-style access key id (wrong-provider paste)", () => {
    const shape = summarizeCredentialShape(
      "AKIAIOSFODNN7EXAMPLE",
      cleanGcsSecret,
    );
    expect(shape.accessKeyIdType).toBe("aws");
  });

  it("handles absent credentials (host/instance-role) without throwing", () => {
    const shape = summarizeCredentialShape(undefined, undefined);
    expect(shape.accessKeyIdPresent).toBe(false);
    expect(shape.accessKeyIdType).toBe("absent");
    expect(shape.secretPresent).toBe(false);
    expect(shape.secretLength).toBe(0);
  });

  it("never embeds the secret value", () => {
    const shape = summarizeCredentialShape("GOOG1EXAMPLE", cleanGcsSecret);
    expect(JSON.stringify(shape)).not.toContain(cleanGcsSecret);
  });
});

describe("isS3SigningError", () => {
  it("matches signing/authorization error codes by name or Code", () => {
    for (const code of [
      "SignatureDoesNotMatch",
      "InvalidSignatureException",
      "AuthorizationQueryParametersError",
      "AuthorizationHeaderMalformed",
      "RequestTimeTooSkewed",
    ]) {
      expect(isS3SigningError({ name: code })).toBe(true);
      expect(isS3SigningError({ code })).toBe(true);
    }
  });

  it("does not match unrelated S3 errors (so they are not logged)", () => {
    expect(isS3SigningError({ name: "NoSuchKey", code: "NoSuchKey" })).toBe(
      false,
    );
    expect(
      isS3SigningError({ name: "AccessDenied", code: "AccessDenied" }),
    ).toBe(false);
    expect(isS3SigningError({ name: "SlowDown", code: "SlowDown" })).toBe(
      false,
    );
    expect(isS3SigningError({})).toBe(false);
  });
});
