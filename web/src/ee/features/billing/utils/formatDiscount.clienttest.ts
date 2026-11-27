import { formatDiscount } from "@/src/ee/features/billing/utils/formatDiscount";

const discount = {
  code: "STARTUP50",
  name: "Startup program",
  kind: "percent",
  value: 50,
  currency: null,
  duration: "repeating",
  durationInMonths: 12,
} as const;

describe("formatDiscount", () => {
  it("labels a discount by its code and says how long a percentage lasts", () => {
    expect(formatDiscount(discount)).toEqual({
      label: "STARTUP50",
      text: "50% off for 12 months",
    });
  });

  it("falls back to the coupon's name when there is no code", () => {
    expect(formatDiscount({ ...discount, code: null }).label).toBe(
      "Startup program",
    );
  });

  it("formats an amount in its currency and marks a one-off", () => {
    expect(
      formatDiscount({
        ...discount,
        kind: "amount",
        value: 50000,
        currency: "usd",
        duration: "once",
        durationInMonths: null,
      }).text,
    ).toBe("$500.00 off, once");
  });

  it("says nothing about duration for a discount that never ends", () => {
    expect(
      formatDiscount({
        ...discount,
        kind: "amount",
        value: 1000,
        currency: "usd",
        duration: "forever",
        durationInMonths: null,
      }).text,
    ).toBe("$10.00 off");
  });

  it("uses the singular for one month", () => {
    expect(formatDiscount({ ...discount, durationInMonths: 1 }).text).toBe(
      "50% off for 1 month",
    );
  });
});
