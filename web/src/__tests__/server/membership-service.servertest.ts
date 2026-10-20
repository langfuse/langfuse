import { randomUUID } from "crypto";
import { prisma, Role } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createBasicAuthHeader,
} from "@langfuse/shared/src/server";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { authenticator } from "@/src/features/apiKey/server";
import {
  ContextResolver,
  systemContext,
} from "@/src/features/auth/policy/contextResolver";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import {
  claimInvitations,
  createMembership,
  deleteMembership,
  deleteMemberships,
  updateMembership,
} from "@/src/features/memberships/server/membershipService";
import { SeatLimitExceededError } from "@/src/features/memberships/server/membershipErrors";

const resolver = new ContextResolver();

async function createOrg(plan: "Hobby" | "Team" = "Team") {
  const org = await prisma.organization.create({
    data: { name: randomUUID(), cloudConfig: { plan } },
  });
  const project = await prisma.project.create({
    data: { name: randomUUID(), orgId: org.id },
  });
  return { orgId: org.id, projectId: project.id };
}

async function createUser(orgId?: string, role?: Role) {
  return prisma.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      ...(orgId && role
        ? { organizationMemberships: { create: { orgId, role } } }
        : {}),
    },
  });
}

async function grantProjectRoleDirectly(
  orgId: string,
  projectId: string,
  userId: string,
  role: Role,
) {
  const orgMembership = await prisma.organizationMembership.findUniqueOrThrow({
    where: { orgId_userId: { orgId, userId } },
  });
  await prisma.projectMembership.create({
    data: { projectId, userId, role, orgMembershipId: orgMembership.id },
  });
}

function userContext(userId: string, orgId: string) {
  return resolver.resolveUser({ userId, isPlatformAdmin: false, orgId });
}

async function apiKeyContext(orgId: string, createdBy: string) {
  const key = await createApiKey(prisma, {
    owner: OrganizationId(orgId),
    role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
    createdBy: UserId(createdBy),
  });
  const authentication = await authenticator.authenticate({
    headers: {
      authorization: createBasicAuthHeader(key.publicKey, key.secretKey),
    },
  });
  if (!authentication.success) throw authentication.error;
  return { context: authentication.context, apiKeyId: key.id };
}

