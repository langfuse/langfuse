import { toGatewaySpendLimitUpdate } from "./toGatewaySpendLimitUpdate";

describe("toGatewaySpendLimitUpdate", () => {
  const daily = {
    interval: "DAILY" as const,
    limitUsd: 10,
    alertThresholds: [100] as number[],
  };

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
        loaded: { ...daily, alertThresholds: [85, 100] },
        hasSeveralSpendLimits: false,
        submitted: { ...daily, alertThresholds: [100, 85] },
      }),
    ).toBeUndefined();
    expect(
      toGatewaySpendLimitUpdate({
        loaded: daily,
        hasSeveralSpendLimits: false,
        submitted: { ...daily, alertThresholds: [85, 100] },
      }),
    ).toEqual({ ...daily, alertThresholds: [85, 100] });
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
