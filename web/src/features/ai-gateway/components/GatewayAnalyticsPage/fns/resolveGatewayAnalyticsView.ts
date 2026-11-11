export type GatewayAnalyticsView =
  | "notSetUp"
  | "notRecorded"
  | "noKeys"
  | "loading"
  | "dashboard";

/** Inputs are undefined while they load. */
export function resolveGatewayAnalyticsView({
  isIngestionConfigured,
  isRecording,
  isSetupStatusPending,
  isLabelsPending,
  hasGatewayKeys,
  hasUsageHistory,
}: {
  isIngestionConfigured: boolean | undefined;
  isRecording: boolean | undefined;
  isSetupStatusPending: boolean;
  isLabelsPending: boolean;
  hasGatewayKeys: boolean | undefined;
  hasUsageHistory: boolean | undefined;
}): GatewayAnalyticsView {
  if (isIngestionConfigured === false) return "notSetUp";
  if (isRecording === false) return "notRecorded";
  // Deleted keys leave their usage behind, which the dashboard still shows.
  if (isIngestionConfigured && hasGatewayKeys === false) {
    if (hasUsageHistory === undefined) return "loading";
    if (!hasUsageHistory) return "noKeys";
  }
  return isSetupStatusPending || isLabelsPending ? "loading" : "dashboard";
}
