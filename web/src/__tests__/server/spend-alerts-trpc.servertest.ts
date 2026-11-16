import type { Session } from "next-auth";
import { v4 } from "uuid";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma, Role } from "@langfuse/shared/src/db";
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

  it("does not let an owner of one organization create, edit, or delete another organization's alerts", async () => {
    const own = await prepare("cloud:core");
    const other = await prepare("cloud:core");
    const otherAlert = await prisma.cloudSpendAlert.create({
      data: { orgId: other.orgId, title: "Other", threshold: 100 },
    });
    const notMember = {
      code: "UNAUTHORIZED",
      message: "User is not a member of this organization",
    };

    await expect(
      own.caller.spendAlerts.createSpendAlert({
        orgId: other.orgId,
        title: "Injected",
        threshold: 1,
      }),
    ).rejects.toMatchObject(notMember);
    await expect(
      own.caller.spendAlerts.updateSpendAlert({
        orgId: other.orgId,
        id: otherAlert.id,
        threshold: 1,
      }),
    ).rejects.toMatchObject(notMember);
    await expect(
      own.caller.spendAlerts.deleteSpendAlert({
        orgId: other.orgId,
        id: otherAlert.id,
      }),
    ).rejects.toMatchObject(notMember);

    // Own orgId passes membership; the { id, orgId } lookup must still reject the foreign alert.
    await expect(
      own.caller.spendAlerts.updateSpendAlert({
        orgId: own.orgId,
        id: otherAlert.id,
        title: "Hijacked",
        threshold: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      own.caller.spendAlerts.deleteSpendAlert({
        orgId: own.orgId,
        id: otherAlert.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(
      await prisma.cloudSpendAlert.findMany({
        where: { orgId: { in: [own.orgId, other.orgId] } },
        select: { id: true, orgId: true, title: true, threshold: true },
      }),
    ).toEqual([
      {
        id: otherAlert.id,
        orgId: other.orgId,
        title: "Other",
        threshold: otherAlert.threshold,
      },
    ]);
  });

  // ADMIN is the broadest role without langfuseCloudBilling:CRUD; lower roles hold a subset of its scopes.
  it("denies alert mutations to an organization admin without langfuseCloudBilling:CRUD", async () => {
    const { orgId, callerWithRole } = await prepare("cloud:core");
    const caller = callerWithRole(Role.ADMIN);
    const alert = await prisma.cloudSpendAlert.create({
      data: { orgId, title: "Existing", threshold: 100 },
    });
    const missingScope = {
      code: "FORBIDDEN",
      message:
        "Forbidden, user does not have access to this resource or action",
    };

    await expect(
      caller.spendAlerts.createSpendAlert({
        orgId,
        title: "New",
        threshold: 50,
      }),
    ).rejects.toMatchObject(missingScope);
    await expect(
      caller.spendAlerts.updateSpendAlert({
        orgId,
        id: alert.id,
        threshold: 50,
      }),
    ).rejects.toMatchObject(missingScope);
    await expect(
      caller.spendAlerts.deleteSpendAlert({ orgId, id: alert.id }),
    ).rejects.toMatchObject(missingScope);

    expect(
      await prisma.cloudSpendAlert.findMany({
        where: { orgId },
        select: { id: true, title: true, threshold: true },
      }),
    ).toEqual([
      { id: alert.id, title: "Existing", threshold: alert.threshold },
    ]);
  });
});

/** prepare creates an organization on the given plan and tRPC callers for its members */
async function prepare(plan: Plan) {
  const org = await prisma.organization.create({
    data: { id: v4(), name: "Spend alerts test org" },
  });
  orgIds.push(org.id);

  const callerWithRole = (role: Role) => {
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
            role,
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
    return appRouter.createCaller({ ...ctx, prisma });
  };

  return { orgId: org.id, caller: callerWithRole(Role.OWNER), callerWithRole };
}
