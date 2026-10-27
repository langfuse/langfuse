/* eslint-disable no-nested-ternary */
import { type RouterOutputs } from "@/src/utils/api";
import { type SdkVersionInfo } from "@/src/features/sdk-version";
import { LANGFUSE_SDK_LATEST_MAJOR } from "@langfuse/shared";

type V4MigrationSdkStatus =
  | "checking"
  | "error"
  | "no_data"
  | "unknown"
  | "otel_realtime"
  | "otel_header_required"
  | "legacy"
  | "latest";

type SdkUsageSummary = RouterOutputs["v4Transition"]["sdkUsageSummary"];

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
  series.remediationType === "update_otel_instrumentation" &&
  series.actionLevel === "required";

// SQL owns remediation classification; the client only groups rows for display.
const isCustomInstrumentationSeries = (
  series: V4MigrationSdkUsageSeries,
): boolean => series.remediationType === "upgrade_instrumentation";

const sortSdkUsageSeries = (
  rows: V4MigrationSdkUsageSeries[],
): V4MigrationSdkUsageSeries[] =>
  [...rows].sort((left, right) => right.lastSeen.localeCompare(left.lastSeen));

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
      series.remediationType === "update_sdk" &&
      series.actionLevel === "required",
  ).length;
  const delayedOtelIngestionCount = sdkUsageSeries.filter(
    requiresOtelIngestionHeader,
  ).length;
  const hasUnknownRecognizedSdk = sdkUsageSeries.some(
    (series) =>
      series.remediationType === "update_sdk" &&
      series.v4MigrationStatus === "unknown",
  );
  const hasCompatibleSdk = sdkUsageSeries.some(
    (series) =>
      series.remediationType === "update_sdk" && series.actionLevel === "none",
  );
  const hasRealtimeOtelIngestion = sdkUsageSeries.some(
    (series) =>
      series.remediationType === "update_otel_instrumentation" &&
      series.actionLevel === "none",
  );
  // Custom-instrumentation traffic is always an action item in the panel, so
  // the combined status must not report the project as fully migrated while
  // the Upgrade Instrumentation section is telling the user to act.
  const hasCustomInstrumentation = sdkUsageSeries.some(
    isCustomInstrumentationSeries,
  );

  return {
    status:
      sdkUsageSeries.length === 0
        ? "no_data"
        : upgradeRequiredCount > 0
          ? "legacy"
          : delayedOtelIngestionCount > 0
            ? "otel_header_required"
            : hasUnknownRecognizedSdk || hasCustomInstrumentation
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

// Recognized Langfuse SDK traffic stays in the SDK bucket even when it uses
// OTLP; raw/third-party OTel is classified separately by SQL.
const isOtelExporterSeries = (series: V4MigrationSdkUsageSeries): boolean =>
  series.remediationType === "update_otel_instrumentation";

// Action sections contain only SQL-classified required rows. Successful rows
// are shown separately in the detected-instrumentation section.

export const isActionableSdkSeries = (
  series: V4MigrationSdkUsageSeries,
): boolean =>
  series.remediationType === "update_sdk" && series.actionLevel === "required";

export type V4MigrationSdkSectionState = {
  /** "latest" and "no_data" mean no relevant rows; the section hides itself.
   * Unrecognized SDKs are not mixed in here: they belong to the custom
   * instrumentation section. */
  status: "checking" | "error" | "legacy" | "latest" | "no_data";
  /** Recognized-SDK series requiring action, most recently seen first. */
  series: V4MigrationSdkUsageSeries[];
  /** Series needing action: pending upgrades plus unrecognized versions.
   * Drives both the section badge and the body copy so they always agree. */
  actionableCount: number;
};

export const getSdkSectionState = (
  sdk: V4MigrationSdkState,
): V4MigrationSdkSectionState => {
  const series = sdk.sdkUsageSeries.filter(
    (usage) =>
      usage.remediationType === "update_sdk" &&
      usage.actionLevel === "required",
  );
  const actionableCount = series.filter(isActionableSdkSeries).length;

  return {
    status:
      sdk.status === "checking" || sdk.status === "error"
        ? sdk.status
        : series.length === 0
          ? "no_data"
          : actionableCount > 0
            ? "legacy"
            : "latest",
    series,
    actionableCount,
  };
};

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
  /** Delayed OTel exporter series requiring action, most recently seen first. */
  series: V4MigrationSdkUsageSeries[];
  delayedCount: number;
};

export const getOtelSectionState = (
  sdk: V4MigrationSdkState,
): V4MigrationOtelSectionState => {
  const series = sdk.sdkUsageSeries.filter(
    (usage) => isOtelExporterSeries(usage) && usage.actionLevel === "required",
  );
  return {
    series,
    delayedCount: series.filter((usage) => usage.actionLevel === "required")
      .length,
  };
};

export const getDetectedInstrumentationSeries = (
  sdk: V4MigrationSdkState,
): V4MigrationSdkUsageSeries[] =>
  sdk.sdkUsageSeries.filter((usage) => usage.actionLevel === "none");

export const formatSdkVersion = (sdkVersion: SdkVersionInfo | undefined) => {
  if (!sdkVersion?.language || !sdkVersion.version) return null;

  const language = (() => {
    if (sdkVersion.language === "javascript") {
      return "JavaScript";
    }
    if (sdkVersion.language === "python") {
      return "Python";
    }
    return sdkVersion.language;
  })();
  return `${language} ${sdkVersion.version}`;
};

const SDK_MAJOR_UPGRADE_GUIDE_URLS = {
  python:
    "https://langfuse.com/docs/observability/sdk/upgrade-path/python-v4-to-v5",
  javascript:
    "https://langfuse.com/docs/observability/sdk/upgrade-path/js-v5-to-v6",
} as const satisfies Record<keyof typeof LANGFUSE_SDK_LATEST_MAJOR, string>;

/** A newer SDK major for V4-compatible traffic still on the previous major. */
export const getAvailableSdkMajorUpgrade = (
  series: V4MigrationSdkUsageSeries,
): { label: string; upgradeGuideUrl: string } | null => {
  if (
    series.remediationType !== "update_sdk" ||
    !series.canonicalSdkName ||
    series.sdkVersionMajor === null
  ) {
    return null;
  }
  const latestMajor = LANGFUSE_SDK_LATEST_MAJOR[series.canonicalSdkName];
  if (series.sdkVersionMajor >= latestMajor) return null;
  return {
    label: `${series.canonicalSdkName === "python" ? "Python" : "JS"} SDK v${latestMajor}`,
    upgradeGuideUrl: SDK_MAJOR_UPGRADE_GUIDE_URLS[series.canonicalSdkName],
  };
};

/** `latestSdkMajor` is the minimum V4-compatible major from the SQL check. */
export const formatSdkUpgradeRequirement = (
  series: Pick<
    V4MigrationSdkUsageSeries,
    "canonicalSdkName" | "latestSdkMajor"
  >,
) => {
  if (!series.latestSdkMajor) return "upgrade required";
  if (!series.canonicalSdkName) {
    return `upgrade required to >= ${series.latestSdkMajor}.0.0`;
  }
  return `upgrade required to v${LANGFUSE_SDK_LATEST_MAJOR[series.canonicalSdkName]} (>= ${series.latestSdkMajor}.0.0 also works)`;
};
