import { logger } from "../logger";
import { compareVersions, parseVersionString } from "../utils/compareVersions";
import {
  extractBaseIngestionSdkVersion,
  normalizeIngestionSdkName,
  UNKNOWN_INGESTION_SDK_VALUE,
  type IngestionSdkCanonicalName,
} from "../ingestion/ingestionAttribution";

/**
 * Check if HTTP headers from the SDK request indicate the batch is eligible
 * for direct event writes.
 *
 * Requirements:
 * - x-langfuse-sdk-name "python" with x-langfuse-sdk-version >= 4.0.0
 * - x-langfuse-sdk-name "javascript" with x-langfuse-sdk-version >= 5.0.0
 * - x-langfuse-ingestion-version >= 4 (custom OTel exporter opt-in)
 */
export function checkHeaderBasedDirectWrite(params: {
  sdkName?: string;
  sdkVersion?: string;
  ingestionVersion?: string;
}): boolean {
  const { sdkName, sdkVersion, ingestionVersion } = params;

  // Check x-langfuse-ingestion-version.
  // Values > 4 are rejected at the API route, so anything reaching here is valid.
  const parsed = ingestionVersion ? parseInt(ingestionVersion, 10) : NaN;
  if (!isNaN(parsed) && parsed >= 4) {
    return true;
  }

  // Check Langfuse SDK name + version
  if (!sdkName || !sdkVersion) {
    return false;
  }

  try {
    // compareVersions returns null when current >= minimum (no update needed).
    // Strip pre-release/build metadata so that e.g. 4.0.0-rc.1 qualifies as 4.0.0.
    // Also normalize Python PEP440 shorthand (e.g. 4.0.0b1, 4.0.0rc1) to the core version.
    const baseVersion = extractBaseIngestionSdkVersion(sdkVersion);

    if (sdkName === "python") {
      return compareVersions(baseVersion, "v4.0.0") === null;
    }

    if (sdkName === "javascript") {
      return compareVersions(baseVersion, "v5.0.0") === null;
    }
  } catch {
    logger.warn(
      `Failed to parse SDK version from headers: ${sdkName}@${sdkVersion}`,
    );
  }

  return false;
}

/**
 * Whether a batch was exported by a Langfuse SDK rather than a plain OTel
 * pipeline.
 *
 * Either signal is sufficient: the SDKs send `x-langfuse-sdk-name` (normalized
 * to UNKNOWN_INGESTION_SDK_VALUE when absent), and their spans carry a
 * "langfuse"-prefixed instrumentation scope. A third party that sets the
 * header anyway is treated as SDK traffic, which is the conservative direction
 * for write-path routing — it keeps the established write path.
 */
export function isLangfuseSdkTraffic(params: {
  sdkName?: string;
  scopeName?: string | null;
}): boolean {
  const { sdkName, scopeName } = params;

  if (sdkName && sdkName !== UNKNOWN_INGESTION_SDK_VALUE) {
    return true;
  }

  return Boolean(
    scopeName && String(scopeName).toLowerCase().includes("langfuse"),
  );
}

/**
 * Whether any instrumentation scope in the batch identifies a Langfuse SDK.
 *
 * The scope-based version check reads only the first scope (all spans a
 * Langfuse SDK exports share it), but the org-cutoff exclusion must be
 * conservative: a collector-forwarded batch can mix SDK spans with third-party
 * scopes in any order, and one Langfuse scope anywhere is enough to keep the
 * whole batch on its established write path. Scans scope metadata only — no
 * span bodies are touched.
 */
