/**
 * Lightweight S3 request-failure diagnostics. Logs the structured error fields
 * (requestId, httpStatusCode, error code) and basic request context on any
 * failed S3 request so operators can triage issues with any S3-compatible
 * backend without a second repro.
 */

export interface S3DiagnosticsContext {
  bucketName: string;
  endpoint?: string;
  region?: string;
  forcePathStyle: boolean;
}

export interface S3ErrorSummary {
  name?: string;
  code?: string;
  fault?: string;
  httpStatusCode?: number;
  requestId?: string;
  extendedRequestId?: string;
  message?: string;
  details?: string;
}

/**
 * Extract the structured fields an AWS SDK `ServiceException` carries beyond
 * its message string (`Code`, `$fault`, and the `$metadata` request IDs that
 * let support correlate the failure with the storage provider's own logs).
 */
export function summarizeS3Error(err: unknown): S3ErrorSummary {
  if (!err || typeof err !== "object") {
    return { message: String(err) };
  }
  const e = err as {
    name?: string;
    message?: string;
    Code?: string;
    Details?: string;
    $fault?: string;
    $metadata?: {
      httpStatusCode?: number;
      requestId?: string;
      extendedRequestId?: string;
    };
  };
  return {
    name: e.name,
    code: e.Code,
    fault: e.$fault,
    httpStatusCode: e.$metadata?.httpStatusCode,
    requestId: e.$metadata?.requestId,
    extendedRequestId: e.$metadata?.extendedRequestId,
    message: e.message,
    details: e.Details,
  };
}

/**
 * Error `Code`/`name` values worth a diagnostic log: signing/authorization
 * failures and non-retryable backend-configuration errors. These are the
 * actionable cases where the structured fields (requestId, status, hostname)
 * aid triage — and they are all non-retryable 4xx, so logging them never
 * produces one line per SDK retry.
 *
 * Deliberately excludes expected app-level errors (`NoSuchKey`, `AccessDenied`)
 * and transient/retryable failures (`SlowDown` and other throttling, 5xx,
 * timeouts), which would otherwise flood the logs without telling an operator
 * anything they can act on.
 */
const S3_DIAGNOSABLE_ERROR_CODES = new Set<string>([
  // Signing / authorization canonicalization failures.
  "SignatureDoesNotMatch",
  "InvalidSignatureException",
  "AuthorizationQueryParametersError",
  "AuthorizationHeaderMalformed", // region mismatch in the credential scope
  "RequestTimeTooSkewed", // clock skew, breaks the computed signature
  "InvalidAccessKeyId", // access key id not recognized by the backend
  // Backend-configuration / unsupported-operation errors. e.g. GCS rejects
  // multipart upload on a Rapid storage class with `InvalidArgument`.
  "InvalidArgument",
  "InvalidRequest",
  "NotImplemented",
  "MethodNotAllowed",
]);

/**
 * Whether a summarized error is one the diagnostics middleware should log: a
 * signing/authorization or backend-configuration failure, as opposed to an
 * expected or transient error. See {@link S3_DIAGNOSABLE_ERROR_CODES}.
 */
export function isS3DiagnosableError(error: S3ErrorSummary): boolean {
  return (
    (error.code !== undefined && S3_DIAGNOSABLE_ERROR_CODES.has(error.code)) ||
    (error.name !== undefined && S3_DIAGNOSABLE_ERROR_CODES.has(error.name))
  );
}

interface MaybeHttpRequest {
  method?: string;
  hostname?: string;
}

export interface S3RequestDiagnostics extends S3DiagnosticsContext {
  request: {
    method?: string;
    hostname?: string;
  };
  error: S3ErrorSummary;
}

/**
 * Build the structured payload logged when an S3 request fails. Combines the
 * configured context (region, endpoint, path-style) with the request method/
 * hostname and the structured error.
 *
 * Deliberately omits the request `path` (the S3 object key, which can embed
 * tenant/user identifiers) and the query string (which can carry presigned-URL
 * credentials).
 */
export function buildS3RequestDiagnostics(
  request: unknown,
  err: unknown,
  context: S3DiagnosticsContext,
): S3RequestDiagnostics {
  const req: MaybeHttpRequest =
    request && typeof request === "object" ? (request as MaybeHttpRequest) : {};
  return {
    ...context,
    request: {
      method: req.method,
      hostname: req.hostname,
    },
    error: summarizeS3Error(err),
  };
}
