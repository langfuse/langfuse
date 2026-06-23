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
  };
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
