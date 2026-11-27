import { describe, expect, it } from "vitest";

import { defaultPickedPlan } from "./defaultPickedPlan";

describe("defaultPickedPlan", () => {
  it("opens on the next plan up", () => {
    expect(defaultPickedPlan("cloud:hobby", null)).toBe("cloud:core");
    expect(defaultPickedPlan("cloud:pro", null)).toBe("cloud:team");
  });

  it("opens on the current plan on the top plan or with a change pending", () => {
    expect(defaultPickedPlan("cloud:enterprise", null)).toBe(
      "cloud:enterprise",
    );
    expect(defaultPickedPlan("cloud:pro", { kind: "cancel" })).toBe(
      "cloud:pro",
    );
  });
});
