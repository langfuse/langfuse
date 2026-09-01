import type { AuthHeaderValidVerificationResult } from "../auth/types";
import { parseVersionString } from "../utils/compareVersions";

type HeaderValue = string | string[] | undefined;
export type IngestionHeaderMap = Record<string, HeaderValue>;

export type IngestionAttribution = {
  ingestionApiKey: string;
  ingestionSdkName: string;
  ingestionSdkVersion: string;
};

export const UNKNOWN_INGESTION_SDK_VALUE = "unknown";

export const INTERNAL_INGESTION_SDK_NAMES = [
  "langfuse-internal-ai-sdk",
  "langfuse-internal-otel-writer",
  "langfuse-internal-ai-features",
] as const;

export const LANGFUSE_SDK_LATEST_MAJOR = {
  python: 4,
  javascript: 5,
} as const;

export type IngestionSdkCanonicalName = keyof typeof LANGFUSE_SDK_LATEST_MAJOR;

export type IngestionSdkUpgradeStatus =
  | "current"
  | "outdated_major"
  | "unknown"
  | "unsupported_sdk"
  | "invalid_version";

export type IngestionSdkVersionClassification = {
  canonicalSdkName: IngestionSdkCanonicalName | null;
  latestMajor: number | null;
  major: number | null;
  status: IngestionSdkUpgradeStatus;
};

export type IngestionSdkAttributionStatus =
  | "attributed"
  | "missing_name"
  | "missing_version"
  | "missing_name_and_version";

export type PublicApiCallerAttribution = {
  sdkName?: IngestionSdkCanonicalName;
  sdkVersion?: string;
  userAgent?: string;
};

export const PUBLIC_API_SDK_VERSION_MAX_LENGTH = 64;
export const PUBLIC_API_USER_AGENT_MAX_LENGTH = 256;

const getHeaderValue = (
  headers: IngestionHeaderMap | undefined,
  name: string,
): string => {
  if (!headers) return "";

  const directValue = headers[name];
  if (typeof directValue === "string") return directValue;

  const underscoreValue = headers[name.replaceAll("-", "_")];
  if (typeof underscoreValue === "string") return underscoreValue;

  const normalizedName = name.toLowerCase().replaceAll("_", "-");
  const matchedValue = Object.entries(headers).find(
    ([headerName, value]) =>
      typeof value === "string" &&
      headerName.toLowerCase().replaceAll("_", "-") === normalizedName,
  )?.[1];
  if (typeof matchedValue === "string") return matchedValue;

  return "";
};

const normalizeSdkValue = (value: string | undefined): string =>
  value || UNKNOWN_INGESTION_SDK_VALUE;

export const getLangfuseHeaderValue = getHeaderValue;

export const normalizeIngestionSdkName = (
  sdkName: string | null | undefined,
): IngestionSdkCanonicalName | null => {
  const normalized = sdkName?.trim().toLowerCase();

  if (!normalized || normalized === UNKNOWN_INGESTION_SDK_VALUE) {
    return null;
  }

  if (normalized === "python" || normalized === "langfuse-python") {
    return "python";
  }

  if (
    [
      "javascript",
      "js",
      "typescript",
      "ts",
      "langfuse-js",
      "langfuse-ts",
      "@langfuse/client",
      "@langfuse/browser",
      "@langfuse/core",
      "@langfuse/langchain",
      "@langfuse/otel",
      "@langfuse/openai",
      "@langfuse/tracing",
      "@langfuse/vercel-ai-sdk",
    ].includes(normalized)
  ) {
    return "javascript";
  }

  return null;
};

export const extractBaseIngestionSdkVersion = (sdkVersion: string): string => {
  const version = sdkVersion.trim();

  if (/^v?\d+\.\d+\.\d+(?:[-+].+)?$/i.test(version)) {
    return version.split(/[-+]/)[0] ?? version;
  }

  const pep440Match = version.match(/^(v?\d+\.\d+\.\d+)(?:a|b|rc)\d+$/i);
  if (pep440Match?.[1]) {
    return pep440Match[1];
  }

  return version;
};

export const classifyIngestionSdkVersion = (params: {
  sdkName: string | null | undefined;
  sdkVersion: string | null | undefined;
}): IngestionSdkVersionClassification => {
  const sdkName = params.sdkName?.trim();
  const sdkVersion = params.sdkVersion?.trim();

  if (
    !sdkName ||
    !sdkVersion ||
    sdkName === UNKNOWN_INGESTION_SDK_VALUE ||
    sdkVersion === UNKNOWN_INGESTION_SDK_VALUE
  ) {
    return {
      canonicalSdkName: null,
      latestMajor: null,
      major: null,
      status: "unknown",
    };
  }

  const canonicalSdkName = normalizeIngestionSdkName(sdkName);
  if (!canonicalSdkName) {
    return {
      canonicalSdkName: null,
      latestMajor: null,
      major: null,
      status: "unsupported_sdk",
    };
  }

  const parsedVersion = parseVersionString(
    extractBaseIngestionSdkVersion(sdkVersion),
  );
  const latestMajor = LANGFUSE_SDK_LATEST_MAJOR[canonicalSdkName];

  if (!parsedVersion) {
    return {
      canonicalSdkName,
      latestMajor,
      major: null,
      status: "invalid_version",
    };
  }

  return {
    canonicalSdkName,
    latestMajor,
    major: parsedVersion.major,
    status: parsedVersion.major >= latestMajor ? "current" : "outdated_major",
  };
};

