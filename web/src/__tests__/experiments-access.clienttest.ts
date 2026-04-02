import { getExperimentsAccess } from "@/src/features/experiments/utils/experimentsAccess";

describe("getExperimentsAccess", () => {
  it("returns enabled only when cloud, v4 beta, and admin/flag gate all pass", () => {
    const enabledViaAdmin = getExperimentsAccess({
      isLangfuseCloud: true,
      isV4BetaEnabled: true,
      isAdmin: true,
      isFeatureEnabledOnUser: false,
    });

    const enabledViaFlag = getExperimentsAccess({
      isLangfuseCloud: true,
      isV4BetaEnabled: true,
      isAdmin: false,
      isFeatureEnabledOnUser: true,
    });

    expect(enabledViaAdmin.isEnabled).toBe(true);
    expect(enabledViaFlag.isEnabled).toBe(true);
  });

  it("returns disabled when v4 beta is off even for eligible users", () => {
    const access = getExperimentsAccess({
      isLangfuseCloud: true,
      isV4BetaEnabled: false,
      isAdmin: true,
      isFeatureEnabledOnUser: true,
    });

    expect(access.isEnabled).toBe(false);
  });

  it("returns disabled when user is neither admin nor flagged", () => {
    const access = getExperimentsAccess({
      isLangfuseCloud: true,
      isV4BetaEnabled: true,
      isAdmin: false,
      isFeatureEnabledOnUser: false,
    });

    expect(access.isEnabled).toBe(false);
  });
});
