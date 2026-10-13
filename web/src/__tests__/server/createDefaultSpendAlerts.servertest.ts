import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  createDefaultSpendAlerts,
  createDefaultSpendAlertsForStripeProduct,
} from "@/src/ee/features/billing/server/defaultSpendAlerts";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";
import { chbPlanCodeToPlan } from "@langfuse/shared";

describe("createDefaultSpendAlerts", () => {
  it("creates alerts with correct thresholds for core plan", async () => {
    const { orgId } = await createOrgProjectAndApiKey();
    const coreProduct = stripeProducts.find(
      (p) => p.mappedPlan === "cloud:core",
    )!;

    await createDefaultSpendAlertsForStripeProduct({
      orgId,
      productId: coreProduct.stripeProductId,
    });

    const alerts = await prisma.cloudSpendAlert.findMany({
      where: { orgId },
      orderBy: { threshold: "asc" },
    });

    expect(alerts).toHaveLength(2);
    expect(alerts[0].threshold.toNumber()).toBe(200);
    expect(alerts[0].title).toBe("Default Spend alert ($200)");
    expect(alerts[1].threshold.toNumber()).toBe(4000);
    expect(alerts[1].title).toBe("Default Spend alert ($4000)");
  });

  it("creates alerts with correct thresholds for pro plan", async () => {
    const { orgId } = await createOrgProjectAndApiKey();
    const proProduct = stripeProducts.find(
      (p) => p.mappedPlan === "cloud:pro",
    )!;

    await createDefaultSpendAlertsForStripeProduct({
      orgId,
      productId: proProduct.stripeProductId,
    });

    const alerts = await prisma.cloudSpendAlert.findMany({
      where: { orgId },
      orderBy: { threshold: "asc" },
    });

    expect(alerts).toHaveLength(2);
    expect(alerts[0].threshold.toNumber()).toBe(1000);
    expect(alerts[1].threshold.toNumber()).toBe(4000);
  });

  it("creates alerts with correct thresholds for enterprise plan", async () => {
    const { orgId } = await createOrgProjectAndApiKey();
    const enterpriseProduct = stripeProducts.find(
      (p) => p.mappedPlan === "cloud:enterprise",
    )!;

    await createDefaultSpendAlertsForStripeProduct({
      orgId,
      productId: enterpriseProduct.stripeProductId,
    });

    const alerts = await prisma.cloudSpendAlert.findMany({
      where: { orgId },
      orderBy: { threshold: "asc" },
    });

    expect(alerts).toHaveLength(2);
    expect(alerts[0].threshold.toNumber()).toBe(2000);
    expect(alerts[1].threshold.toNumber()).toBe(4000);
  });

  it("skips creation if org already has alerts", async () => {
    const { orgId } = await createOrgProjectAndApiKey();

    // Create an existing alert
    await prisma.cloudSpendAlert.create({
      data: {
        orgId,
        title: "Existing alert",
        threshold: 500,
      },
    });

    const coreProduct = stripeProducts.find(
      (p) => p.mappedPlan === "cloud:core",
    )!;

    await createDefaultSpendAlertsForStripeProduct({
      orgId,
      productId: coreProduct.stripeProductId,
    });

    const alerts = await prisma.cloudSpendAlert.findMany({
      where: { orgId },
    });

    // Should still have only the original alert
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe("Existing alert");
  });

  it("handles unknown product IDs gracefully", async () => {
    const { orgId } = await createOrgProjectAndApiKey();

    // Should not throw
    await createDefaultSpendAlertsForStripeProduct({
      orgId,
      productId: "prod_unknown_id",
    });

    const alerts = await prisma.cloudSpendAlert.findMany({
      where: { orgId },
    });

    expect(alerts).toHaveLength(0);
  });

  /**
   * The CHB path seeds through the same function with a plan resolved from the
   * attached plan's code, so a ClickHouse-billed org must end up with exactly
   * the thresholds a Stripe-billed one on the same plan gets.
   */
  describe("ClickHouse-billed organizations", () => {
    it.each([
      ["LANGFUSE_CORE", 200],
      ["LANGFUSE_PRO", 1000],
      ["LANGFUSE_PRO_TEAMS", 1000],
      ["LANGFUSE_ENTERPRISE", 2000],
    ] as const)(
      "creates the plan threshold plus the universal one for %s",
      async (planCode, expectedThreshold) => {
        const { orgId } = await createOrgProjectAndApiKey();

        await createDefaultSpendAlerts({
          orgId,
          plan: chbPlanCodeToPlan[planCode],
          source: "clickhouse",
        });

        const alerts = await prisma.cloudSpendAlert.findMany({
          where: { orgId },
          orderBy: { threshold: "asc" },
        });

        expect(alerts.map((alert) => alert.threshold.toNumber())).toEqual(
          [...new Set([expectedThreshold, 4000])].sort((a, b) => a - b),
        );
      },
    );

    it("does not seed alerts for a plan without spend alerts", async () => {
      const { orgId } = await createOrgProjectAndApiKey();

      // Should not throw
      await createDefaultSpendAlerts({
        orgId,
        plan: "cloud:hobby",
        source: "clickhouse",
      });

      expect(
        await prisma.cloudSpendAlert.findMany({ where: { orgId } }),
      ).toHaveLength(0);
    });

    it("attributes the seeded alerts to the ClickHouse webhook in the audit log", async () => {
      const { orgId } = await createOrgProjectAndApiKey();

      await createDefaultSpendAlerts({
        orgId,
        plan: "cloud:core",
        source: "clickhouse",
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: { orgId, resourceType: "cloudSpendAlert" },
      });

      expect(auditLogs).toHaveLength(2);
      expect(
        auditLogs.every((log) => log.userId === "clickhouse-webhook"),
      ).toBe(true);
    });
  });
});