function membershipLogs(orgId: string) {
  return prisma.auditLog.findMany({
    where: {
      orgId,
      resourceType: {
        in: ["orgMembership", "projectMembership", "membershipInvitation"],
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

describe("membership service", () => {
  const orgIds: string[] = [];
  const cloudRegion = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  async function org(plan?: "Hobby" | "Team") {
    const created = await createOrg(plan);
    orgIds.push(created.orgId);
    return created;
  }

  afterEach(async () => {
    process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = cloudRegion;
    await prisma.auditLog.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    orgIds.length = 0;
  });

  describe("seat limit", () => {
    // Hobby's 2-seat limit applies on Cloud only
    beforeEach(() => {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "STAGING";
    });

    it("admits exactly one of two concurrent adds for the last seat", async () => {
      const { orgId } = await org("Hobby");
      const owner = await createUser(orgId, Role.OWNER);
      const [first, second] = [await createUser(), await createUser()];
      const ctx = await userContext(owner.id, orgId);

      const results = await Promise.allSettled([
        createMembership(ctx, { orgId, userId: first.id, role: Role.MEMBER }),
        createMembership(ctx, { orgId, userId: second.id, role: Role.MEMBER }),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected");
      expect(rejected?.reason).toBeInstanceOf(SeatLimitExceededError);
      expect(rejected?.reason).toMatchObject({ httpCode: 409 });
      expect(
        await prisma.organizationMembership.count({ where: { orgId } }),
      ).toBe(2);
    });

    it("counts pending invitations and applies to api keys", async () => {
      const { orgId } = await org("Hobby");
      const owner = await createUser(orgId, Role.OWNER);
      const { context } = await apiKeyContext(orgId, owner.id);
      await createMembership(context, {
        orgId,
        email: `${randomUUID()}@example.com`,
        role: Role.MEMBER,
      });
      const user = await createUser();

      await expect(
        updateMembership(context, {
          orgId,
          userId: user.id,
          role: Role.MEMBER,
        }),
      ).rejects.toBeInstanceOf(SeatLimitExceededError);
    });

    it("lets system principals and invite acceptance past the limit", async () => {
      const { orgId } = await org("Hobby");
      const owner = await createUser(orgId, Role.OWNER);
      const invitee = `${randomUUID()}@example.com`;
      await createMembership(await userContext(owner.id, orgId), {
        orgId,
        email: invitee,
        role: Role.MEMBER,
      });
      await updateMembership(systemContext("signupDefaults"), {
        orgId,
        userId: (await createUser()).id,
        role: Role.VIEWER,
      });
      const accepting = await prisma.user.create({ data: { email: invitee } });

      await claimInvitations({ userId: accepting.id, email: invitee });

      expect(
        await prisma.organizationMembership.count({ where: { orgId } }),
      ).toBe(3);
      expect(
        await prisma.membershipInvitation.count({ where: { orgId } }),
      ).toBe(0);
    });
  });

  describe("authorization", () => {
    it("requires the ownership permission to grant, change or remove OWNER", async () => {
      const { orgId } = await org();
      const owner = await createUser(orgId, Role.OWNER);
      const admin = await createUser(orgId, Role.ADMIN);
      const ctx = await userContext(admin.id, orgId);

      await expect(
        createMembership(ctx, {
          orgId,
          userId: (await createUser()).id,
          role: Role.OWNER,
        }),
      ).rejects.toMatchObject({ httpCode: 403 });
      await expect(
        updateMembership(ctx, { orgId, userId: owner.id, role: Role.MEMBER }),
      ).rejects.toMatchObject({ httpCode: 403 });
      await expect(
        deleteMembership(ctx, { orgId, userId: owner.id }),
      ).rejects.toMatchObject({ httpCode: 403 });
      expect(await membershipLogs(orgId)).toEqual([]);
    });

    it("lets an ADMIN manage other ADMINs", async () => {
      const { orgId } = await org();
      await createUser(orgId, Role.OWNER);
      const admin = await createUser(orgId, Role.ADMIN);
      const otherAdmin = await createUser(orgId, Role.ADMIN);
      const ctx = await userContext(admin.id, orgId);

      const { after } = await updateMembership(ctx, {
        orgId,
        userId: otherAdmin.id,
        role: Role.MEMBER,
      });
      expect(after.role).toBe(Role.MEMBER);
      await createMembership(ctx, {
        orgId,
        userId: (await createUser()).id,
        role: Role.ADMIN,
      });
    });

    it("lets a project ADMIN grant project roles below OWNER only", async () => {
      const { orgId, projectId } = await org();
      await createUser(orgId, Role.OWNER);
      const projectAdmin = await createUser(orgId, Role.MEMBER);
      await grantProjectRoleDirectly(
        orgId,
        projectId,
        projectAdmin.id,
        Role.ADMIN,
      );
      const target = await createUser(orgId, Role.VIEWER);
      const ctx = await userContext(projectAdmin.id, orgId);
      const apply = (role: Role) =>
        updateMembership(ctx, {
          projectId,
          userId: target.id,
          role,
        });

      expect((await apply(Role.ADMIN)).outcome).toBe("created");
      await expect(apply(Role.OWNER)).rejects.toMatchObject({
        httpCode: 403,
      });
    });

    it("treats overriding an org OWNER's inherited project role as an ownership change", async () => {
      const { orgId, projectId } = await org();
      const owner = await createUser(orgId, Role.OWNER);
      const projectAdmin = await createUser(orgId, Role.MEMBER);
      await grantProjectRoleDirectly(
        orgId,
        projectId,
        projectAdmin.id,
        Role.ADMIN,
      );
      const ctx = await userContext(projectAdmin.id, orgId);

      await expect(
        updateMembership(ctx, {
          projectId,
          userId: owner.id,
          role: Role.VIEWER,
        }),
      ).rejects.toMatchObject({ httpCode: 403 });
    });

    it("lets an org OWNER grant project OWNER despite a lower own project role", async () => {
      const { orgId, projectId } = await org();
      const owner = await createUser(orgId, Role.OWNER);
      await grantProjectRoleDirectly(orgId, projectId, owner.id, Role.VIEWER);
      const target = await createUser(orgId, Role.MEMBER);
      const ctx = await userContext(owner.id, orgId);

      const { after } = await updateMembership(ctx, {
        projectId,
        userId: target.id,
        role: Role.OWNER,
      });
      expect(after?.role).toBe(Role.OWNER);
    });

    it("lets a member remove themselves but nobody else", async () => {
      const { orgId } = await org();
      await createUser(orgId, Role.OWNER);
      const member = await createUser(orgId, Role.MEMBER);
      const other = await createUser(orgId, Role.MEMBER);
      const ctx = await userContext(member.id, orgId);

      await expect(
        deleteMembership(ctx, { orgId, userId: other.id }),
      ).rejects.toMatchObject({ httpCode: 403 });
      expect(await deleteMembership(ctx, { orgId, userId: member.id })).toEqual(
        expect.objectContaining({ userId: member.id }),
      );
    });

    it("keeps one owner when two owners remove each other concurrently", async () => {
      const { orgId } = await org();
      const [a, b] = [
        await createUser(orgId, Role.OWNER),
        await createUser(orgId, Role.OWNER),
      ];
      const [ctxA, ctxB] = [
        await userContext(a.id, orgId),
        await userContext(b.id, orgId),
      ];

      const results = await Promise.allSettled([
        deleteMembership(ctxA, { orgId, userId: b.id }),
        deleteMembership(ctxB, { orgId, userId: a.id }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([
        "fulfilled",
        "rejected",
      ]);
      expect(
        await prisma.organizationMembership.count({
          where: { orgId, role: Role.OWNER },
        }),
      ).toBe(1);
    });

    it("refuses to delete all memberships of a user while they are a last owner", async () => {
      const { orgId } = await org();
      const owner = await createUser(orgId, Role.OWNER);
      const ctx = await resolver.resolveUser({
        userId: owner.id,
        isPlatformAdmin: false,
      });

      const deleteAll = () =>
        prisma.$transaction((tx) =>
          deleteMemberships(tx, ctx, { userId: owner.id }),
        );

      await expect(deleteAll()).rejects.toMatchObject({ httpCode: 403 });
      await createUser(orgId, Role.OWNER);
      await deleteAll();
      expect(
        await prisma.organizationMembership.count({
          where: { userId: owner.id },
        }),
      ).toBe(0);
    });
  });

  describe("outcomes", () => {
    it("reports what each change did and audits only real changes", async () => {
      const { orgId } = await org();
      const owner = await createUser(orgId, Role.OWNER);
      const ctx = await userContext(owner.id, orgId);
      const userId = (await createUser()).id;
      const update = (role: Role) =>
        updateMembership(ctx, { orgId, userId, role });

      expect((await update(Role.MEMBER)).outcome).toBe("created");
      expect((await update(Role.MEMBER)).outcome).toBe("unchanged");
      const ignored = await createMembership(ctx, {
        orgId,
        userId,
        role: Role.NONE,
        ifExists: "ignore",
      });
      expect(ignored).toMatchObject({
        outcome: "unchanged",
        orgMembership: { role: Role.MEMBER },
      });
      await expect(
        createMembership(ctx, { orgId, userId, role: Role.VIEWER }),
      ).rejects.toMatchObject({ httpCode: 400 });
      expect((await update(Role.ADMIN)).outcome).toBe("updated");
      expect(await deleteMembership(ctx, { orgId, userId })).not.toBeNull();
      expect(await deleteMembership(ctx, { orgId, userId })).toBeNull();
      expect((await membershipLogs(orgId)).map((log) => log.action)).toEqual([
        "create",
        "update",
        "delete",
      ]);
    });

    it("adds only a project role to an existing member with org role NONE", async () => {
      const { orgId, projectId } = await org();
      const owner = await createUser(orgId, Role.OWNER);
      const member = await createUser(orgId, Role.VIEWER);
      const ctx = await userContext(owner.id, orgId);

      const created = await createMembership(ctx, {
        orgId,
        userId: member.id,
        role: Role.NONE,
        project: { projectId, role: Role.ADMIN },
      });

      expect(created).toMatchObject({
        outcome: "created",
        orgMembership: { role: Role.VIEWER },
        projectMembership: { role: Role.ADMIN },
      });
    });

    it("refuses project roles without the rbac-project-roles entitlement", async () => {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "STAGING";
      const { orgId, projectId } = await org("Hobby");
      const owner = await createUser(orgId, Role.OWNER);
      const { context } = await apiKeyContext(orgId, owner.id);

      await expect(
        updateMembership(context, {
          projectId,
          userId: owner.id,
          role: Role.VIEWER,
        }),
      ).rejects.toMatchObject({ httpCode: 403 });
      await updateMembership(systemContext("bootstrap"), {
        projectId,
        userId: owner.id,
        role: Role.VIEWER,
      });
    });
  });

  describe("audit actor", () => {
    it("derives the actor from the principal", async () => {
      const { orgId } = await org();
      const owner = await createUser(orgId, Role.OWNER);
      const { context, apiKeyId } = await apiKeyContext(orgId, owner.id);
      const adminKey: AuthorizationContext = {
        ...context,
        principal: { kind: "admin", userId: null },
      };
      const contexts: [AuthorizationContext, object][] = [
        [
          await userContext(owner.id, orgId),
          { type: "USER", userId: owner.id, userOrgRole: Role.OWNER },
        ],
        [context, { type: "API_KEY", apiKeyId }],
        [adminKey, { type: "API_KEY", apiKeyId: "ADMIN_API_KEY" }],
        [
          systemContext("bootstrap"),
          { type: "USER", userId: "system:bootstrap" },
        ],
      ];

      for (const [ctx, actor] of contexts) {
        const userId = (await createUser()).id;
        await updateMembership(ctx, { orgId, userId, role: Role.MEMBER });
        const [log] = await prisma.auditLog.findMany({
          where: {
            orgId,
            resourceType: "orgMembership",
            after: { contains: userId },
          },
        });
        expect(log).toMatchObject({ action: "create", ...actor });
      }
    });

    it("audits invite acceptance as the accepting user", async () => {
      const { orgId, projectId } = await org();
      const owner = await createUser(orgId, Role.OWNER);
      const email = `${randomUUID()}@example.com`;
      const { invitation } = await createMembership(
        await userContext(owner.id, orgId),
        {
          orgId,
          email,
          role: Role.NONE,
          project: { projectId, role: Role.MEMBER },
        },
      );
      const user = await prisma.user.create({ data: { email } });

      await claimInvitations({ userId: user.id, email });

      const logs = await prisma.auditLog.findMany({
        where: { orgId, userId: user.id },
      });
      expect(
        logs.map((log) => `${log.resourceType}.${log.action}`).sort(),
      ).toEqual([
        "membershipInvitation.accept",
        "orgMembership.create",
        "projectMembership.create",
      ]);
      expect(
        logs.find((log) => log.resourceId === invitation!.id),
      ).toBeTruthy();
      expect(
        await prisma.projectMembership.findUnique({
          where: { projectId_userId: { projectId, userId: user.id } },
        }),
      ).toMatchObject({ role: Role.MEMBER });
    });
  });
});
