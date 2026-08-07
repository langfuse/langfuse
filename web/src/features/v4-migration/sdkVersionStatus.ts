import { type RouterOutputs } from "@/src/utils/api";
import {
  getSdkVersionCapabilityMinimum,
  type SdkVersionInfo,
} from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

export type V4MigrationSdkStatus =
  | "checking"
  | "error"
  | "no_data"
  | "unknown"
  | "otel_realtime"
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
  const hasRealtimeOtelIngestion = sdkUsageSeries.some(
    (series) =>
      series.canonicalSdkName === null && series.hasDelayedOtelEvents === false,
  );

  return {
    status:
      sdkUsageSeries.length === 0
        ? "no_data"
        : upgradeRequiredCount > 0
          ? "legacy"
          : delayedOtelIngestionCount > 0
            ? "otel_header_required"
            : hasUnknownRecognizedSdk
              ? "unknown"
              : hasCompatibleSdk
                ? "latest"
                : hasRealtimeOtelIngestion
                  ? "otel_realtime"
                  : "unknown",
    sdkUsageSeries,
    upgradeRequiredCount,
    delayedOtelIngestionCount,
  };
};

// A series is an OTel exporter when it has no recognized Langfuse SDK name but
// arrived through OTel ingestion (hasDelayedOtelEvents is null for non-OTel
// series). Recognized SDKs that ship via OTLP manage their own headers, so
// they stay in the SDK bucket.
export const isOtelExporterSeries = (
  series: V4MigrationSdkUsageSeries,
): boolean =>
  series.canonicalSdkName === null && series.hasDelayedOtelEvents !== null;

// Both section states below implement the offender rule: a section renders
// only while it contains at least one series needing action, but a rendered
// section lists every series detected on its ingestion path.

export type V4MigrationSdkSectionState = {
  /** "latest" and "no_data" mean no offenders; the section hides itself.
   * Unrecognized SDKs are not mixed in here: they belong to the custom
   * instrumentation section. */
  status: "checking" | "error" | "legacy" | "latest" | "no_data";
  /** All detected recognized-SDK series, offenders sorted first. */
  series: V4MigrationSdkUsageSeries[];
  upgradeRequiredCount: number;
};

export const getSdkSectionState = (
  sdk: V4MigrationSdkState,
): V4MigrationSdkSectionState => {
  const series = sdk.sdkUsageSeries.filter(
    (usage) => usage.canonicalSdkName !== null,
  );

  return {
    status:
      sdk.status === "checking" || sdk.status === "error"
        ? sdk.status
        : series.length === 0
          ? "no_data"
          : sdk.upgradeRequiredCount > 0
            ? "legacy"
            : "latest",
    series,
    upgradeRequiredCount: sdk.upgradeRequiredCount,
  };
};

// Ingestion-API series without a recognized Langfuse SDK: custom
// instrumentation against POST /api/public/ingestion, an unrecognized SDK
// name, or an SDK too old to send attribution headers. (hasDelayedOtelEvents
// is null for non-OTel ingestion.)
export const isCustomInstrumentationSeries = (
  series: V4MigrationSdkUsageSeries,
): boolean =>
  series.hasDelayedOtelEvents === null && series.canonicalSdkName === null;

export type V4MigrationCustomInstrumentationSectionState = {
  /** Every series here is an offender; the section hides when empty. */
  series: V4MigrationSdkUsageSeries[];
};

export const getCustomInstrumentationSectionState = (
  sdk: V4MigrationSdkState,
): V4MigrationCustomInstrumentationSectionState => ({
  series: sdk.sdkUsageSeries.filter(isCustomInstrumentationSeries),
});

export type V4MigrationOtelSectionState = {
  /** All detected OTel exporter series, delayed ones sorted first. */
  series: V4MigrationSdkUsageSeries[];
  delayedCount: number;
};

export const getOtelSectionState = (
  sdk: V4MigrationSdkState,
): V4MigrationOtelSectionState => {
  const series = sdk.sdkUsageSeries.filter(isOtelExporterSeries);
  return {
    series,
    delayedCount: series.filter((usage) => usage.hasDelayedOtelEvents === true)
      .length,
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

export const formatSdkUpgradeRequirement = (
  sdkName: V4MigrationSdkUsageSeries["canonicalSdkName"],
) => {
  const minimumVersion = getSdkVersionCapabilityMinimum(
    sdkName,
    "appRootObservations",
  );

  return minimumVersion
    ? `upgrade required to >= ${minimumVersion}`
    : "upgrade required";
};
