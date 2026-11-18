import { toGatewaySpendLimitUpdate } from "./toGatewaySpendLimitUpdate";

describe("toGatewaySpendLimitUpdate", () => {
  const daily = { interval: "DAILY" as const, limitUsd: 10 };

  it("leaves the key's limits alone unless the budget changed", () => {
    expect(
      toGatewaySpendLimitUpdate({
        loaded: daily,
        hasSeveralSpendLimits: false,
        submitted: { ...daily },
      }),
    ).toBeUndefined();
    expect(
      toGatewaySpendLimitUpdate({
        loaded: null,
        hasSeveralSpendLimits: false,
        submitted: null,
      }),
    ).toBeUndefined();
    expect(
      toGatewaySpendLimitUpdate({
        loaded: daily,
        hasSeveralSpendLimits: false,
        submitted: { ...daily, limitUsd: 20 },
      }),
    ).toEqual({ ...daily, limitUsd: 20 });
    expect(
      toGatewaySpendLimitUpdate({
        loaded: daily,
        hasSeveralSpendLimits: false,
        submitted: null,
      }),
    ).toBeNull();
  });

  it("never replaces the limits of a key with several", () => {
    expect(
      toGatewaySpendLimitUpdate({
        loaded: daily,
        hasSeveralSpendLimits: true,
        submitted: null,
      }),
    ).toBeUndefined();
  });
});
