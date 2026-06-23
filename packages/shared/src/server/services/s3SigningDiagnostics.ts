/**
 * Pure helpers for diagnosing S3 SigV4 `SignatureDoesNotMatch` failures, with a
 * focus on Google Cloud Storage and other non-AWS S3-compatible backends.
 *
 * Recent AWS SDK versions enable data-integrity checksums and `aws-chunked`
 * trailer-based upload framing by default. GCS's S3 interop layer does not
 * verify that framing the way AWS does, so the canonical request it
 * reconstructs differs from what the SDK signed and it returns
 * `SignatureDoesNotMatch` (or `412`). This is invisible from the error message
 * alone: a raw `curl --aws-sigv4` PUT sends a plain single-chunk signed
 * payload and succeeds, while the SDK request silently fails on the same
 * credentials.
 *
 * These helpers summarize the *signing inputs* of the request that failed so
 * the difference shows up in logs. They never log the credential values (no
 * `Authorization` header, no secret) or the payload — only the framing
 * headers, the structured error fields, and a non-reversible *shape* of the
 * credentials (length + character-class flags; see {@link S3CredentialShape}).
 */

/**
 * Non-reversible *shape* of the configured S3 credentials. Surfaced so a
 * `SignatureDoesNotMatch` can be triaged when the operator insists the
 * key/secret are correct and re-pasting them has not helped.
 *
 * `SignatureDoesNotMatch` (vs `InvalidAccessKeyId`/`AccessDenied`) means the
 * backend matched the access key id but the HMAC computed from the secret did
 * not — i.e. the stored secret is not the partner of the stored access key.
 * The usual culprits are a truncated or altered paste (wrong length, stray
 * whitespace, or a stray non-ascii character such as a "smart" quote or
 * zero-width space that survives `trim()`) or a secret from a different/rotated
 * key pair. These fields expose exactly those signals without ever logging the
 * credential value: only the length, whether it matches the base64 alphabet,
 * and whitespace/non-ascii flags. (Note: a non-breaking space is a Unicode
 * space separator, so it is caught by both the whitespace flags and
 * `secretHasNonAscii`; `secretHasNonAscii` earns its keep on non-whitespace
 * characters the others miss.)
 *
 * The access key id is an identifier (sent in plaintext in every signed
 * request's `Authorization` header), not a secret; even so we never log it
 * verbatim — we classify it (`gcs-hmac` for `GOOG…`, `aws` for `AKIA`/`ASIA`)
 * so a key pasted into the wrong provider's field is obvious.
 */
export interface S3CredentialShape {
  accessKeyIdPresent: boolean;
  accessKeyIdLength: number;
  accessKeyIdType: "gcs-hmac" | "aws" | "other" | "absent";
  secretPresent: boolean;
  secretLength: number;
  secretLooksBase64: boolean;
  secretHasWhitespace: boolean;
  secretHasSurroundingWhitespace: boolean;
  secretHasNonAscii: boolean;
}

function classifyAccessKeyIdType(
  id: string,
): Exclude<S3CredentialShape["accessKeyIdType"], "absent"> {
  if (id.startsWith("GOOG")) return "gcs-hmac";
  if (/^A(KIA|SIA)/.test(id)) return "aws";
  return "other";
}

/**
 * Summarize the credential pair without exposing either value. Null-safe so
 * host/instance-role configs (no explicit credentials) report `absent` rather
 * than throwing.
 */
export function summarizeCredentialShape(
  accessKeyId: string | undefined,
  secretAccessKey: string | undefined,
): S3CredentialShape {
  const id = accessKeyId ?? "";
  const secret = secretAccessKey ?? "";
  return {
    accessKeyIdPresent: id.length > 0,
    accessKeyIdLength: id.length,
    accessKeyIdType: id.length === 0 ? "absent" : classifyAccessKeyIdType(id),
    secretPresent: secret.length > 0,
    secretLength: secret.length,
    secretLooksBase64:
      secret.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(secret),
    secretHasWhitespace: /\s/.test(secret),
    secretHasSurroundingWhitespace: secret !== secret.trim(),
    // Anything outside printable ASCII (0x20–0x7E): NBSP, smart quotes, etc.
    secretHasNonAscii: /[^\x20-\x7e]/.test(secret),
  };
}

export interface S3SigningDiagnosticsContext {
  bucketName: string;
  endpoint?: string;
  region?: string;
  forcePathStyle: boolean;
  credentials?: S3CredentialShape;
}

