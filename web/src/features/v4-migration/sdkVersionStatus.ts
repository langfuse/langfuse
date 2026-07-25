import { type RouterOutputs } from "@/src/utils/api";
import { type SdkVersionInfo } from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

export type V4MigrationSdkStatus =
  | "checking"
  | "error"
  | "unknown"
  | "legacy"
  | "latest";

type SdkUsageSummary =
  RouterOutputs["v4Transition"]["sdkUsageSummaryByProject"][number];

export type V4MigrationSdkUsageSeries =
  SdkUsageSummary["sdkUsageSeries"][number];

export type V4MigrationSdkState = {
  status: V4MigrationSdkStatus;
  sdkUsageSeries: V4MigrationSdkUsageSeries[];
  upgradeRequiredCount: number;
};

const statusOrder: Record<
  V4MigrationSdkUsageSeries["v4MigrationStatus"],
  number
> = {
  upgrade_required: 0,
  unknown: 1,
  compatible: 2,
};

const sortSdkUsageSeries = (
  rows: V4MigrationSdkUsageSeries[],
): V4MigrationSdkUsageSeries[] =>
  [...rows].sort(
    (left, right) =>
      statusOrder[left.v4MigrationStatus] -
      statusOrder[right.v4MigrationStatus],
  );

export const getV4MigrationSdkState = (params: {
  summary: SdkUsageSummary | undefined;
  isLoading: boolean;
  isError: boolean;
}): V4MigrationSdkState => {
  if (!params.summary) {
    return {
      status: params.isError
        ? "error"
        : params.isLoading
          ? "checking"
          : "unknown",
      sdkUsageSeries: [],
      upgradeRequiredCount: 0,
    };
  }

  const sdkUsageSeries = sortSdkUsageSeries(params.summary.sdkUsageSeries);
  const upgradeRequiredCount = sdkUsageSeries.filter(
    (series) => series.v4MigrationStatus === "upgrade_required",
  ).length;
  const hasUnknownRecognizedSdk = sdkUsageSeries.some(
    (series) =>
      series.canonicalSdkName !== null &&
      series.v4MigrationStatus === "unknown",
  );
  const hasCompatibleSdk = sdkUsageSeries.some(
    (series) => series.v4MigrationStatus === "compatible",
  );

  return {
    status:
      upgradeRequiredCount > 0
        ? "legacy"
        : hasUnknownRecognizedSdk
          ? "unknown"
          : hasCompatibleSdk
            ? "latest"
            : "unknown",
    sdkUsageSeries,
    upgradeRequiredCount,
  };
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
