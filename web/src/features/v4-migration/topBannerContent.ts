export type V4MigrationTopBannerSeverity = "warning" | "critical";

/**
 * isV4MigrationTopBannerVisible combines the env-configured server state with
 * what only the client knows. Null-equivalent false hides the banner. Waits
 * for every project check so the count never jumps after the banner appears.
 */
export function isV4MigrationTopBannerVisible(params: {
  severity: "off" | V4MigrationTopBannerSeverity | undefined;
  message: string | null | undefined;
  v4UpgradeUiEnabled: boolean;
  isLangfuseCloud: boolean;
  actionNeededCount: number;
  isChecking: boolean;
}): boolean {
  const {
    severity,
    message,
    v4UpgradeUiEnabled,
    isLangfuseCloud,
    actionNeededCount,
    isChecking,
  } = params;
  return (
    (severity === "warning" || severity === "critical") &&
    Boolean(message?.trim()) &&
    v4UpgradeUiEnabled &&
    isLangfuseCloud &&
    !isChecking &&
    actionNeededCount > 0
  );
}
