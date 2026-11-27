import {
  BatchExportFileFormat,
  BatchExportStatus,
  BatchTableNames,
  type Plan,
  Role,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgMembership } from "@langfuse/shared/memberships";
import { createTrace, createTracesCh } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { env } from "@/src/env.mjs";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

async function getUiExportsDisabled(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { uiExportsDisabled: true },
  });
  return org.uiExportsDisabled;
}

async function setup({
  role = Role.OWNER,
  plan = "cloud:enterprise",
  uiExportsDisabled = false,
}: {
  role?: Role;
  plan?: Plan;
  uiExportsDisabled?: boolean;
} = {}) {
  const orgId = uuidv4();
  const projectId = uuidv4();
  const userId = uuidv4();
  createdOrgIds.push(orgId);
  createdUserIds.push(userId);

  await prisma.organization.create({
    data: {
      id: orgId,
      name: `UI exports ${orgId.slice(0, 8)}`,
      uiExportsDisabled,
      projects: {
        create: { id: projectId, name: "UI exports project" },
      },
    },
  });
  await prisma.user.create({
    data: {
      id: userId,
      email: `ui-exports-${userId.slice(0, 8)}@test.com`,
      name: "UI Exports Test User",
    },
  });
  await createOrgMembership(prisma, { userId, orgId, role });

  const session: Session = createSession({
    user: {
      id: userId,
      name: "UI Exports Test User",
      email: `ui-exports-${userId.slice(0, 8)}@test.com`,
    },
    organizations: [
      {
        id: orgId,
        role,
        name: "UI exports",
        plan,
        uiExportsDisabled,
        projects: [{ id: projectId, role, name: "UI exports project" }],
      },
    ],
  });
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return {
    orgId,
    projectId,
    userId,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
}

describe("uiExports tRPC", () => {
  const originalDisableUiExports = env.LANGFUSE_DISABLE_UI_EXPORTS;
  const originalSharedLicenseKey = sharedEnv.LANGFUSE_EE_LICENSE_KEY;
  const originalSharedCloudRegion = sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  afterEach(() => {
    (env as Record<string, unknown>).LANGFUSE_DISABLE_UI_EXPORTS =
      originalDisableUiExports;
    (sharedEnv as Record<string, unknown>).LANGFUSE_EE_LICENSE_KEY =
      originalSharedLicenseKey;
    (sharedEnv as Record<string, unknown>).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION =
      originalSharedCloudRegion;
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  it("persists uiExportsDisabled and records a change audit log for that field only", async () => {
    const { caller, orgId } = await setup({
      role: Role.OWNER,
      plan: "cloud:enterprise",
    });

    await caller.uiExports.setDisabled({ orgId, disabled: true });

    expect(await getUiExportsDisabled(orgId)).toBe(true);
    const changeEvent = await prisma.auditLog.findFirstOrThrow({
      where: { orgId, resourceType: "organization", resourceId: orgId },
      select: { action: true, before: true, after: true },
    });
    expect(changeEvent.action).toBe("update");
    expect(JSON.parse(changeEvent.before!)).toEqual({
      uiExportsDisabled: false,
    });
    expect(JSON.parse(changeEvent.after!)).toEqual({
      uiExportsDisabled: true,
    });
  });

  it("requires entitlement to disable exports, but allows re-enabling on any plan", async () => {
    const { caller: hobbyCaller, orgId: hobbyOrgId } = await setup({
      role: Role.OWNER,
      plan: "cloud:hobby",
      uiExportsDisabled: false,
    });

    await expect(
      hobbyCaller.uiExports.setDisabled({ orgId: hobbyOrgId, disabled: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getUiExportsDisabled(hobbyOrgId)).toBe(false);

    const { caller: downgradedCaller, orgId: downgradedOrgId } = await setup({
      role: Role.OWNER,
      plan: "cloud:hobby",
      uiExportsDisabled: true,
    });

    await downgradedCaller.uiExports.setDisabled({
      orgId: downgradedOrgId,
      disabled: false,
    });
    expect(await getUiExportsDisabled(downgradedOrgId)).toBe(false);
  });

  it("rejects members without organization:update", async () => {
    const { caller, orgId } = await setup({
      role: Role.MEMBER,
      plan: "cloud:enterprise",
    });

    await expect(
      caller.uiExports.setDisabled({ orgId, disabled: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getUiExportsDisabled(orgId)).toBe(false);
  });

  it("rejects owners of another organization", async () => {
    const { caller: outsider } = await setup({
      role: Role.OWNER,
      plan: "cloud:enterprise",
    });
    const { orgId: targetOrgId } = await setup({
      role: Role.OWNER,
      plan: "cloud:enterprise",
    });

    await expect(
      outsider.uiExports.setDisabled({ orgId: targetOrgId, disabled: true }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await getUiExportsDisabled(targetOrgId)).toBe(false);
  });

  it("rejects toggling when LANGFUSE_DISABLE_UI_EXPORTS is enforced on a licensed self-hosted instance", async () => {
    (env as Record<string, unknown>).LANGFUSE_DISABLE_UI_EXPORTS = "true";
    (sharedEnv as Record<string, unknown>).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION =
      undefined;
    (sharedEnv as Record<string, unknown>).LANGFUSE_EE_LICENSE_KEY =
      "langfuse_ee_test";

    const { caller, orgId } = await setup({
      role: Role.OWNER,
      plan: "self-hosted:enterprise",
      uiExportsDisabled: true,
    });

    await expect(
      caller.uiExports.setDisabled({ orgId, disabled: false }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getUiExportsDisabled(orgId)).toBe(true);
  });

  it("blocks batchExport.create, batchExport.downloadUrl, prompts.exportAll, and sessions.observationFullIOFromEvents when disabled", async () => {
    const { caller, projectId, userId } = await setup({
      role: Role.OWNER,
      plan: "cloud:hobby",
      uiExportsDisabled: true,
    });

    const completedExport = await prisma.batchExport.create({
      data: {
        projectId,
        userId,
        name: "Pre-existing completed export",
        status: BatchExportStatus.COMPLETED,
        format: BatchExportFileFormat.CSV,
        url: "https://example.com/export.csv",
        finishedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        query: {
          tableName: BatchTableNames.Traces,
          filter: [],
          orderBy: null,
        },
      },
    });

    await expect(
      caller.batchExport.create({
        projectId,
        name: "Blocked export",
        format: BatchExportFileFormat.CSV,
        query: {
          tableName: BatchTableNames.Traces,
          filter: [],
          orderBy: null,
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller.batchExport.downloadUrl({
        projectId,
        batchExportId: completedExport.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller.prompts.exportAll({
        projectId,
        includeAllVersions: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller.sessions.observationFullIOFromEvents({
        projectId,
        sessionId: "session-1",
        traceId: "trace-1",
        observationId: "obs-1",
        startTime: new Date(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("propagates uiExportsDisabledReason on public trace and session reads for anonymous viewers", async () => {
    const { projectId } = await setup({
      role: Role.OWNER,
      plan: "cloud:enterprise",
      uiExportsDisabled: true,
    });
    const sessionId = `pub-session-${uuidv4()}`;
    const trace = createTrace({
      project_id: projectId,
      session_id: sessionId,
      public: true,
    });
    await prisma.traceSession.create({
      data: {
        id: sessionId,
        projectId,
        public: true,
      },
    });
    await createTracesCh([trace]);

    const anonCaller = appRouter.createCaller({
      ...createInnerTRPCContext({ session: null, headers: {} }),
      prisma,
    });

    const traceResult = await anonCaller.traces.byIdWithObservationsAndScores({
      projectId,
      traceId: trace.id,
    });
    expect(traceResult.uiExportsDisabledReason).toBe(
      "UI exports are disabled for this organization.",
    );

    const sessionResult = await anonCaller.sessions.byIdWithScores({
      projectId,
      sessionId,
    });
    expect(sessionResult.uiExportsDisabledReason).toBe(
      "UI exports are disabled for this organization.",
    );

    const unifiedSessionResult =
      await anonCaller.sessions.observationsForSessionFromEvents({
        projectId,
        sessionId,
      });
    expect(unifiedSessionResult.uiExportsDisabledReason).toBe(
      "UI exports are disabled for this organization.",
    );
  });
});
