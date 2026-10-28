import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { randomUUID } from "crypto";

import type { Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createApiKey } from "@langfuse/shared/src/server";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  getFeaturePreviewOptOutFlag,
  INTERNAL_FEATURE_FLAG,
} from "@/src/features/feature-flags/server";
import { getSessionLoginAt } from "@/src/features/auth/lib/sessionExpiration";
import { getAuthOptions } from "@/src/server/auth";

describe("userAccountRouter.setFeaturePreviewEnabled", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
  });

  afterEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  it.each([true, false])(
    "rejects a non-platform-admin Topics toggle to %s",
    async (enabled) => {
      const { caller, userId } = await createCaller();
      await expect(
        caller.userAccount.setFeaturePreviewEnabled({
          flag: "langfuseTopics",
          enabled,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(user.featureFlags).toEqual(["templateFlag"]);
    },
  );

  it("lets a platform admin opt into and out of Topics locally without changing other flags", async () => {
    const { caller, userId } = await createCaller({ admin: true });
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    await caller.userAccount.setFeaturePreviewEnabled({
      flag: "langfuseTopics",
      enabled: true,
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .featureFlags,
    ).toEqual(["templateFlag", "langfuseTopics"]);
    await caller.userAccount.setFeaturePreviewEnabled({
      flag: "langfuseTopics",
      enabled: false,
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .featureFlags,
    ).not.toContain("langfuseTopics");
  });

  it("enables a preview, leaving other flags intact", async () => {
    const { caller, userId } = await createCaller({
      featureFlags: ["templateFlag"],
    });

    const result = await caller.userAccount.setFeaturePreviewEnabled({
      flag: "sessionViewV2",
      enabled: true,
    });

    expect(result).toEqual({
      success: true,
      flag: "sessionViewV2",
      enabled: true,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { featureFlags: true },
    });
    expect(user.featureFlags).toEqual(["templateFlag", "sessionViewV2"]);
  });

  it("allows users to enable the session timeline preview", async () => {
    const { caller, userId } = await createCaller();

    await caller.userAccount.setFeaturePreviewEnabled({
      flag: "sessionViewV2Timeline",
      enabled: true,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { featureFlags: true },
    });
    expect(user.featureFlags).toEqual([
      "templateFlag",
      "sessionViewV2Timeline",
      "sessionViewV2",
    ]);
  });

  it("persists a global opt-out when disabling a preview", async () => {
    const { caller, userId } = await createCaller({
      featureFlags: ["templateFlag", "sessionViewV2"],
    });

    const result = await caller.userAccount.setFeaturePreviewEnabled({
      flag: "sessionViewV2",
      enabled: false,
    });

    expect(result).toEqual({
      success: true,
      flag: "sessionViewV2",
      enabled: false,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { featureFlags: true },
    });
    expect(user.featureFlags).toEqual([
      "templateFlag",
      getFeaturePreviewOptOutFlag("sessionViewV2"),
      getFeaturePreviewOptOutFlag("sessionViewV2Timeline"),
    ]);
  });

  it("rejects enabling in self-hosted deployments", async () => {
    const { caller } = await createCaller();
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    await expect(
      caller.userAccount.setFeaturePreviewEnabled({
        flag: "sessionViewV2",
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("userAccountRouter.setViewMode", () => {
  const testEnv = env as {
    LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: typeof env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES;
  };
  const originalExperimental = env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES;
  beforeEach(() => {
    testEnv.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES = "false";
  });
  afterEach(() => {
    testEnv.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES = originalExperimental;
  });

  it("persists only the external override and preserves other preferences", async () => {
    const { caller, userId } = await createCaller({
      admin: true,
      featureFlags: ["sessionViewV2"],
    });
    await caller.userAccount.setViewMode({ mode: "EXTERNAL" });
    await caller.userAccount.setViewMode({ mode: "EXTERNAL" });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .featureFlags,
    ).toEqual([
      "sessionViewV2",
      getFeaturePreviewOptOutFlag(INTERNAL_FEATURE_FLAG),
    ]);
    await caller.userAccount.setViewMode({ mode: "INTERNAL" });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .featureFlags,
    ).toEqual(["sessionViewV2"]);
  });

  it("does not allow ordinary users to select internal mode", async () => {
    const { caller } = await createCaller();
    await expect(
      caller.userAccount.setViewMode({ mode: "INTERNAL" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("userAccountRouter.signOutAllSessions", () => {
  it("advances the user's session revocation timestamp", async () => {
    const { caller, userId } = await createCaller();
    const beforeRevocation = new Date();

    await expect(caller.userAccount.signOutAllSessions()).resolves.toEqual({
      success: true,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { sessionsExpiredAt: true },
    });
    expect(user.sessionsExpiredAt?.getTime()).toBeGreaterThanOrEqual(
      beforeRevocation.getTime(),
    );
  });

  it("evicts an older session and admits a later one", async () => {
    const { caller, email, session } = await createCaller();
    const revokedLoginAt = (await getSessionLoginAt(email, prisma)).getTime();

    await caller.userAccount.signOutAllSessions();

    const sessionCallback = (await getAuthOptions()).callbacks
      ?.session as (params: {
      session: Session;
      token: JWT;
    }) => Promise<Session>;

    const revoked = await sessionCallback({
      session,
      token: { email, loginAt: revokedLoginAt },
    });
    expect(revoked.user).toBeNull();

    const reLoginAt = (await getSessionLoginAt(email, prisma)).getTime();
    const admitted = await sessionCallback({
      session,
      token: { email, loginAt: reLoginAt },
    });
    expect(admitted.user).not.toBeNull();
  });
});

describe("userAccountRouter.delete", () => {
  it("audits the revocation of the user's bound gateway keys in each organization", async () => {
    const { caller, userId, orgId } = await createCaller();
    const otherOrg = await prisma.organization.create({
      data: { name: `User Account Test Org ${randomUUID()}` },
    });
    const keys = await Promise.all(
      [orgId, otherOrg.id].map((owner) =>
        createApiKey(prisma, {
          tenant: OrganizationId(owner),
          scope: UserId(userId),
          role: SystemRoleId("AI_GATEWAY"),
          createdBy: UserId(userId),
        }),
      ),
    );

    await caller.userAccount.delete();

    const entries = await prisma.auditLog.findMany({
      where: { resourceId: { in: keys.map((key) => key.id) } },
      select: { resourceId: true, orgId: true, action: true, userId: true },
    });
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        { resourceId: keys[0].id, orgId, action: "delete", userId },
        {
          resourceId: keys[1].id,
          orgId: otherOrg.id,
          action: "delete",
          userId,
        },
      ]),
    );
    expect(
      await prisma.apiKey.count({
        where: { id: { in: keys.map((key) => key.id) } },
      }),
    ).toBe(0);
  });
});

async function createCaller({
  admin = false,
  plan = "cloud:hobby",
  aiFeaturesEnabled = true,
  featureFlags = ["templateFlag"],
  includeProjectInSession = true,
  emailDomain = "example.com",
}: {
  admin?: boolean;
  plan?: Plan;
  aiFeaturesEnabled?: boolean;
  featureFlags?: string[];
  includeProjectInSession?: boolean;
  // Domain only — the local part is always unique so reruns against the same
  // database do not trip the users.email unique constraint.
  emailDomain?: string;
} = {}) {
  const id = randomUUID();
  const orgId = `org-${id}`;
  const projectId = `project-${id}`;
  const userId = `user-${id}`;

  const org = await prisma.organization.create({
    data: {
      id: orgId,
      name: `User Account Test Org ${id}`,
      aiFeaturesEnabled,
    },
  });
  const project = await prisma.project.create({
    data: {
      id: projectId,
      orgId,
      name: `User Account Test Project ${id}`,
    },
  });
  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@${emailDomain}`,
      name: "User Account Test User",
      featureFlags,
      admin,
    },
  });

  const session: Session = {
    expires: "1",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      canCreateOrganizations: true,
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan,
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: org.aiFeaturesEnabled,
          aiTelemetryEnabled: true,
          projects: includeProjectInSession
            ? [
                {
                  id: project.id,
                  name: project.name,
                  role: "ADMIN",
                  deletedAt: null,
                  retentionDays: null,
                  hasTraces: false,
                  metadata: {},
                  createdAt: project.createdAt.toISOString(),
                },
              ]
            : [],
        },
      ],
      featureFlags: testFeatureFlags({
        langfuseTopics: featureFlags.includes("langfuseTopics"),
        sessionViewV2: featureFlags.includes("sessionViewV2"),
        sessionViewV2Timeline: featureFlags.includes("sessionViewV2Timeline"),
        searchBar: featureFlags.includes("searchBar"),
        templateFlag: featureFlags.includes("templateFlag"),
      }),
      admin,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:enterprise",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });

  return {
    orgId,
    projectId,
    userId,
    email: user.email!,
    session,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
}
