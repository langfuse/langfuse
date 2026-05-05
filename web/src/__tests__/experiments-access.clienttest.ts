import { getExperimentsAccess } from "@/src/features/experiments/utils/experimentsAccess";

describe("getExperimentsAccess", () => {
  it("returns enabled when cloud and v4 beta are both enabled", () => {
    const access = getExperimentsAccess({
      isLangfuseCloud: true,
      isV4BetaEnabled: true,
    });

    expect(access.isEnabled).toBe(true);
  });

  it("returns disabled when not on cloud", () => {
    const access = getExperimentsAccess({
      isLangfuseCloud: false,
      isV4BetaEnabled: true,
    });

    expect(access.isEnabled).toBe(false);
  });

  it("returns disabled when v4 beta is off", () => {
    const access = getExperimentsAccess({
      isLangfuseCloud: true,
      isV4BetaEnabled: false,
    });

    expect(access.isEnabled).toBe(false);
  });

  it("returns disabled when both cloud and v4 beta are off", () => {
    const access = getExperimentsAccess({
      isLangfuseCloud: false,
      isV4BetaEnabled: false,
    });

    expect(access.isEnabled).toBe(false);
  });
});
