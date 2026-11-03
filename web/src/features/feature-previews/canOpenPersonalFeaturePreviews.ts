/** Account menu and organization settings share this gate for the personal preview modal. */
export function canOpenPersonalFeaturePreviews({
  isLangfuseCloud,
  v4BetaEnabled,
  isAdmin,
}: {
  isLangfuseCloud: boolean;
  v4BetaEnabled: boolean;
  isAdmin: boolean;
}): boolean {
  return isLangfuseCloud || v4BetaEnabled || isAdmin;
}
