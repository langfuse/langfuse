import {
  getSdkVersionCapability,
  type SdkVersionInfo,
} from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

export type V4MigrationSdkStatus =
  | "checking"
  | "error"
  | "unknown"
  | "unattributed"
  | "legacy"
  | "latest";

export const getV4MigrationSdkStatus = (params: {
  sdkVersion: SdkVersionInfo | undefined;
  checkedAt: string | null;
  isRefreshing: boolean;
  querySettled: boolean;
  isError: boolean;
}): V4MigrationSdkStatus => {
  const { sdkVersion } = params;
  if (sdkVersion?.language && sdkVersion.version) {
    // The migration UX and automatic app-root filter share the same boundary:
    // SDKs new enough to emit the current root-observation metadata.
    return getSdkVersionCapability(sdkVersion, "appRootObservations")
      ? "latest"
      : "legacy";
  }

  if (params.isError) return "error";
  if (sdkVersion?.isOtel) return "unattributed";

  return params.isRefreshing && !params.checkedAt && !params.querySettled
    ? "checking"
    : "unknown";
};

export const formatSdkVersion = (sdkVersion: SdkVersionInfo | undefined) => {
  if (!sdkVersion?.language || !sdkVersion.version) return null;

  const language =
    sdkVersion.language === "javascript"
      ? "JavaScript"
      : sdkVersion.language === "python"
        ? "Python"
        : sdkVersion.language;
  return `${language} ${sdkVersion.version}`;
};
