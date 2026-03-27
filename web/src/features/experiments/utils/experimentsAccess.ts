export type ExperimentsAccessInput = {
  isLangfuseCloud: boolean;
  isV4BetaEnabled: boolean;
  isAdmin: boolean;
  isFeatureEnabledOnUser: boolean;
};

export function getExperimentsAccess({
  isLangfuseCloud,
  isV4BetaEnabled,
  isAdmin,
  isFeatureEnabledOnUser,
}: ExperimentsAccessInput) {
  const hasRoleAccess = isAdmin || isFeatureEnabledOnUser;

  return {
    hasRoleAccess,
    isEnabled: isLangfuseCloud && isV4BetaEnabled && hasRoleAccess,
  };
}