/**
 * Classify the `x-amz-content-sha256` header into a *mode* without exposing the
 * actual content hash. The mode is what matters for signature debugging:
 * a 64-char hex value is a single-chunk signed payload (what a plain PUT or
 * `curl --aws-sigv4` sends), whereas `STREAMING-*` / `UNSIGNED-PAYLOAD`
 * indicate chunked or trailer-based framing that GCS rejects.
 */
export function classifyContentSha256Mode(value: string | undefined): string {
  if (!value) return "absent";
  if (value.startsWith("STREAMING-")) return value;
  if (value === "UNSIGNED-PAYLOAD") return "UNSIGNED-PAYLOAD";
  if (/^[0-9a-f]{64}$/i.test(value)) return "single-chunk-sha256";
  return "other";
}

function lowercaseHeaderKeys(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

export interface S3SigningHeaderSummary {
  contentEncoding?: string;
  contentSha256Mode: string;
  usesAwsChunkedEncoding: boolean;
  hasChecksumTrailer: boolean;
  checksumHeaders: string[];
}

/**
 * Summarize the framing headers that determine whether GCS can verify the
 * SigV4 signature. The presence of `aws-chunked` encoding, an `x-amz-trailer`,
 * or `x-amz-checksum-*` / `x-amz-sdk-checksum-*` headers is the smoking gun for
 * a checksum/streaming mismatch.
 */
export function summarizeS3SigningHeaders(
  headers: Record<string, string> | undefined,
): S3SigningHeaderSummary {
  const lower = lowercaseHeaderKeys(headers ?? {});
  const contentEncoding = lower["content-encoding"];
  return {
    contentEncoding,
    contentSha256Mode: classifyContentSha256Mode(lower["x-amz-content-sha256"]),
    usesAwsChunkedEncoding: (contentEncoding ?? "")
      .toLowerCase()
      .includes("aws-chunked"),
    hasChecksumTrailer: "x-amz-trailer" in lower,
    checksumHeaders: Object.keys(lower)
      .filter(
        (key) =>
          key.startsWith("x-amz-checksum-") ||
          key.startsWith("x-amz-sdk-checksum-"),
      )
      .sort(),
  };
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
 * Error `name`/`Code` values that indicate a signing or request-authorization
 * canonicalization failure — the class of error this diagnostics module exists
 * to debug. Used to gate logging so unrelated failures (`NoSuchKey`,
 * `AccessDenied`, `SlowDown`, network timeouts) don't emit a signing-themed
 * `warn`. These are also non-retryable client (4xx) errors, so gating on them
 * avoids one log line per SDK retry attempt.
 */
const S3_SIGNING_ERROR_CODES = new Set<string>([
  "SignatureDoesNotMatch",
  "InvalidSignatureException",
  "AuthorizationQueryParametersError",
  "AuthorizationHeaderMalformed", // region mismatch in the credential scope
  "RequestTimeTooSkewed", // clock skew, breaks the computed signature
]);

/**
 * Whether a summarized error is a signing/authorization failure worth a
 * signing-themed diagnostic log, as opposed to an unrelated S3 error.
 */
export function isS3SigningError(error: S3ErrorSummary): boolean {
  return (
    (error.name !== undefined && S3_SIGNING_ERROR_CODES.has(error.name)) ||
    (error.code !== undefined && S3_SIGNING_ERROR_CODES.has(error.code))
  );
}

interface MaybeHttpRequest {
  method?: string;
  hostname?: string;
  headers?: Record<string, string>;
}

export interface S3RequestDiagnostics extends S3SigningDiagnosticsContext {
  request: {
    method?: string;
    hostname?: string;
  } & S3SigningHeaderSummary;
  error: S3ErrorSummary;
}

/**
 * Build the structured payload logged when an S3 request fails. Combines the
 * configured signing context (region, endpoint, path-style) with the framing
 * headers of the request that was actually sent and the structured error,
 * tolerating any non-`HttpRequest` shape without throwing.
 *
 * Deliberately omits the request `path` (the S3 object key, which can embed
 * tenant/user identifiers) and the query string (which can carry presigned-URL
 * credentials). `hostname` is kept because it reveals path- vs virtual-hosted
 * addressing without exposing the key.
 */
export function buildS3RequestDiagnostics(
  request: unknown,
  err: unknown,
  context: S3SigningDiagnosticsContext,
): S3RequestDiagnostics {
  const req: MaybeHttpRequest =
    request && typeof request === "object" ? (request as MaybeHttpRequest) : {};
  return {
    ...context,
    request: {
      method: req.method,
      hostname: req.hostname,
      ...summarizeS3SigningHeaders(req.headers),
    },
    error: summarizeS3Error(err),
  };
}
