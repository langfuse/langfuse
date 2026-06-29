import { describe, it, expect } from "vitest";
import { isCustomerFaultError } from "./isCustomerFaultError";

// Builds the wrapper the handler actually sees: StorageService.handleStorageError
// rethrows SDK errors as `new Error("Failed to ...", { cause: sdkError })`.
const wrapped = (sdkError: unknown): Error =>
  new Error("Failed to upload file to S3", { cause: sdkError });

// Minimal AWS SDK v3 S3ServiceException shape: `.name`/`.Code` carry the error
// code, `$metadata.httpStatusCode` carries the HTTP status.
const s3Error = (name: string, httpStatusCode: number): Error => {
  const err = new Error(`${name} error`);
  err.name = name;
  Object.assign(err, { Code: name, $metadata: { httpStatusCode } });
  return err;
};

// Minimal Azure @azure/storage-blob RestError shape: `.code` + `.statusCode`.
const azureError = (code: string, statusCode: number): Error => {
  const err = new Error(`${code} error`);
  err.name = "RestError";
  Object.assign(err, { code, statusCode });
  return err;
};

// Minimal GCS JSON-API error shape.
const gcsError = (
  code: number,
  reason: string,
): Error & { code: number; errors: { reason: string }[] } => {
  const err = new Error(`GCS ${reason}`) as Error & {
    code: number;
    errors: { reason: string }[];
  };
  Object.assign(err, { code, errors: [{ reason }] });
  return err;
};

describe("isCustomerFaultError", () => {
  describe("customer_fault — S3 / S3-compatible", () => {
    it.each([
      ["InvalidAccessKeyId", 403],
      ["SignatureDoesNotMatch", 403],
      ["AccessDenied", 403],
      ["AllAccessDisabled", 403],
      ["AccountProblem", 403],
      ["AuthorizationHeaderMalformed", 400],
      ["NoSuchBucket", 404],
      ["InvalidBucketName", 400],
    ])("classifies %s as customer_fault", (code, status) => {
      expect(isCustomerFaultError(wrapped(s3Error(code, status)))).toBe(true);
    });

    it("classifies a raw (unwrapped) S3 error too", () => {
      expect(isCustomerFaultError(s3Error("AccessDenied", 403))).toBe(true);
    });
  });

  describe("customer_fault — Azure", () => {
    it.each([
      ["AuthenticationFailed", 403],
      ["AuthorizationFailure", 403],
      ["AuthorizationPermissionMismatch", 403],
      ["InvalidAuthenticationInfo", 400],
      ["AccountIsDisabled", 403],
      ["InsufficientAccountPermissions", 403],
      ["ContainerNotFound", 404],
      ["InvalidResourceName", 400],
    ])("classifies %s as customer_fault", (code, status) => {
      expect(isCustomerFaultError(wrapped(azureError(code, status)))).toBe(
        true,
      );
    });
  });

  describe("customer_fault — GCS JSON API", () => {
    it("classifies 403 forbidden as customer_fault", () => {
      expect(isCustomerFaultError(wrapped(gcsError(403, "forbidden")))).toBe(
        true,
      );
    });
  });

  describe("customer_fault — bare HTTP status", () => {
    it("classifies a 401 with no recognized code as customer_fault", () => {
      const err = new Error("Unauthorized");
      Object.assign(err, { $metadata: { httpStatusCode: 401 } });
      expect(isCustomerFaultError(wrapped(err))).toBe(true);
    });
  });

  describe("other — transient / infra / unknown (bias toward investigation)", () => {
    it.each(["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ECONNREFUSED", "EPIPE"])(
      "classifies network error %s as other",
      (code) => {
        const err = new Error(`network ${code}`);
        Object.assign(err, { code });
        expect(isCustomerFaultError(wrapped(err))).toBe(false);
      },
    );

    it("classifies a 503 ServiceUnavailable as other", () => {
      expect(
        isCustomerFaultError(wrapped(s3Error("ServiceUnavailable", 503))),
      ).toBe(false);
    });

    it("classifies a 500 InternalError as other", () => {
      expect(isCustomerFaultError(wrapped(s3Error("InternalError", 500)))).toBe(
        false,
      );
    });

    it("classifies S3 SlowDown / throttling as other", () => {
      expect(isCustomerFaultError(wrapped(s3Error("SlowDown", 503)))).toBe(
        false,
      );
    });

    it("classifies a bare 403 with no recognized code as other (e.g. clock skew)", () => {
      expect(
        isCustomerFaultError(wrapped(s3Error("RequestTimeTooSkewed", 403))),
      ).toBe(false);
    });

    it("classifies a RequestTimeout as other", () => {
      expect(
        isCustomerFaultError(wrapped(s3Error("RequestTimeout", 400))),
      ).toBe(false);
    });

    it("classifies a plain application error as other", () => {
      expect(
        isCustomerFaultError(
          new Error("The configured export source includes enriched ..."),
        ),
      ).toBe(false);
    });

    it("classifies a GCS object-level notFound as other", () => {
      expect(isCustomerFaultError(wrapped(gcsError(404, "notFound")))).toBe(
        false,
      );
    });

    it("classifies null/undefined/non-error inputs as other", () => {
      expect(isCustomerFaultError(null)).toBe(false);
      expect(isCustomerFaultError(undefined)).toBe(false);
      expect(isCustomerFaultError("AccessDenied")).toBe(false);
      expect(isCustomerFaultError(403)).toBe(false);
    });
  });

  describe("cause-chain traversal", () => {
    it("finds a customer fault nested several causes deep", () => {
      const root = s3Error("InvalidAccessKeyId", 403);
      const mid = new Error("mid", { cause: root });
      const top = new Error("top", { cause: mid });
      expect(isCustomerFaultError(top)).toBe(true);
    });

    it("does not infinite-loop on a cyclic cause chain", () => {
      const a = new Error("a");
      const b = new Error("b", { cause: a });
      Object.assign(a, { cause: b });
      expect(isCustomerFaultError(a)).toBe(false);
    });
  });
});
