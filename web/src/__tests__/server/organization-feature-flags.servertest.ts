import type { Session } from "next-auth";
import { randomUUID } from "node:crypto";

import { Role, type Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import { getFeaturePreviewOptOutFlag } from "@/src/features/feature-flags/utils";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

describe("organization feature preview defaults", () => {
  it("enables a default without mutating current members", async () => {
    const { actor, caller, org } = await prepare();
    await prisma.user.update({
      where: { id: actor.id },
      data: { featureFlags: ["modernSession"] },
    });
    const member = await createUser();
    await prisma.organizationMembership.create({
      data: { orgId: org.id, userId: member.id, role: Role.MEMBER },
    });

    await caller.organizations.setFeatureFlagOrgDefault({
      orgId: org.id,
      flag: "modernSession",
      enabled: true,
    });

    const [updatedOrg, updatedActor, updatedMember] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: org.id },
        select: { featureFlagOrgDefaults: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: { featureFlags: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: member.id },
        select: { featureFlags: true },
      }),
    ]);

    expect(updatedOrg.featureFlagOrgDefaults).toEqual(["modernSession"]);
    expect(updatedActor.featureFlags).toEqual(["modernSession"]);
    expect(updatedMember.featureFlags).toEqual([]);
    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: {
        orgId: org.id,
        resourceType: "organization",
        resourceId: org.id,
        action: "updateFeatureFlagDefault",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.parse(auditEntry.before!)).toEqual({
      featureFlagOrgDefaults: [],
    });
    expect(JSON.parse(auditEntry.after!)).toEqual({
      featureFlagOrgDefaults: ["modernSession"],
    });
  });

  it("allows tested administrators and rejects ordinary organization members", async () => {
    const admin = await prepare("cloud:core", Role.ADMIN);
    await prisma.user.update({
      where: { id: admin.actor.id },
      data: { featureFlags: ["modernSession"] },
    });
    await expect(
      admin.caller.organizations.setFeatureFlagOrgDefault({
        orgId: admin.org.id,
        flag: "modernSession",
        enabled: true,
      }),
    ).resolves.toMatchObject({ enabled: true });

    const member = await prepare("cloud:core", Role.MEMBER);
    await expect(
      member.caller.organizations.setFeatureFlagOrgDefault({
        orgId: member.org.id,
        flag: "modernSession",
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      member.caller.organizations.getFeatureFlagOrgDefaults({
        orgId: member.org.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const members = await member.caller.members.allFromOrg({
      orgId: member.org.id,
      page: 0,
      limit: 10,
    });
    expect(members.memberships[0]?.featurePreviews).toBeNull();
    expect(members.memberships[0]?.featurePreviewManagement).toBeNull();
  });

  it("rejects enabling a default until the administrator has the preview enabled personally", async () => {
    const { caller, org } = await prepare();

    await expect(
      caller.organizations.setFeatureFlagOrgDefault({
        orgId: org.id,
        flag: "modernSession",
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects internal flags at the input boundary", async () => {
    const { caller, org } = await prepare();

    await expect(
      caller.organizations.setFeatureFlagOrgDefault({
        orgId: org.id,
        flag: "templateFlag" as never,
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is idempotent and preserves unknown organization defaults", async () => {
    const { actor, caller, org } = await prepare();
    await Promise.all([
      prisma.user.update({
        where: { id: actor.id },
        data: { featureFlags: ["modernSession"] },
      }),
      prisma.organization.update({
        where: { id: org.id },
        data: { featureFlagOrgDefaults: ["futurePreview"] },
      }),
    ]);

    for (const enabled of [true, true]) {
      await caller.organizations.setFeatureFlagOrgDefault({
        orgId: org.id,
        flag: "modernSession",
        enabled,
      });
    }
    await expect(
      prisma.organization.findUniqueOrThrow({
        where: { id: org.id },
        select: { featureFlagOrgDefaults: true },
      }),
    ).resolves.toEqual({
      featureFlagOrgDefaults: ["futurePreview", "modernSession"],
    });

    for (const enabled of [false, false]) {
      await caller.organizations.setFeatureFlagOrgDefault({
        orgId: org.id,
        flag: "modernSession",
        enabled,
      });
    }
    await expect(
      prisma.organization.findUniqueOrThrow({
        where: { id: org.id },
        select: { featureFlagOrgDefaults: true },
      }),
    ).resolves.toEqual({
      featureFlagOrgDefaults: ["futurePreview"],
    });
  });

  it("applies defaults to a new member context without copying them to the user", async () => {
    const { caller, org } = await prepare();
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        featureFlagOrgDefaults: ["modernSession", "futurePreview"],
      },
    });
    const member = await createUser({
      featureFlags: [
        "templateFlag",
        getFeaturePreviewOptOutFlag("modernSession"),
      ],
    });

    await caller.members.create({
      orgId: org.id,
      email: member.email!,
      orgRole: Role.MEMBER,
    });

    const [updated, members] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: member.id },
        select: { featureFlags: true },
      }),
      caller.members.allFromOrg({ orgId: org.id, page: 0, limit: 10 }),
    ]);
    expect(updated.featureFlags).toEqual([
      "templateFlag",
      getFeaturePreviewOptOutFlag("modernSession"),
    ]);
    expect(
      members.memberships.find((membership) => membership.userId === member.id)
        ?.featurePreviews,
    ).toEqual({
      // The member's opt-out beats the organization default, and neither
      // default was copied onto the user (asserted above). `futurePreview` is
      // not a registered preview, so it is filtered out rather than surfacing
      // here. Asserting that two REGISTERED defaults resolve differently needs
      // a second preview; add that half back with the next one.
      modernSession: false,
    });
  });

  it("rejects default changes for the demo organization", async () => {
    const originalDemoOrgId = env.NEXT_PUBLIC_DEMO_ORG_ID;
    const { caller, org } = await prepare();
    (env as { NEXT_PUBLIC_DEMO_ORG_ID?: string }).NEXT_PUBLIC_DEMO_ORG_ID =
      org.id;

    try {
      await expect(
        caller.organizations.setFeatureFlagOrgDefault({
          orgId: org.id,
          flag: "modernSession",
          enabled: true,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const members = await caller.members.allFromOrg({
        orgId: org.id,
        page: 0,
        limit: 10,
      });
      expect(members.memberships[0]?.featurePreviews).toBeNull();
      expect(members.memberships[0]?.featurePreviewManagement).toBeNull();
    } finally {
      (env as { NEXT_PUBLIC_DEMO_ORG_ID?: string }).NEXT_PUBLIC_DEMO_ORG_ID =
        originalDemoOrgId;
    }
  });
});

describe("organization member feature preview overrides", () => {
  it("persists an administrator's disable as a global user opt-out", async () => {
    const { caller, org } = await prepare();
    const target = await createUser({ featureFlags: ["modernSession"] });
    await prisma.organizationMembership.create({
      data: { orgId: org.id, userId: target.id, role: Role.MEMBER },
    });

    await caller.members.setUserFeaturePreviewEnabled({
      orgId: org.id,
      userId: target.id,
      flag: "modernSession",
      enabled: false,
    });

    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { featureFlags: true },
      }),
    ).resolves.toEqual({
      featureFlags: [getFeaturePreviewOptOutFlag("modernSession")],
    });
  });

  it("audits disabling an inherited organization default as a global override", async () => {
    const { caller, org } = await prepare();
    await prisma.organization.update({
      where: { id: org.id },
      data: { featureFlagOrgDefaults: ["modernSession"] },
    });
    const target = await createUser();
    const membership = await prisma.organizationMembership.create({
      data: { orgId: org.id, userId: target.id, role: Role.MEMBER },
    });

    await caller.members.setUserFeaturePreviewEnabled({
      orgId: org.id,
      userId: target.id,
      flag: "modernSession",
      enabled: false,
    });

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: {
        orgId: org.id,
        resourceType: "orgMembership",
        resourceId: membership.id,
        action: "updateUserFeatureFlag",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.parse(auditEntry.before!)).toEqual({
      flag: "modernSession",
      override: "inherit",
      scope: "global",
    });
    expect(JSON.parse(auditEntry.after!)).toEqual({
      flag: "modernSession",
      override: "disabled",
      scope: "global",
    });
  });

  it("allows a platform administrator across organizations and writes a minimal audit entry", async () => {
    const { caller, org } = await prepare("cloud:core", Role.OWNER, true);
    const target = await createUser();
    const currentMembership = await prisma.organizationMembership.create({
      data: { orgId: org.id, userId: target.id, role: Role.MEMBER },
    });
    const otherOrg = await createOrganization();
    await prisma.organizationMembership.create({
      data: { orgId: otherOrg.id, userId: target.id, role: Role.VIEWER },
    });

    await caller.members.setUserFeaturePreviewEnabled({
      orgId: org.id,
      userId: target.id,
      flag: "modernSession",
      enabled: true,
    });

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: {
        orgId: org.id,
        resourceType: "orgMembership",
        resourceId: currentMembership.id,
        action: "updateUserFeatureFlag",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.parse(auditEntry.before!)).toEqual({
      flag: "modernSession",
      override: "inherit",
      scope: "global",
    });
    expect(JSON.parse(auditEntry.after!)).toEqual({
      flag: "modernSession",
      override: "enabled",
      scope: "global",
    });
  });

  it("denies a targeted change unless the actor administers every real target organization", async () => {
    const { actor, caller, org } = await prepare();
    const target = await createUser();
    await prisma.organizationMembership.create({
      data: { orgId: org.id, userId: target.id, role: Role.MEMBER },
    });
    const otherOrg = await createOrganization();
    await prisma.organizationMembership.create({
      data: { orgId: otherOrg.id, userId: target.id, role: Role.VIEWER },
    });

    const members = await caller.members.allFromOrg({
      orgId: org.id,
      page: 0,
      limit: 10,
    });
    const targetRow = members.memberships.find(
      (membership) => membership.userId === target.id,
    );
    expect(targetRow?.featurePreviewManagement).toEqual({ allowed: false });

    await expect(
      caller.members.setUserFeaturePreviewEnabled({
        orgId: org.id,
        userId: target.id,
        flag: "modernSession",
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await prisma.organizationMembership.create({
      data: { orgId: otherOrg.id, userId: actor.id, role: Role.ADMIN },
    });
    await expect(
      caller.members.setUserFeaturePreviewEnabled({
        orgId: org.id,
        userId: target.id,
        flag: "modernSession",
        enabled: true,
      }),
    ).resolves.toMatchObject({
      userId: target.id,
      flag: "modernSession",
      enabled: true,
    });
  });

  it("ignores demo membership in the all-organizations check", async () => {
    const originalDemoOrgId = env.NEXT_PUBLIC_DEMO_ORG_ID;
    const { caller, org } = await prepare();
    const target = await createUser();
    await prisma.organizationMembership.create({
      data: { orgId: org.id, userId: target.id, role: Role.MEMBER },
    });
    const demoOrg = await createOrganization();
    await prisma.organizationMembership.create({
      data: { orgId: demoOrg.id, userId: target.id, role: Role.VIEWER },
    });
    (env as { NEXT_PUBLIC_DEMO_ORG_ID?: string }).NEXT_PUBLIC_DEMO_ORG_ID =
      demoOrg.id;

    try {
      await expect(
        caller.members.setUserFeaturePreviewEnabled({
          orgId: org.id,
          userId: target.id,
          flag: "modernSession",
          enabled: true,
        }),
      ).resolves.toMatchObject({ enabled: true });
    } finally {
      (env as { NEXT_PUBLIC_DEMO_ORG_ID?: string }).NEXT_PUBLIC_DEMO_ORG_ID =
        originalDemoOrgId;
    }
  });

  it("does not expose raw or foreign-organization feature flag data", async () => {
    const { caller, org } = await prepare();
    const target = await createUser({
      featureFlags: ["templateFlag", "modernSession"],
    });
    await prisma.organizationMembership.create({
      data: { orgId: org.id, userId: target.id, role: Role.MEMBER },
    });

    const result = await caller.members.allFromOrg({
      orgId: org.id,
      page: 0,
      limit: 10,
    });
    const row = result.memberships.find(
      (membership) => membership.userId === target.id,
    );

    // The state map surfaces every preview; the raw `featureFlags` array stays
    // hidden, which is what this guards.
    expect(row?.featurePreviews).toEqual({ modernSession: true });
    expect(row?.user).not.toHaveProperty("featureFlags");
    expect(row).not.toHaveProperty("organizationIds");
  });

  it("rejects a target that is not a member of the input organization", async () => {
    const { caller, org } = await prepare();
    const target = await createUser();

    await expect(
      caller.members.setUserFeaturePreviewEnabled({
        orgId: org.id,
        userId: target.id,
        flag: "modernSession",
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

async function createUser({
  email,
  featureFlags = [],
}: {
  email?: string;
  featureFlags?: string[];
} = {}) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      email: email ?? `${id}@example.com`,
      name: `Feature Flag User ${id}`,
      featureFlags,
    },
  });
}

async function createOrganization({
  featureFlagOrgDefaults = [],
}: {
  featureFlagOrgDefaults?: string[];
} = {}) {
  const id = randomUUID();
  return prisma.organization.create({
    data: {
      id: `org-${id}`,
      name: `Feature Flag Org ${id}`,
      featureFlagOrgDefaults,
    },
  });
}

async function prepare(
  plan: Plan = "cloud:core",
  actorRole: Role = Role.OWNER,
  actorIsPlatformAdmin = false,
) {
  const id = randomUUID();
  const org = await createOrganization();
  const project = await prisma.project.create({
    data: {
      id: `project-${id}`,
      orgId: org.id,
      name: `Feature Flag Project ${id}`,
    },
  });
  const actor = await createUser();
  await prisma.organizationMembership.create({
    data: { orgId: org.id, userId: actor.id, role: actorRole },
  });

  const session: Session = {
    expires: "1",
    user: {
      id: actor.id,
      email: actor.email,
      name: actor.name,
      admin: actorIsPlatformAdmin,
      canCreateOrganizations: true,
      featureFlags: {} as NonNullable<Session["user"]>["featureFlags"],
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: actorRole,
          plan,
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [
            {
              id: project.id,
              name: project.name,
              role: Role.OWNER,
              deletedAt: null,
              retentionDays: null,
              metadata: {},
            } as NonNullable<
              Session["user"]
            >["organizations"][number]["projects"][number],
          ],
        },
      ],
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: plan,
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  return {
    actor,
    caller: appRouter.createCaller({ ...ctx, prisma }),
    org,
    project,
    session,
  };
}
