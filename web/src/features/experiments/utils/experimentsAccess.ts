export type ExperimentsAccessInput = {
  isLangfuseCloud: boolean;
  isV4BetaEnabled: boolean;
};

export function getExperimentsAccess({
  isLangfuseCloud,
  isV4BetaEnabled,
}: ExperimentsAccessInput) {
  return {
    isEnabled: isLangfuseCloud && isV4BetaEnabled,
  };
}
