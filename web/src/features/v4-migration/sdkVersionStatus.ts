import { type RouterOutputs } from "@/src/utils/api";
import { type SdkVersionInfo } from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

export type V4MigrationSdkStatus =
  | "checking"
  | "error"
  | "unknown"
  | "unattributed"
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
  missingAttributionCount: number;
};

const isMissingAttribution = (series: V4MigrationSdkUsageSeries): boolean =>
  series.hasOtelEvents && series.attributionStatus !== "attributed";

const sortSdkUsageSeries = (
  rows: V4MigrationSdkUsageSeries[],
): V4MigrationSdkUsageSeries[] =>
  [...rows].sort(
    (left, right) =>
      Number(right.v4MigrationStatus === "upgrade_required") -
        Number(left.v4MigrationStatus === "upgrade_required") ||
      Number(isMissingAttribution(right)) -
        Number(isMissingAttribution(left)) ||
      Number(right.v4MigrationStatus === "unknown") -
        Number(left.v4MigrationStatus === "unknown") ||
      left.lastSeen.localeCompare(right.lastSeen),
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
      missingAttributionCount: 0,
    };
  }

  const sdkUsageSeries = sortSdkUsageSeries(params.summary.sdkUsageSeries);
  const upgradeRequiredCount = sdkUsageSeries.filter(
    (series) =>
      series.v4MigrationStatus === "upgrade_required" &&
      !series.upgradeCompleted,
  ).length;
  const missingAttributionCount =
    sdkUsageSeries.filter(isMissingAttribution).length;
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
        : missingAttributionCount > 0
          ? "unattributed"
          : hasUnknownRecognizedSdk
            ? "unknown"
            : hasCompatibleSdk
              ? "latest"
              : "unknown",
    sdkUsageSeries,
    upgradeRequiredCount,
    missingAttributionCount,
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
