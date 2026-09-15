import { describe, expect, it } from "vitest";

import {
  getPlanComparison,
  includingTeamsPriceLabel,
  planChoiceReason,
  planTierFromPlan,
  suggestedUpgradeTier,
  teamsAddonBenefitLines,
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

  it("gives every paid plan a short reason to choose it", () => {
    expect(planChoiceReason("hobby")).toBeNull();
    expect(planChoiceReason("core")).toBe("More usage and room to grow.");
    expect(planChoiceReason("pro")).toBe(
      "Longer history, higher limits, and advanced controls.",
    );
    expect(planChoiceReason("enterprise")).toBe(
      "Custom terms and dedicated support.",
    );
  });

  it("derives the Teams add-on price from catalogue list prices", () => {
    expect(teamsAddonPriceLabel()).toBe("+$300/mo");
    expect(includingTeamsPriceLabel()).toBe("$499/month including Teams");
    expect(teamsAddonBenefitLines()).toEqual([
      "Private Slack channel, 24h response",
      "Enterprise SSO and fine-grained RBAC",
    ]);
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

    expect(comparison.heading).toBe("Everything in Hobby, plus");
    expect(comparison.lines.map((line) => line.text)).toEqual([
      "90 days of history",
      "Unlimited users",
      "4,000 ingestion requests/min",
      "20 alerts",
      "3 annotation queues",
      "In-app support, 48h response",
    ]);
    expect(comparison.lines.map((line) => line.text)).not.toContain(
      "Additional usage billed beyond included units",
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
        "30 days of history",
        "2 users — 5 of your 7 lose access",
        "Usage capped at included units",
        "No in-app support",
      ]),
    );
  });

  it("describes Pro additions over Core without restating Core entitlements", () => {
    const comparison = getPlanComparison({
      currentTier: "hobby",
      targetTier: "pro",
      upgradeFrom: "core",
    });

    expect(comparison.heading).toBe("Everything in Core, plus");
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
    expect(comparison.lines.map((line) => line.text)).not.toContain(
      "Unlimited users",
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

  it("does not restate billed overage when leaving negotiated Enterprise usage", () => {
    const comparison = getPlanComparison({
      currentTier: "enterprise",
      targetTier: "core",
    });

    expect(comparison.lines.map((line) => line.text)).not.toContain(
      "Additional usage billed beyond included units",
    );
  });

  it("lists Enterprise-only additions over Pro + Teams once each", () => {
    const comparison = getPlanComparison({
      currentTier: "team",
      targetTier: "enterprise",
    });
    const texts = comparison.lines.map((line) => line.text);

    expect(comparison.heading).toBe("Everything in Pro + Teams, plus");
    expect(texts).toEqual([
      "Negotiated usage on yearly terms",
      "Support SLA",
      "Uptime SLA",
      "Named lead support engineer",
      "Custom rate limits",
      "100 alerts",
      "Audit logs and SCIM provisioning",
    ]);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("lists only Enterprise extras over Pro + Teams when the org is on Hobby", () => {
    const comparison = getPlanComparison({
      currentTier: "hobby",
      targetTier: "enterprise",
      upgradeFrom: "team",
    });
    const texts = comparison.lines.map((line) => line.text);

    expect(comparison.heading).toBe("Everything in Pro + Teams, plus");
    expect(texts).toEqual([
      "Negotiated usage on yearly terms",
      "Support SLA",
      "Uptime SLA",
      "Named lead support engineer",
      "Custom rate limits",
      "100 alerts",
      "Audit logs and SCIM provisioning",
    ]);
    expect(texts).not.toContain("3 years of history");
    expect(texts).not.toContain("Unlimited users");
    expect(texts).not.toContain("Data retention management");
  });
});
