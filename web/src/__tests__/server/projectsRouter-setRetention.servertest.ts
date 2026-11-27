import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgMembership } from "@langfuse/shared/memberships";
import { type Plan, Role } from "@langfuse/shared";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

async function createOrgAndProject() {
  const orgId = uuidv4();
  const userId = uuidv4();
  const projectId = uuidv4();

  await prisma.organization.create({
    data: { id: orgId, name: `Retention Org ${orgId.slice(0, 8)}` },
  });
  await prisma.project.create({
    data: {
      id: projectId,
      name: `Retention Project ${projectId.slice(0, 8)}`,
      orgId,
    },
  });
  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `retention-${userId.slice(0, 8)}@test.com`,
      name: "Test User",
    },
  });
  await createOrgMembership(prisma, {
    userId: user.id,
    orgId,
    role: Role.OWNER,
  });

  return { orgId, projectId, user };
}

function makeCaller({
  userId,
  orgId,
  projectId,
  plan,
  role = Role.OWNER,
}: {
  userId: string;
  orgId: string;
  projectId: string;
  plan: Plan;
  role?: Role;
}) {
  const session: Session = createSession({
    user: { id: userId, name: "Test User", email: "retention@test.com" },
    organizations: [
      {
        id: orgId,
        role,
        plan,
        aiTelemetryEnabled: true,
        projects: [{ id: projectId, retentionDays: 0 }],
      },
    ],
  });
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
}

describe("projectsRouter.setRetention entitlement enforcement", () => {
  it("rejects when the project's plan lacks the data-retention entitlement", async () => {
    const { orgId, projectId, user } = await createOrgAndProject();
    const caller = makeCaller({
      userId: user.id,
      orgId,
      projectId,
      plan: "cloud:hobby", // no data-retention entitlement
    });

    await expect(
      caller.projects.setRetention({ projectId, retention: 3 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // The destructive retention setting must not have been persisted.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    expect(project?.retentionDays).toBeNull();
  });

  it("allows setting retention when the plan has the data-retention entitlement", async () => {
    const { orgId, projectId, user } = await createOrgAndProject();
    const caller = makeCaller({
      userId: user.id,
      orgId,
      projectId,
      plan: "cloud:pro", // has data-retention entitlement
    });

    await expect(
      caller.projects.setRetention({ projectId, retention: 5 }),
    ).resolves.toBe(true);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    expect(project?.retentionDays).toBe(5);
  });
});

describe("projectsRouter project update audit logs", () => {
  it("records the previous retention when retention changes", async () => {
    const { orgId, projectId, user } = await createOrgAndProject();
    await prisma.project.update({
      where: { id: projectId },
      data: { retentionDays: 10 },
    });
    const caller = makeCaller({
      userId: user.id,
      orgId,
      projectId,
      plan: "cloud:pro",
    });

    await caller.projects.setRetention({ projectId, retention: 30 });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        projectId,
        resourceType: "project",
        resourceId: projectId,
        action: "update",
      },
    });
    expect(JSON.parse(audit.before ?? "null")).toMatchObject({
      retentionDays: 10,
    });
    expect(JSON.parse(audit.after ?? "null")).toMatchObject({
      retentionDays: 30,
    });
  });

  it("records the previous name when the project is renamed", async () => {
    const { orgId, projectId, user } = await createOrgAndProject();
    const before = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true },
    });
    const caller = makeCaller({
      userId: user.id,
      orgId,
      projectId,
      plan: "cloud:pro",
    });
    const newName = `Renamed ${projectId.slice(0, 8)}`;

    await caller.projects.update({ projectId, newName });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        projectId,
        resourceType: "project",
        resourceId: projectId,
        action: "update",
      },
    });
    expect(JSON.parse(audit.before ?? "null")).toMatchObject({
      name: before.name,
    });
    expect(JSON.parse(audit.after ?? "null")).toMatchObject({
      name: newName,
    });
  });
});
