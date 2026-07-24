import { type RouterOutputs } from "@/src/utils/api";
import { type SdkVersionInfo } from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

export type V4MigrationSdkStatus =
  | "checking"
  | "error"
  | "unknown"
  | "otel_header_required"
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
  delayedOtelIngestionCount: number;
};

const requiresOtelIngestionHeader = (
  series: V4MigrationSdkUsageSeries,
): boolean =>
  series.hasDelayedOtelEvents === true && series.canonicalSdkName === null;

const sortSdkUsageSeries = (
  rows: V4MigrationSdkUsageSeries[],
): V4MigrationSdkUsageSeries[] =>
  [...rows].sort(
    (left, right) =>
      Number(right.v4MigrationStatus === "upgrade_required") -
        Number(left.v4MigrationStatus === "upgrade_required") ||
      Number(requiresOtelIngestionHeader(right)) -
        Number(requiresOtelIngestionHeader(left)) ||
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
      delayedOtelIngestionCount: 0,
    };
  }

  const sdkUsageSeries = sortSdkUsageSeries(params.summary.sdkUsageSeries);
  const upgradeRequiredCount = sdkUsageSeries.filter(
    (series) =>
      series.v4MigrationStatus === "upgrade_required" &&
      !series.upgradeCompleted,
  ).length;
  const delayedOtelIngestionCount = sdkUsageSeries.filter(
    requiresOtelIngestionHeader,
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
        : delayedOtelIngestionCount > 0
          ? "otel_header_required"
          : hasUnknownRecognizedSdk
            ? "unknown"
            : hasCompatibleSdk
              ? "latest"
              : "unknown",
    sdkUsageSeries,
    upgradeRequiredCount,
    delayedOtelIngestionCount,
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
