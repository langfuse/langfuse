/** @jest-environment node */
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { createDefaultSpendAlerts } from "@/src/ee/features/billing/server/stripeWebhookHandler";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";

describe("createDefaultSpendAlerts", () => {
  it("creates alerts with correct thresholds for core plan", async () => {
    const { orgId } = await createOrgProjectAndApiKey();
    const coreProduct = stripeProducts.find(
      (p) => p.mappedPlan === "cloud:core",
    )!;

    await createDefaultSpendAlerts({
      orgId,
      productId: coreProduct.stripeProductId,
    });

    const alerts = await prisma.cloudSpendAlert.findMany({
      where: { orgId },
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].threshold.toNumber()).toBe(200);
    expect(alerts[0].title).toBe("Default Spend alert ($200)");
  });

  it("creates alerts with correct thresholds for pro plan", async () => {
    const { orgId } = await createOrgProjectAndApiKey();
    const proProduct = stripeProducts.find(
      (p) => p.mappedPlan === "cloud:pro",
    )!;

    await createDefaultSpendAlerts({
      orgId,
      productId: proProduct.stripeProductId,
    });

    const alerts = await prisma.cloudSpendAlert.findMany({
      where: { orgId },
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].threshold.toNumber()).toBe(1000);
  });

  it("creates alerts with correct thresholds for enterprise plan", async () => {
    const { orgId } = await createOrgProjectAndApiKey();
    const enterpriseProduct = stripeProducts.find(
      (p) => p.mappedPlan === "cloud:enterprise",
    )!;

    await createDefaultSpendAlerts({
      orgId,
      productId: enterpriseProduct.stripeProductId,
    });

    const alerts = await prisma.cloudSpendAlert.findMany({
      where: { orgId },
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].threshold.toNumber()).toBe(2000);
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

    await createDefaultSpendAlerts({
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
    await createDefaultSpendAlerts({
      orgId,
      productId: "prod_unknown_id",
    });

    const alerts = await prisma.cloudSpendAlert.findMany({
      where: { orgId },
    });

    expect(alerts).toHaveLength(0);
  });
});
