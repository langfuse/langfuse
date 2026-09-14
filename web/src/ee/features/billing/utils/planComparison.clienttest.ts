import { describe, expect, it } from "vitest";

import {
  getPlanComparison,
  planTierFromPlan,
  suggestedUpgradeReason,
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

  it("explains why the suggested step is the recommended upgrade", () => {
    expect(suggestedUpgradeReason("hobby")).toBe(
      "More included usage, longer history, and unlimited users.",
    );
  });

  it("derives the Teams add-on price from catalogue list prices", () => {
    expect(teamsAddonPriceLabel()).toBe("+$300/mo");
  });

  it("lists current-plan rows in a shared comparison order", () => {
    const comparison = getPlanComparison({
      currentTier: "hobby",
      targetTier: "hobby",
    });

    expect(comparison.heading).toBe("What you have today");
    expect(comparison.lines.map((line) => line.text)).toEqual([
      "30 days of history",
      "2 users",
      "1,000 ingestion requests/min",
      "2 alerts",
      "1 annotation queue",
      "Community support via GitHub",
    ]);
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
    expect(comparison.lines.map((line) => line.text)).toEqual([
      "90 days of history",
      "Unlimited users",
      "4,000 ingestion requests/min",
      "20 alerts",
      "3 annotation queues",
      "In-app support, 48h response",
    ]);
  });

  it("describes Core gains over Hobby without restating the Hobby baseline", () => {
    const comparison = getPlanComparison({
      currentTier: "hobby",
      targetTier: "core",
    });

    expect(comparison.heading).toBe("What you gain over Hobby");
    expect(comparison.lines.map((line) => line.text)).toEqual([
      "90 days of history",
      "Unlimited users",
      "Additional usage billed beyond included units",
      "4,000 ingestion requests/min",
      "20 alerts",
      "3 annotation queues",
      "In-app support, 48h response",
    ]);
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
        "30 days of history",
        "2 users — 5 of your 7 lose access",
        "Usage capped at included units",
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
    expect(comparison.lines.map((line) => line.text)).toEqual([
      "3 years of history",
      "20,000 ingestion requests/min",
      "50 alerts",
      "Unlimited annotation queues",
      "Prioritized in-app support",
      "Data retention management",
      "SOC2 Type II & ISO27001 reports, HIPAA-ready region",
    ]);
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
      expect.arrayContaining(["Additional usage billed beyond included units"]),
    );
  });

  it("lists Enterprise-only additions over Pro + Teams once each", () => {
    const comparison = getPlanComparison({
      currentTier: "team",
      targetTier: "enterprise",
    });
    const texts = comparison.lines.map((line) => line.text);

    expect(comparison.heading).toBe("What you gain over Pro + Teams");
    expect(texts).toEqual([
      "Negotiated usage on yearly terms",
      "Custom rate limits",
      "100 alerts",
      "Support SLA",
      "Audit logs and SCIM provisioning",
      "Uptime SLA",
      "Named lead support engineer",
    ]);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("does not duplicate Enterprise extras when comparing from Hobby", () => {
    const texts = getPlanComparison({
      currentTier: "hobby",
      targetTier: "enterprise",
    }).lines.map((line) => line.text);

    expect(texts.filter((text) => text === "Custom rate limits")).toHaveLength(
      1,
    );
    expect(
      texts.filter((text) => text === "Named lead support engineer"),
    ).toHaveLength(1);
    expect(texts.filter((text) => text === "Support SLA")).toHaveLength(1);
    expect(new Set(texts).size).toBe(texts.length);
  });
});
