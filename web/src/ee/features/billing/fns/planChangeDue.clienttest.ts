import { describe, expect, it } from "vitest";

import { planChangeDue } from "./planChangeDue";

const period = { pending: null, periodEnd: "Dec 26" } as const;

describe("planChangeDue", () => {
  it("charges the base fee at checkout for a free organization", () => {
    expect(
      planChangeDue("checkout", "cloud:hobby", "cloud:enterprise", {
        pending: null,
        periodEnd: null,
      }),
    ).toEqual([
      { label: "Due today", value: "$2,499, at checkout" },
      { label: "Then", value: "$2,499 / month plus usage" },
    ]);
  });

  it("caps an upgrade's charge at the price difference", () => {
    expect(planChangeDue("upgrade", "cloud:pro", "cloud:team", period)).toEqual(
      [
        { label: "Due today", value: "$300 or less, for the days left" },
        { label: "From Dec 26", value: "$499 / month plus usage" },
      ],
    );
  });

  it("charges nothing today for a downgrade", () => {
    expect(
      planChangeDue("downgrade", "cloud:pro", "cloud:core", period),
    ).toEqual([
      { label: "Due today", value: "Nothing" },
      { label: "From Dec 26", value: "$29 / month plus usage" },
    ]);
  });

  it("shows the current price and renewal on the current plan", () => {
    expect(planChangeDue("none", "cloud:pro", "cloud:pro", period)).toEqual([
      { label: "Price", value: "$199 / month plus usage" },
      { label: "Renews", value: "Dec 26" },
    ]);
    expect(
      planChangeDue("none", "cloud:hobby", "cloud:hobby", {
        pending: null,
        periodEnd: null,
      }),
    ).toEqual([{ label: "Price", value: "Free" }]);
  });

  it("shows what a scheduled cancellation leads to", () => {
    expect(
      planChangeDue("reactivate", "cloud:pro", "cloud:pro", {
        pending: { kind: "cancel" },
        periodEnd: "Dec 26",
      }),
    ).toEqual([
      { label: "Until Dec 26", value: "$199 / month plus usage" },
      { label: "From Dec 26", value: "Hobby, Free" },
    ]);
  });
});
