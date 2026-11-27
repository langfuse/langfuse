import { describe, expect, it } from "vitest";

import { pricingPlans } from "@/src/ee/features/billing/constants/pricingPlans";

import { planIncludedLines } from "./planIncludedLines";

describe("planIncludedLines", () => {
  it("lists Hobby's own lines", () => {
    expect(planIncludedLines("cloud:hobby")).toEqual(
      pricingPlans["cloud:hobby"].lines,
    );
  });

  it("lists a paid plan's lines first, then the lower plans', with one support line", () => {
    const texts = planIncludedLines("cloud:team").map((line) => line.text);
    expect(texts).toEqual([
      ...pricingPlans["cloud:team"].lines.map((line) => line.text),
      ...pricingPlans["cloud:pro"].lines.map((line) => line.text),
    ]);
    expect(texts.filter((text) => text.includes("support"))).toEqual([]);
  });
});
