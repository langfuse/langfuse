/**
 * Classifies a caught blob-export error as a deterministic customer-config /
 * credential fault or as anything else.
 *
 * Motivation: when the export fails because the customer's stored credentials,
 * bucket, or access config are wrong, retrying cannot succeed until the customer
 * changes something. The handler uses a `customer_fault` verdict — once BullMQ
 * has exhausted its retries — to disable the integration, so it stops being
 * re-scheduled and spamming logs/metrics/alerts every cycle.
 *
 * Design (carried from the design discussion):
 * - Allowlist, not blocklist. Only a small set of high-confidence signatures
 *   classify as `customer_fault`; everything else — including unknown/unmatched
 *   errors — falls through to `other`.
 * - Fail safe toward investigation. A false `customer_fault` disables a working
 *   integration; a false `other` just lets it keep retrying. So we match on
 *   stable provider error codes (not message substrings) and bias hard toward
 *   `other` when uncertain.
 *
 * Errors reach the handler wrapped via `new Error(..., { cause: sdkError })`
 * (see StorageService.handleStorageError), so we walk the `cause` chain and
 * inspect each link for the underlying SDK error shape.
 */

export type BlobExportFaultClass = "customer_fault" | "other";

// Stable provider error codes that deterministically point at the customer's
// stored configuration or credentials. AWS SDK v3 sets `.name` (and `.Code`) to
// the S3 error code; Azure's RestError sets `.code`. S3-compatible providers
// (incl. GCS via its S3 interop endpoint) surface the S3 codes below.
const CUSTOMER_FAULT_ERROR_CODES = new Set<string>([
  // AWS S3 / S3-compatible — auth & credentials
  "InvalidAccessKeyId",
  "SignatureDoesNotMatch",
  "AccessDenied",
  "AllAccessDisabled",
  "AccountProblem",
  "AuthorizationHeaderMalformed",
  // AWS S3 / S3-compatible — bucket & path
  "NoSuchBucket",
  "InvalidBucketName",
  // Azure Blob Storage — auth & credentials
  "AuthenticationFailed",
  "AuthorizationFailure",
  "AuthorizationPermissionMismatch",
  "InvalidAuthenticationInfo",
  "AccountIsDisabled",
  "InsufficientAccountPermissions",
  // Azure Blob Storage — container & path
  "ContainerNotFound",
  "InvalidResourceName",
]);

// GCS JSON-API error reasons. Only reachable if a GCS-native client is ever
// wired into the integration; the S3-interop path surfaces the S3 codes above.
// Kept narrow ("forbidden" only) to avoid tripping on object-level notFound.
const CUSTOMER_FAULT_GCS_REASONS = new Set<string>(["forbidden"]);

// Cap the cause-chain walk to guard against cyclic `cause` references.
const MAX_CAUSE_DEPTH = 10;

function* errorCauseChain(error: unknown): Generator<object> {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!current || typeof current !== "object") return;
    yield current;
    current = (current as { cause?: unknown }).cause;
  }
}

// AWS SDK v3 exposes the HTTP status on `$metadata.httpStatusCode`; Azure's
// RestError and node-style errors use `statusCode`; GCS JSON errors use a
// numeric `code`. Returns the first numeric status found.
function extractHttpStatus(err: object): number | undefined {
  const metaStatus = (err as { $metadata?: { httpStatusCode?: unknown } })
    .$metadata?.httpStatusCode;
  if (typeof metaStatus === "number") return metaStatus;

  const statusCode = (err as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === "number") return statusCode;

  const numericCode = (err as { code?: unknown }).code;
  if (typeof numericCode === "number") return numericCode;

  return undefined;
}

function extractErrorCodes(err: object): string[] {
  const candidates = [
    (err as { name?: unknown }).name,
    (err as { Code?: unknown }).Code,
    (err as { code?: unknown }).code, // Azure RestError.code (string)
  ];
  return candidates.filter((c): c is string => typeof c === "string");
}

function extractGcsReasons(err: object): string[] {
  const errors = (err as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors
    .map((e) =>
      e &&
      typeof e === "object" &&
      typeof (e as { reason?: unknown }).reason === "string"
        ? (e as { reason: string }).reason
        : undefined,
    )
    .filter((r): r is string => typeof r === "string");
}

function isCustomerFaultLink(err: object): boolean {
  if (extractErrorCodes(err).some((c) => CUSTOMER_FAULT_ERROR_CODES.has(c))) {
    return true;
  }

  // 401 Unauthorized means the credentials were rejected outright. It is
  // unambiguous and not a transient-infra status, so it trips even without a
  // recognized code. We deliberately do NOT trip on a bare 403/404, because
  // those also cover transient/ambiguous cases (e.g. clock-skew
  // RequestTimeTooSkewed is a 403) — those require a recognized code above.
  if (extractHttpStatus(err) === 401) return true;

  if (extractGcsReasons(err).some((r) => CUSTOMER_FAULT_GCS_REASONS.has(r))) {
    return true;
  }

  return false;
}

export function classifyBlobExportError(error: unknown): BlobExportFaultClass {
  for (const link of errorCauseChain(error)) {
    if (isCustomerFaultLink(link)) return "customer_fault";
  }
  return "other";
}
