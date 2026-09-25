import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { type Plan, Role } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ emit: vi.fn() }));

// The emit itself is fire-and-forget inside the helper; what this file pins is
// which lifecycle mutations call it, and with which org on each side.
vi.mock("@/src/ee/features/billing/server/chb/chbProjectEvents", () => ({
  emitChbProjectEvent: mocks.emit,
}));

import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

async function createOrg(label: string) {
  const orgId = uuidv4();
  await prisma.organization.create({
    data: { id: orgId, name: `${label} ${orgId.slice(0, 8)}` },
  });
  return orgId;
}

async function createProject(orgId: string) {
  const projectId = uuidv4();
  await prisma.project.create({
    data: {
      id: projectId,
      name: `CHB Project ${projectId.slice(0, 8)}`,
      orgId,
    },
  });
  return projectId;
}

async function createUserInOrgs(orgIds: string[]) {
  const userId = uuidv4();
  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `chb-events-${userId.slice(0, 8)}@test.com`,
      name: "Test User",
    },
  });
  for (const orgId of orgIds) {
    await prisma.organizationMembership.create({
      data: { userId: user.id, orgId, role: Role.OWNER },
    });
  }
  return user;
}

function makeCaller({
  userId,
  orgIds,
  projectId,
  plan = "cloud:pro",
}: {
  userId: string;
  orgIds: string[];
  projectId?: string;
  plan?: Plan;
}) {
  const session: Session = {
    expires: "1",
    user: {
      id: userId,
      canCreateOrganizations: true,
      name: "Test User",
      email: "chb-events@test.com",
      organizations: orgIds.map((orgId) => ({
        id: orgId,
        name: "Test Organization",
        role: Role.OWNER,
        plan,
        cloudConfig: undefined,
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: true,
        projects: projectId
          ? [
              {
                id: projectId,
                role: Role.OWNER,
                retentionDays: 0,
                deletedAt: null,
                hasTraces: false,
                name: "Test Project",
                metadata: {},
                createdAt: new Date().toISOString(),
              },
            ]
          : [],
      })),
      featureFlags: testFeatureFlags(),
      admin: false,
    },
    environment: {} as any,
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
}

describe("projectsRouter CHB project lifecycle events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits a delete for the source org and a create for the destination on transfer", async () => {
    const sourceOrgId = await createOrg("CHB Source Org");
    const targetOrgId = await createOrg("CHB Target Org");
    const projectId = await createProject(sourceOrgId);
    const user = await createUserInOrgs([sourceOrgId, targetOrgId]);

    const caller = makeCaller({
      userId: user.id,
      orgIds: [sourceOrgId, targetOrgId],
      projectId,
    });

    await caller.projects.transfer({ projectId, targetOrgId });

    // CHB's registry is keyed by (organizationId, projectId): without both
    // sides the source org keeps being metered for a project it no longer owns.
    expect(mocks.emit).toHaveBeenCalledWith({
      type: "LANGFUSE_PROJECT_DELETED",
      orgId: sourceOrgId,
      projectId,
    });
    expect(mocks.emit).toHaveBeenCalledWith({
      type: "LANGFUSE_PROJECT_CREATED",
      orgId: targetOrgId,
      projectId,
    });
    expect(mocks.emit).toHaveBeenCalledTimes(2);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    expect(project?.orgId).toBe(targetOrgId);
  });

  it("emits a create on project creation", async () => {
    const orgId = await createOrg("CHB Create Org");
    const user = await createUserInOrgs([orgId]);
    const caller = makeCaller({ userId: user.id, orgIds: [orgId] });

    const project = await caller.projects.create({
      name: "New CHB Project",
      orgId,
    });

    expect(mocks.emit).toHaveBeenCalledWith({
      type: "LANGFUSE_PROJECT_CREATED",
      orgId,
      projectId: project.id,
    });
  });

  it("emits a delete when the project is soft-deleted", async () => {
    const orgId = await createOrg("CHB Delete Org");
    const projectId = await createProject(orgId);
    const user = await createUserInOrgs([orgId]);
    const caller = makeCaller({ userId: user.id, orgIds: [orgId], projectId });

    await caller.projects.delete({ projectId });

    expect(mocks.emit).toHaveBeenCalledWith({
      type: "LANGFUSE_PROJECT_DELETED",
      orgId,
      projectId,
    });
  });
});

describe("projectsRouter system role assignments", () => {
  it("revokes a project key's assignment when the project is deleted", async () => {
    const orgId = await createOrg("Assignment Delete Org");
    const projectId = await createProject(orgId);
    const user = await createUserInOrgs([orgId]);
    const caller = makeCaller({ userId: user.id, orgIds: [orgId], projectId });

    const key = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
    });

    await expect(
      prisma.systemRoleAssignment.count({
        where: { principalId: `apiKey/${key.id}` },
      }),
    ).resolves.toBe(1);

    await caller.projects.delete({ projectId });

    await expect(
      prisma.systemRoleAssignment.count({
        where: { ownerId: `project/${projectId}` },
      }),
    ).resolves.toBe(0);
  });

  it("re-tags a project key's assignment orgId on transfer", async () => {
    const sourceOrgId = await createOrg("Assignment Source Org");
    const targetOrgId = await createOrg("Assignment Target Org");
    const projectId = await createProject(sourceOrgId);
    const user = await createUserInOrgs([sourceOrgId, targetOrgId]);
    const caller = makeCaller({
      userId: user.id,
      orgIds: [sourceOrgId, targetOrgId],
      projectId,
    });

    const key = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
    });

    const before = await prisma.systemRoleAssignment.findFirstOrThrow({
      where: { principalId: `apiKey/${key.id}` },
    });
    expect(before.orgId).toBe(sourceOrgId);

    await caller.projects.transfer({ projectId, targetOrgId });

    const after = await prisma.systemRoleAssignment.findFirstOrThrow({
      where: { principalId: `apiKey/${key.id}` },
    });
    expect(after.orgId).toBe(targetOrgId);
    expect(after.ownerId).toBe(`project/${projectId}`);
  });
});
