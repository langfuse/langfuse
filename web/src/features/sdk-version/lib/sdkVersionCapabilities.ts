import { normalizeIngestionSdkName } from "@langfuse/shared";

type SdkMetadata = {
  isOtel: boolean;
  name?: string;
  version?: string;
};

export type SdkVersionInfo = {
  language: string | null;
  version: string | null;
};

const SDK_VERSION_RECHECK_MS = 30 * 86_400_000;

export const sdkVersionStorageKeys = (projectId: string) => ({
  language: `events-sdk-language:${projectId}`,
  version: `events-sdk-version:${projectId}`,
  checkedAt: `events-sdk-checkedAt:${projectId}`,
});

const SDK_VERSION_CAPABILITIES = {
  appRootObservations: {
    javascript: [5, 4, 0],
    python: [4, 7, 0],
  },
} as const;

type SdkVersionCapability = keyof typeof SDK_VERSION_CAPABILITIES;
export type SdkVersionCapabilityStatus =
  | "supported"
  | "unsupported"
  | "unknown";

export const toSdkVersionInfo = (
  sdk: SdkMetadata | undefined,
): SdkVersionInfo | undefined =>
  sdk
    ? {
        language: sdk.isOtel ? normalizeIngestionSdkName(sdk.name) : null,
        version: sdk.isOtel ? (sdk.version?.trim() ?? null) : null,
      }
    : undefined;

export const sdkVersionNeedsRefresh = (
  checkedAt: string | null,
  now: number,
) => {
  const timestamp = Date.parse(checkedAt ?? "");
  return (
    !Number.isFinite(timestamp) || now - timestamp >= SDK_VERSION_RECHECK_MS
  );
};

const parseStableVersion = (version?: string | null) => {
  const match = version
    ?.trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;

  const parsed = match.slice(1, 4).map(Number);
  return parsed.every(Number.isSafeInteger) ? parsed : null;
};

export const getSdkVersionCapabilityStatus = (
  sdk: SdkVersionInfo | undefined,
  capability: SdkVersionCapability,
): SdkVersionCapabilityStatus => {
  if (!sdk) return "unknown";

  const sdkName = normalizeIngestionSdkName(sdk.language);
  const version = parseStableVersion(sdk.version);
  if (!sdkName || !version) return "unknown";

  const minimum = SDK_VERSION_CAPABILITIES[capability][sdkName];
  for (let index = 0; index < version.length; index++) {
    if (version[index] !== minimum[index]) {
      return version[index]! > minimum[index]! ? "supported" : "unsupported";
    }
  }

  return "supported";
};

export const getSdkVersionCapability = (
  sdk: SdkVersionInfo | undefined,
  capability: SdkVersionCapability,
): boolean => getSdkVersionCapabilityStatus(sdk, capability) === "supported";