export const classifyIngestionSdkAttribution = (params: {
  sdkName: string | null | undefined;
  sdkVersion: string | null | undefined;
}): IngestionSdkAttributionStatus => {
  const sdkName = params.sdkName?.trim();
  const sdkVersion = params.sdkVersion?.trim();
  const missingName = !sdkName || sdkName === UNKNOWN_INGESTION_SDK_VALUE;
  const missingVersion =
    !sdkVersion || sdkVersion === UNKNOWN_INGESTION_SDK_VALUE;

  if (missingName && missingVersion) return "missing_name_and_version";
  if (missingName) return "missing_name";
  if (missingVersion) return "missing_version";
  return "attributed";
};

const METRIC_TAG_MAX_LENGTH = 32;

/**
 * Bounds a caller-supplied SDK value for safe use as a StatsD/Datadog metric
 * tag. Ingestion SDK name/version come straight from request headers, so
 * without this a caller could inject oversized or separator-bearing
 * (`,` `|` `:` `=`) tag values and inflate metric cardinality. Strips control
 * characters and tag separators, caps length, and falls back to "unknown".
 */
export const sanitizeSdkMetricTagValue = (
  value: string | null | undefined,
): string => {
  if (!value) {
    return UNKNOWN_INGESTION_SDK_VALUE;
  }
  const sanitized = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint <= 31 || codePoint === 127) {
        return false;
      }
      return (
        character !== "," &&
        character !== "|" &&
        character !== ":" &&
        character !== "="
      );
    })
    .join("")
    .trim();
  const bounded = Array.from(sanitized)
    .slice(0, METRIC_TAG_MAX_LENGTH)
    .join("");
  return bounded || UNKNOWN_INGESTION_SDK_VALUE;
};

const sanitizeCallerAttributionValue = (
  value: string,
  maxLength: number,
): string | undefined => {
  const sanitized = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join("")
    .trim();
  const bounded = Array.from(sanitized).slice(0, maxLength).join("");
  return bounded || undefined;
};

/**
 * Extracts the bounded, allowlisted caller metadata shared by public API
 * telemetry and ClickHouse query attribution. SDK parsing intentionally
 * reuses the ingestion pipeline's header and version normalization.
 */
export const extractPublicApiCallerAttribution = (
  headers: IngestionHeaderMap | undefined,
): PublicApiCallerAttribution => {
  const sdkName = normalizeIngestionSdkName(
    getHeaderValue(headers, "x-langfuse-sdk-name"),
  );
  const rawSdkVersion = sanitizeCallerAttributionValue(
    getHeaderValue(headers, "x-langfuse-sdk-version"),
    PUBLIC_API_SDK_VERSION_MAX_LENGTH,
  );
  const sdkVersionClassification = classifyIngestionSdkVersion({
    sdkName,
    sdkVersion: rawSdkVersion,
  });
  const sdkVersion =
    sdkVersionClassification.status === "current" ||
    sdkVersionClassification.status === "outdated_major"
      ? rawSdkVersion
      : undefined;
  const userAgent = sanitizeCallerAttributionValue(
    getHeaderValue(headers, "user-agent"),
    PUBLIC_API_USER_AGENT_MAX_LENGTH,
  );

  return {
    ...(sdkName ? { sdkName } : {}),
    ...(sdkVersion ? { sdkVersion } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const createIngestionAttribution = (params: {
  headers?: IngestionHeaderMap;
  authCheck: AuthHeaderValidVerificationResult;
}): IngestionAttribution => {
  const { headers, authCheck } = params;

  return {
    ingestionApiKey: authCheck.scope.publicKey,
    ingestionSdkName: normalizeSdkValue(
      getHeaderValue(headers, "x-langfuse-sdk-name"),
    ),
    ingestionSdkVersion: normalizeSdkValue(
      getHeaderValue(headers, "x-langfuse-sdk-version"),
    ),
  };
};

export const createUnknownSdkIngestionAttribution = (params: {
  authCheck: {
    scope: { publicKey?: string | null; projectId?: string | null };
  };
}): IngestionAttribution => ({
  ingestionApiKey: params.authCheck.scope.publicKey ?? "",
  ingestionSdkName: UNKNOWN_INGESTION_SDK_VALUE,
  ingestionSdkVersion: UNKNOWN_INGESTION_SDK_VALUE,
});
