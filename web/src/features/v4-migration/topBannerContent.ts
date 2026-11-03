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

const PROJECTS_PLACEHOLDER = "{projects}";

/**
 * renderV4BannerMessage substitutes the optional `{projects}` token with the
 * org-wide count ("1 project" / "3 projects"). Anything else, including HTML,
 * stays literal text.
 */
export function renderV4BannerMessage(
  message: string,
  actionNeededCount: number,
): string {
  if (!message.includes(PROJECTS_PLACEHOLDER)) return message;
  const projects = `${actionNeededCount} ${actionNeededCount === 1 ? "project" : "projects"}`;
  return message.replaceAll(PROJECTS_PLACEHOLDER, projects);
}
