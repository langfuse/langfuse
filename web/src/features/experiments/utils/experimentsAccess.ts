export type ExperimentsAccessInput = {
  isLangfuseCloud: boolean;
  isV4Enabled: boolean;
  isAdmin: boolean;
  isFeatureEnabledOnUser: boolean;
};

export function getExperimentsAccess({
  isLangfuseCloud,
  isV4Enabled,
  isAdmin,
  isFeatureEnabledOnUser,
}: ExperimentsAccessInput) {
  const hasRoleAccess = isAdmin || isFeatureEnabledOnUser;

  return {
    hasRoleAccess,
    isEnabled: isLangfuseCloud && isV4Enabled && hasRoleAccess,
  };
}
