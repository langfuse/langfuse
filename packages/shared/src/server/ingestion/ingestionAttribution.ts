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

const getHeaderValue = (
  headers: IngestionHeaderMap | undefined,
  name: string,
): string => {
  if (!headers) return "";

  const directValue = headers[name];
  if (typeof directValue === "string") return directValue;

  const underscoreValue = headers[name.replaceAll("-", "_")];
  if (typeof underscoreValue === "string") return underscoreValue;

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
