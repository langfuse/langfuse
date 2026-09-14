import { describe, expect, it } from "vitest";

import {
  getPlanComparison,
  planTierFromPlan,
  suggestedUpgradeTier,
  teamsAddonPriceLabel,
} from "./planComparison";

describe("planComparison", () => {
  it("maps cloud plans onto comparison tiers", () => {
    expect(planTierFromPlan("cloud:hobby")).toBe("hobby");
    expect(planTierFromPlan("cloud:core")).toBe("core");
    expect(planTierFromPlan("cloud:pro")).toBe("pro");
    expect(planTierFromPlan("cloud:team")).toBe("team");
    expect(planTierFromPlan("cloud:enterprise")).toBe("enterprise");
    expect(planTierFromPlan(undefined)).toBe("hobby");
  });

  it("suggests the next paid step, not a same-tier add-on", () => {
    expect(suggestedUpgradeTier("hobby")).toBe("core");
    expect(suggestedUpgradeTier("core")).toBe("pro");
    expect(suggestedUpgradeTier("pro")).toBe("enterprise");
    expect(suggestedUpgradeTier("team")).toBe("enterprise");
    expect(suggestedUpgradeTier("enterprise")).toBeNull();
  });

  it("derives the Teams add-on price from catalogue list prices", () => {
    expect(teamsAddonPriceLabel()).toBe("+$300 / month");
  });

  it("lists current Core capabilities without gain or loss markers", () => {
    const comparison = getPlanComparison({
      currentTier: "core",
      targetTier: "core",
    });

    expect(comparison.heading).toBe("What you have today");
    expect(comparison.lines.every((line) => line.polarity === "neutral")).toBe(
      true,
    );
    expect(comparison.lines.map((line) => line.text)).toEqual(
      expect.arrayContaining([
        "90 days of history",
        "Unlimited users",
        "In-app support, 48h response",
      ]),
    );
  });

  it("describes Hobby losses from Core, including seats that would be removed", () => {
    const comparison = getPlanComparison({
      currentTier: "core",
      targetTier: "hobby",
      memberCount: 7,
    });

    expect(comparison.heading).toBe("What you lose from Core");
    expect(comparison.lines.map((line) => line.polarity)).toEqual(
      expect.arrayContaining(["minus"]),
    );
    expect(comparison.lines.map((line) => line.text)).toEqual(
      expect.arrayContaining([
        "History drops to 30 days, from 90",
        "2 users — 5 of your 7 lose access",
        "Ingestion stops at 50,000 units instead of being billed",
        "No in-app support",
      ]),
    );
  });

  it("describes Pro gains over Core from public plan limits", () => {
    const comparison = getPlanComparison({
      currentTier: "core",
      targetTier: "pro",
    });

    expect(comparison.heading).toBe("What you gain over Core");
    expect(comparison.lines.every((line) => line.polarity === "plus")).toBe(
      true,
    );
    expect(comparison.lines.map((line) => line.text)).toEqual(
      expect.arrayContaining([
        "3 years of history, up from 90 days",
        "Unlimited annotation queues",
        "Data retention management",
        "SOC2 Type II & ISO27001 reports, HIPAA-ready region",
        "Prioritized in-app support",
      ]),
    );
  });

  it("adds Teams-only controls when comparing Core to Pro + Teams", () => {
    const comparison = getPlanComparison({
      currentTier: "core",
      targetTier: "team",
    });

    expect(comparison.lines.map((line) => line.text)).toEqual(
      expect.arrayContaining([
        "Enterprise SSO and fine-grained RBAC",
        "Private Slack channel, 24h response",
      ]),
    );
  });

  it("describes leaving negotiated Enterprise usage when moving to Core", () => {
    const comparison = getPlanComparison({
      currentTier: "enterprise",
      targetTier: "core",
    });

    expect(comparison.lines.map((line) => line.text)).toEqual(
      expect.arrayContaining([
        "100,000 units included, then $8 / 100k, lower with increasing usage",
      ]),
    );
  });

  it("lists Enterprise-only additions over Pro + Teams", () => {
    const comparison = getPlanComparison({
      currentTier: "team",
      targetTier: "enterprise",
    });

    expect(comparison.heading).toBe("What you gain over Pro + Teams");
    expect(comparison.lines.map((line) => line.text)).toEqual(
      expect.arrayContaining([
        "Audit logs and SCIM provisioning",
        "Custom rate limits",
        "Uptime SLA and support SLA",
        "Named lead support engineer",
      ]),
    );
  });
});
