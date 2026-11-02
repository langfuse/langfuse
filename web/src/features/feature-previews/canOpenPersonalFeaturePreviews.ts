/** Account menu and organization settings share this gate for the personal preview modal. */
export function canOpenPersonalFeaturePreviews({
  isLangfuseCloud,
  v4BetaEnabled,
}: {
  isLangfuseCloud: boolean;
  v4BetaEnabled: boolean;
}): boolean {
  return isLangfuseCloud || v4BetaEnabled;
}
