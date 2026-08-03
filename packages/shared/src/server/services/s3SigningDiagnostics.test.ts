import { describe, expect, it } from "vitest";
import {
  buildS3RequestDiagnostics,
  isS3DiagnosableError,
  summarizeS3Error,
} from "./s3SigningDiagnostics";

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
      details: undefined,
    });
  });

  it("extracts GCS-specific Details from the XML error body", () => {
    const err = Object.assign(new Error("Invalid argument."), {
      name: "InvalidArgument",
      Code: "InvalidArgument",
      Details: "Multipart upload is not supported in Rapid storage class.",
      $fault: "client",
      $metadata: { httpStatusCode: 400 },
    });

    const summary = summarizeS3Error(err);
    expect(summary.details).toBe(
      "Multipart upload is not supported in Rapid storage class.",
    );
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

  it("combines context, request, and error", () => {
    const request = {
      method: "PUT",
      hostname: "storage.googleapis.com",
      path: "/ct-langfuse-test/org-123/user-456/secret-key.txt",
      headers: {
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
    expect(diagnostics.error.name).toBe("SignatureDoesNotMatch");

    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("AWS4-HMAC-SHA256");
    expect(serialized).not.toContain("org-123");
    expect(serialized).not.toContain("user-456");
    expect(serialized).not.toContain("secret-key.txt");
  });

  it("tolerates a non-HttpRequest value without throwing", () => {
    const diagnostics = buildS3RequestDiagnostics(undefined, "boom", context);
    expect(diagnostics.request.method).toBeUndefined();
    expect(diagnostics.error.message).toBe("boom");
  });
});

describe("isS3DiagnosableError", () => {
  const summarize = (code: string, httpStatusCode?: number) =>
    summarizeS3Error(
      Object.assign(new Error(code), {
        name: code,
        Code: code,
        $metadata: { httpStatusCode },
      }),
    );

  it("logs signing/authorization failures", () => {
    for (const code of [
      "SignatureDoesNotMatch",
      "InvalidSignatureException",
      "AuthorizationHeaderMalformed",
      "RequestTimeTooSkewed",
      "InvalidAccessKeyId",
    ]) {
      expect(isS3DiagnosableError(summarize(code, 403))).toBe(true);
    }
  });

  it("logs backend-configuration errors (e.g. GCS storage-class mismatch)", () => {
    expect(isS3DiagnosableError(summarize("InvalidArgument", 400))).toBe(true);
    expect(isS3DiagnosableError(summarize("NotImplemented", 501))).toBe(true);
  });

  it("skips transient throttling and expected app-level errors", () => {
    for (const code of [
      "SlowDown",
      "ServiceUnavailable",
      "RequestTimeout",
      "NoSuchKey",
      "AccessDenied",
    ]) {
      expect(isS3DiagnosableError(summarize(code))).toBe(false);
    }
  });
});
