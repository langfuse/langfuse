// True when a caught blob-export error is a deterministic customer-config /
// credential fault. The handler uses this (after BullMQ exhausts retries) to
// disable the integration.
//
// Conservative allowlist of stable provider error codes, biased toward false:
// a false positive disables a working integration, a false negative only keeps
// retrying. Errors arrive wrapped via `new Error(..., { cause })`
// (StorageService.handleStorageError), so we walk the cause chain.

// Counter for integrations auto-disabled after a terminal customer fault, tagged
// by `reason`. Lets a rollout regression (a classifier bug mass-disabling
// working integrations) show up as a spike in the non-SSRF buckets against a
// near-zero baseline, separately from expected SSRF/abuse disables.
export const BLOB_INTEGRATION_DISABLED_METRIC =
  "langfuse.blobstorage.integration_disabled.count";

// Coarse cause bucket for a disable, for logs/metrics. `ssrf_blocked_endpoint`
// is the SSRF-guard rejection (endpoint resolves to a blocked host/IP) — the
// "likely abuse" bucket to watch — while the rest are customer misconfiguration.
export type CustomerFaultReason =
  | "ssrf_blocked_endpoint"
  | "invalid_endpoint_url"
  | "credentials"
  | "bucket_or_container";

// AWS SDK v3 sets `.name`/`.Code`; Azure RestError sets `.code`. S3-compatible
// providers (incl. GCS S3-interop) surface the S3 codes.
const CREDENTIAL_FAULT_CODES = new Set<string>([
  // S3 — auth & credentials
  "InvalidAccessKeyId",
  "SignatureDoesNotMatch",
  "AccessDenied",
  "AllAccessDisabled",
  "AccountProblem",
  "AuthorizationHeaderMalformed",
  // Azure — auth & credentials
  "AuthenticationFailed",
  "AuthorizationFailure",
  "AuthorizationPermissionMismatch",
  "InvalidAuthenticationInfo",
  "AccountIsDisabled",
  "InsufficientAccountPermissions",
]);

const BUCKET_FAULT_CODES = new Set<string>([
  // S3 — bucket & path
  "NoSuchBucket",
  "InvalidBucketName",
  // Azure — container & path
  "ContainerNotFound",
  "InvalidResourceName",
]);

// Langfuse outbound-URL / SSRF validation rejections (OutboundUrlValidationError
// from @langfuse/shared/.../outbound-url), split by cause. Every code here is a
// deterministic property of the endpoint config, so it is safe to auto-disable
// on. We deliberately omit `dns-lookup-failed`: resolvability depends on runtime
// resolver state, not the config, so a transient DNS outage across the retry
// window must not permanently disable a working integration. secureLlmFetch
// makes the same distinction (dns-lookup-failed -> "endpoint-unreachable").
const SSRF_BLOCKED_OUTBOUND_URL_CODES = new Set<string>([
  "blocked-hostname",
  "blocked-ip",
]);

const INVALID_URL_OUTBOUND_URL_CODES = new Set<string>([
  "invalid-syntax",
  "invalid-encoding",
  "https-required",
  "protocol-not-allowed",
  "url-credentials-not-allowed",
]);

// GCS JSON-API reasons (only reachable via a GCS-native client; S3-interop uses
// the S3 codes above). Narrow on purpose: object-level notFound stays `other`.
const CUSTOMER_FAULT_GCS_REASONS = new Set<string>(["forbidden"]);

const MAX_CAUSE_DEPTH = 10; // guard against cyclic `cause`

function* errorCauseChain(error: unknown): Generator<object> {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (!current || typeof current !== "object") return;
    yield current;
    current = (current as { cause?: unknown }).cause;
  }
}

// `.code` is overloaded by type: a number is a GCS HTTP status (here), a string
// is an Azure error code (extractErrorCodes). Split the reads if a future
// provider ever reports a numeric `code: 401` that isn't a credential failure.
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
    (err as { code?: unknown }).code,
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

// Duck-type on `.name` (survives cross-package module duplication where
// `instanceof` is unreliable) rather than importing the class, then map the
// deterministic code to a reason; transient reasons like `dns-lookup-failed`
// return undefined so they stay non-disabling.
function classifyOutboundUrlFault(
  err: object,
): CustomerFaultReason | undefined {
  if ((err as { name?: unknown }).name !== "OutboundUrlValidationError") {
    return undefined;
  }
  const code = (err as { code?: unknown }).code;
  if (typeof code !== "string") return undefined;
  if (SSRF_BLOCKED_OUTBOUND_URL_CODES.has(code)) return "ssrf_blocked_endpoint";
  if (INVALID_URL_OUTBOUND_URL_CODES.has(code)) return "invalid_endpoint_url";
  return undefined;
}

function classifyCustomerFaultLink(
  err: object,
): CustomerFaultReason | undefined {
  const outbound = classifyOutboundUrlFault(err);
  if (outbound) return outbound;

  const codes = extractErrorCodes(err);
  if (codes.some((c) => CREDENTIAL_FAULT_CODES.has(c))) return "credentials";
  if (codes.some((c) => BUCKET_FAULT_CODES.has(c)))
    return "bucket_or_container";

  // 401 = credentials rejected: unambiguous, so it trips without a code. A bare
  // 403/404 does not (e.g. clock-skew RequestTimeTooSkewed is a 403).
  if (extractHttpStatus(err) === 401) return "credentials";
  if (extractGcsReasons(err).some((r) => CUSTOMER_FAULT_GCS_REASONS.has(r))) {
    return "credentials";
  }
  return undefined;
}

// Returns the deterministic customer-fault reason for the first matching link in
// the cause chain, or undefined when nothing qualifies (retry-worthy / infra /
// transient). The handler disables on any defined reason and tags the disable
// log + metric with it.
export function classifyCustomerFault(
  error: unknown,
): CustomerFaultReason | undefined {
  for (const link of errorCauseChain(error)) {
    const reason = classifyCustomerFaultLink(link);
    if (reason) return reason;
  }
  return undefined;
}

export function isCustomerFaultError(error: unknown): boolean {
  return classifyCustomerFault(error) !== undefined;
}
