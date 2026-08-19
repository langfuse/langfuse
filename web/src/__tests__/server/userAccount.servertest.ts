import type { Session } from "next-auth";
import { randomUUID } from "crypto";

import type { Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  getFeaturePreviewOptOutFlag,
  parseFlags,
} from "@/src/features/feature-flags/utils";

describe("userAccountRouter.setFeaturePreviewEnabled", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
  const originalAllowPreviewOptIn =
    env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN;

  /** Self-hosted deployment on the write mode that shows the v4 migration UI. */
  const selfHostedDualWithPreviewOptIn = () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
    (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
  };

  beforeEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
  });

  afterEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
    (env as any).LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN =
      originalAllowPreviewOptIn;
  });

  it("enables the Modern Session preview, leaving other flags intact", async () => {
    const { caller, userId } = await createCaller({
      featureFlags: ["templateFlag"],
    });

    const result = await caller.userAccount.setFeaturePreviewEnabled({
      flag: "modernSession",
      enabled: true,
    });

    expect(result).toEqual({
      success: true,
      flag: "modernSession",
      enabled: true,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { featureFlags: true },
    });
    expect(user.featureFlags).toEqual(["templateFlag", "modernSession"]);
  });

  it("enables the V4 migration UI preview, leaving other flags intact", async () => {
    const { caller, userId } = await createCaller({
      featureFlags: ["templateFlag"],
    });

    const result = await caller.userAccount.setFeaturePreviewEnabled({
      flag: "v4UpgradeUi",
      enabled: true,
    });

    expect(result).toEqual({
      success: true,
      flag: "v4UpgradeUi",
      enabled: true,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { featureFlags: true },
    });
    expect(user.featureFlags).toEqual(["templateFlag", "v4UpgradeUi"]);
  });

  it("disables a preview flag without touching the others", async () => {
    const { caller, userId } = await createCaller({
      featureFlags: ["templateFlag", "modernSession"],
    });

    const result = await caller.userAccount.setFeaturePreviewEnabled({
      flag: "modernSession",
      enabled: false,
    });

    expect(result).toEqual({
      success: true,
      flag: "modernSession",
      enabled: false,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { featureFlags: true },
    });
    expect(user.featureFlags).toEqual(["templateFlag"]);
  });

  it.each(["langfuse.com", "clickhouse.com"])(
    "persists an opt-out when a team member on %s disables a preview",
    async (emailDomain) => {
      const { caller, userId } = await createCaller({
        emailDomain,
        featureFlags: ["templateFlag"],
      });

      await caller.userAccount.setFeaturePreviewEnabled({
        flag: "modernSession",
        enabled: false,
      });

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { featureFlags: true, email: true },
      });
      expect(user.featureFlags).toEqual([
        "templateFlag",
        getFeaturePreviewOptOutFlag("modernSession"),
      ]);
      expect(
        parseFlags(user.featureFlags, {
          email: user.email,
          v4BetaEnabled: true,
          v4UpgradeUiAvailable: true,
        }).modernSession,
      ).toBe(false);
    },
  );

  it("rejects enabling in self-hosted deployments", async () => {
    const { caller } = await createCaller();
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    await expect(
      caller.userAccount.setFeaturePreviewEnabled({
        flag: "modernSession",
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("persists an opt-out when a regular user disables the V4 migration UI", async () => {
    // The migration UI is on by default, so an "off" has to be recorded
    // explicitly — dropping the entry would let it default straight back on.
    const { caller, userId } = await createCaller({
      featureFlags: ["templateFlag"],
    });

    await caller.userAccount.setFeaturePreviewEnabled({
      flag: "v4UpgradeUi",
      enabled: false,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { featureFlags: true, email: true },
    });
    expect(user.featureFlags).toEqual([
      "templateFlag",
      getFeaturePreviewOptOutFlag("v4UpgradeUi"),
    ]);
    expect(
      parseFlags(user.featureFlags, {
        email: user.email,
        v4BetaEnabled: false,
        v4UpgradeUiAvailable: true,
      }).v4UpgradeUi,
    ).toBe(false);
  });

  it("lets a self-hoster on dual re-enable the V4 migration UI after opting out", async () => {
    const { caller, userId } = await createCaller({
      featureFlags: [
        "templateFlag",
        getFeaturePreviewOptOutFlag("v4UpgradeUi"),
      ],
    });
    selfHostedDualWithPreviewOptIn();

    await caller.userAccount.setFeaturePreviewEnabled({
      flag: "v4UpgradeUi",
      enabled: true,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { featureFlags: true, email: true },
    });
    expect(user.featureFlags).toEqual(["templateFlag", "v4UpgradeUi"]);
    expect(
      parseFlags(user.featureFlags, {
        email: user.email,
        v4BetaEnabled: false,
        v4UpgradeUiAvailable: true,
      }).v4UpgradeUi,
    ).toBe(true);
  });

  it("rejects enabling the V4 migration UI on a self-hosted legacy deployment", async () => {
    const { caller } = await createCaller();
    selfHostedDualWithPreviewOptIn();
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";

    await expect(
      caller.userAccount.setFeaturePreviewEnabled({
        flag: "v4UpgradeUi",
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("still rejects enabling other previews on a self-hosted dual deployment", async () => {
    // The v4 migration UI carve-out must not widen the precondition for the
    // previews that do depend on the events-backed read path.
    const { caller } = await createCaller();
    selfHostedDualWithPreviewOptIn();

    await expect(
      caller.userAccount.setFeaturePreviewEnabled({
        flag: "modernSession",
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

async function createCaller({
  plan = "cloud:hobby",
  aiFeaturesEnabled = true,
  featureFlags = ["templateFlag"],
  includeProjectInSession = true,
  emailDomain = "example.com",
}: {
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
      featureFlags: {
        modernSession: featureFlags.includes("modernSession"),
        searchBar: featureFlags.includes("searchBar"),
        templateFlag: featureFlags.includes("templateFlag"),
        v4UpgradeUi: featureFlags.includes("v4UpgradeUi"),
        excludeClickhouseRead: false,
        observationEvals: false,
        v4BetaToggleVisible: false,
        experimentsV4Enabled: false,
      },
      admin: false,
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
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
}