export function batchContainsLangfuseScope(resourceSpans: unknown): boolean {
  // Malformed OTLP shapes reach this code (non-array payloads, non-array
  // scopeSpans and the like); every other resourceSpans consumer guards the
  // same way. Guard per resource so a malformed one reads as scope-less rather
  // than aborting the scan — it must not hide a Langfuse scope on a later
  // resource, nor fail the batch.
  if (!Array.isArray(resourceSpans)) {
    return false;
  }
  return resourceSpans.some(
    (resourceSpan: { scopeSpans?: unknown } | null) =>
      Array.isArray(resourceSpan?.scopeSpans) &&
      resourceSpan.scopeSpans.some(
        (scopeSpan: { scope?: { name?: string | null } | null } | null) =>
          isLangfuseSdkTraffic({ scopeName: scopeSpan?.scope?.name ?? null }),
      ),
  );
}

export type OtelLegacyLangfuseSdkRejection = {
  /** Low-cardinality SDK tag: python, javascript, langfuse, or scope. */
  sdk: string;
  /**
   * Low-cardinality version tag. Parsed majors are the major number; otherwise
   * missing, invalid, or scope_only.
   */
  versionBucket: string;
};

export type OtelLangfuseSdkHeaderDecision =
  | { action: "allow" }
  | { action: "check_scope" }
  | ({ action: "reject" } & OtelLegacyLangfuseSdkRejection);

/**
 * Decide from request headers whether a cutoff organization may ingest this
 * OTel batch.
 *
 * allow: the headers name a current Langfuse SDK (Python >= 4.0.0, JS >= 5.0.0,
 * the same thresholds as direct event writes). Known SDK name aliases are
 * normalized before that check.
 * reject: the headers identify a Langfuse SDK that is older, unversioned, or
 * not a parseable version. `x-langfuse-ingestion-version` does not exempt it.
 * check_scope: the headers do not identify a Langfuse SDK. Plain OpenTelemetry
 * is allowed with or without an ingestion-version header, unless the payload's
 * instrumentation scope names a Langfuse SDK (older SDKs that omit version
 * headers). That scope scan is `legacyLangfuseSdkScopeRejection`.
 */
export function classifyLangfuseOtelSdkFromHeaders(params: {
  sdkName?: string;
  sdkVersion?: string;
}): OtelLangfuseSdkHeaderDecision {
  const identity = langfuseSdkIdentity(params.sdkName);
  if (
    identity.canonical &&
    checkHeaderBasedDirectWrite({
      sdkName: identity.canonical,
      sdkVersion: params.sdkVersion,
    })
  ) {
    return { action: "allow" };
  }

  if (identity.isLangfuse) {
    return {
      action: "reject",
      sdk: identity.canonical ?? "langfuse",
      versionBucket: sdkVersionBucket(params.sdkVersion),
    };
  }

  return { action: "check_scope" };
}

/**
 * Old Langfuse SDKs that omit version headers still stamp a langfuse
 * instrumentation scope. One such scope rejects the batch. A third-party scope
 * does not.
 */
export function legacyLangfuseSdkScopeRejection(
  resourceSpans: unknown,
): OtelLegacyLangfuseSdkRejection | null {
  if (!batchContainsLangfuseScope(resourceSpans)) return null;
  return { sdk: "scope", versionBucket: "scope_only" };
}

function langfuseSdkIdentity(sdkName: string | undefined): {
  canonical: IngestionSdkCanonicalName | null;
  isLangfuse: boolean;
} {
  const trimmed = sdkName?.trim() ?? "";
  if (!trimmed || trimmed === UNKNOWN_INGESTION_SDK_VALUE) {
    return { canonical: null, isLangfuse: false };
  }

  const canonical = normalizeIngestionSdkName(trimmed);
  return {
    canonical,
    isLangfuse:
      canonical !== null || trimmed.toLowerCase().includes("langfuse"),
  };
}

function sdkVersionBucket(sdkVersion: string | undefined): string {
  const version = sdkVersion?.trim();
  if (!version || version === UNKNOWN_INGESTION_SDK_VALUE) return "missing";

  const parsed = parseVersionString(extractBaseIngestionSdkVersion(version));
  if (!parsed) return "invalid";
  return String(parsed.major);
}
