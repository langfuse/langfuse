import { describe, expect, it } from "vitest";

import {
  type CloudPlan,
  cloudPlans,
  pricingPlans,
} from "@/src/ee/features/billing/constants/pricingPlans";

import { planLineChanges } from "./planLineChanges";

const texts = (from: CloudPlan, to: CloudPlan) => {
  const changes = planLineChanges(from, to);
  return {
    own: changes.own.map((line) => line.text),
    inherited: changes.inherited.map((line) => line.text),
    inheritedFrom: changes.inheritedFrom,
  };
};

const linesOf = (plan: CloudPlan) =>
  pricingPlans[plan].lines.map((line) => line.text);

describe("planLineChanges", () => {
  it("changes nothing on a move to the same plan", () => {
    expect(texts("cloud:pro", "cloud:pro")).toEqual({
      own: [],
      inherited: [],
      inheritedFrom: [],
    });
  });

  it("says each kind once on every move", () => {
    for (const from of cloudPlans) {
      for (const to of cloudPlans) {
        const changes = planLineChanges(from, to);
        const kinds = [...changes.own, ...changes.inherited].map(
          (line) => line.kind,
        );
        expect(new Set(kinds).size, `${from} to ${to}`).toBe(kinds.length);
      }
    }
  });

  describe("upgrade", () => {
    it("one step up gains that plan's lines", () => {
      expect(texts("cloud:hobby", "cloud:core")).toEqual({
        own: ["In-app support"],
        inherited: [],
        inheritedFrom: [],
      });
    });

    it("leaves a lower plan's support line out when the target has its own", () => {
      expect(texts("cloud:hobby", "cloud:team")).toEqual({
        own: linesOf("cloud:team"),
        inherited: linesOf("cloud:pro"),
        inheritedFrom: ["Pro"],
      });
    });

    it("lists the plans in between from the highest down", () => {
      expect(texts("cloud:core", "cloud:enterprise")).toEqual({
        own: linesOf("cloud:enterprise"),
        inherited: [
          ...linesOf("cloud:team").filter(
            (text) => text !== "Private Slack or MS Teams channel",
          ),
          ...linesOf("cloud:pro"),
        ],
        inheritedFrom: ["Pro + Teams Add-on", "Pro"],
      });
    });

    it("never counts Hobby's line about limits as a gain", () => {
      const gained = planLineChanges("cloud:hobby", "cloud:enterprise");
      expect(
        [...gained.own, ...gained.inherited].map((line) => line.kind),
      ).not.toContain("platform");
    });
  });

  describe("downgrade", () => {
    it("a cancel from Core loses in-app support", () => {
      expect(texts("cloud:core", "cloud:hobby")).toEqual({
        own: ["In-app support"],
        inherited: [],
        inheritedFrom: [],
      });
    });

    it("a cancel from Pro loses Pro's lines, then Core's support", () => {
      expect(texts("cloud:pro", "cloud:hobby")).toEqual({
        own: linesOf("cloud:pro"),
        inherited: ["In-app support"],
        inheritedFrom: ["Core"],
      });
    });

    it("keeps what the target plan still has", () => {
      expect(texts("cloud:pro", "cloud:core")).toEqual({
        own: linesOf("cloud:pro"),
        inherited: [],
        inheritedFrom: [],
      });
      expect(texts("cloud:enterprise", "cloud:core")).toEqual({
        own: linesOf("cloud:enterprise"),
        inherited: [
          ...linesOf("cloud:team").filter(
            (text) => text !== "Private Slack or MS Teams channel",
          ),
          ...linesOf("cloud:pro"),
        ],
        inheritedFrom: ["Pro + Teams Add-on", "Pro"],
      });
    });

    it("one step down loses only the higher plan's lines", () => {
      expect(texts("cloud:team", "cloud:pro")).toEqual({
        own: linesOf("cloud:team"),
        inherited: [],
        inheritedFrom: [],
      });
    });
  });
});
