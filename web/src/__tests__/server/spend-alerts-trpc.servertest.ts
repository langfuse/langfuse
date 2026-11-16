import type { Session } from "next-auth";
import { v4 } from "uuid";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { type Plan } from "@langfuse/shared";

const orgIds: string[] = [];

describe("spend alerts trpc", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  });

  it("rejects creating and editing alerts without the cloud-spend-alerts entitlement", async () => {
    const { orgId, caller } = await prepare("cloud:hobby");
    const alert = await prisma.cloudSpendAlert.create({
      data: { orgId, title: "Existing", threshold: 100 },
    });

    await expect(
      caller.spendAlerts.createSpendAlert({
        orgId,
        title: "New",
        threshold: 50,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.spendAlerts.updateSpendAlert({
        orgId,
        id: alert.id,
        threshold: 50,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets an organization without the entitlement list and delete its existing alerts", async () => {
    const { orgId, caller } = await prepare("cloud:hobby");
    const alert = await prisma.cloudSpendAlert.create({
      data: { orgId, title: "Existing", threshold: 100 },
    });

    await expect(
      caller.spendAlerts.getSpendAlerts({ orgId }),
    ).resolves.toHaveLength(1);
    await caller.spendAlerts.deleteSpendAlert({ orgId, id: alert.id });

    expect(await prisma.cloudSpendAlert.count({ where: { orgId } })).toBe(0);
  });

  it("creates and edits alerts with the cloud-spend-alerts entitlement", async () => {
    const { orgId, caller } = await prepare("cloud:core");

    const created = await caller.spendAlerts.createSpendAlert({
      orgId,
      title: "New",
      threshold: 50,
    });
    const updated = await caller.spendAlerts.updateSpendAlert({
      orgId,
      id: created.id,
      threshold: 75,
    });

    expect(updated.threshold.toNumber()).toBe(75);
  });
});

/** prepare creates an organization on the given plan and a tRPC caller for its owner */
async function prepare(plan: Plan) {
  const org = await prisma.organization.create({
    data: { id: v4(), name: "Spend alerts test org" },
  });
  orgIds.push(org.id);

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan,
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [],
        },
      ],
      featureFlags: testFeatureFlags({ templateFlag: false }),
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  return { orgId: org.id, caller: appRouter.createCaller({ ...ctx, prisma }) };
}
