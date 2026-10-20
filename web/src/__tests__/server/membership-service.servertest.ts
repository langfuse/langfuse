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
  createInvitation,
} from "@/src/features/memberships/server/invitationService";
import {
  MembershipExistsError,
  SeatLimitExceededError,
} from "@/src/features/memberships/server/membershipErrors";
import { inMembershipTransaction as run } from "@/src/features/memberships/server/membershipTransaction";
import {
  createOrgMembership,
  deleteOrgMembership,
  deleteOrgMemberships,
  updateOrgMembership,
} from "@/src/features/memberships/server/orgMembershipService";
import {
  createProjectMembership,
  updateProjectMembership,
} from "@/src/features/memberships/server/projectMembershipService";

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
        run((tx) =>
          createOrgMembership(tx, ctx, {
            orgId,
            userId: first.id,
            role: Role.MEMBER,
          }),
        ),
        run((tx) =>
          createOrgMembership(tx, ctx, {
            orgId,
            userId: second.id,
            role: Role.MEMBER,
          }),
        ),
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
      await run((tx) =>
        createInvitation(tx, context, {
          orgId,
          email: `${randomUUID()}@example.com`,
          orgRole: Role.MEMBER,
          invitedByUserId: owner.id,
        }),
      );
      const user = await createUser();

      await expect(
        run((tx) =>
          updateOrgMembership(tx, context, {
            orgId,
            userId: user.id,
            role: Role.MEMBER,
          }),
        ),
      ).rejects.toBeInstanceOf(SeatLimitExceededError);
    });

    it("lets system principals and invite acceptance past the limit", async () => {
      const { orgId } = await org("Hobby");
      const owner = await createUser(orgId, Role.OWNER);
      const invitee = `${randomUUID()}@example.com`;
      const ownerCtx = await userContext(owner.id, orgId);
      await run((tx) =>
        createInvitation(tx, ownerCtx, {
          orgId,
          email: invitee,
          orgRole: Role.MEMBER,
          invitedByUserId: owner.id,
        }),
      );
      const userId = (await createUser()).id;
      await run((tx) =>
        updateOrgMembership(tx, systemContext("signupDefaults"), {
          orgId,
          userId,
          role: Role.VIEWER,
        }),
      );
      const accepting = await prisma.user.create({ data: { email: invitee } });

      await run((tx) =>
        claimInvitations(tx, { userId: accepting.id, email: invitee }),
      );

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

      const userId = (await createUser()).id;
      await expect(
        run((tx) =>
          createOrgMembership(tx, ctx, { orgId, userId, role: Role.OWNER }),
        ),
      ).rejects.toMatchObject({ httpCode: 403 });
      await expect(
        run((tx) =>
          updateOrgMembership(tx, ctx, {
            orgId,
            userId: owner.id,
            role: Role.MEMBER,
          }),
        ),
      ).rejects.toMatchObject({ httpCode: 403 });
      await expect(
        run((tx) => deleteOrgMembership(tx, ctx, { orgId, userId: owner.id })),
      ).rejects.toMatchObject({ httpCode: 403 });
      expect(await membershipLogs(orgId)).toEqual([]);
    });

    it("lets an ADMIN manage other ADMINs", async () => {
      const { orgId } = await org();
      await createUser(orgId, Role.OWNER);
      const admin = await createUser(orgId, Role.ADMIN);
      const otherAdmin = await createUser(orgId, Role.ADMIN);
      const ctx = await userContext(admin.id, orgId);

      const { after } = await run((tx) =>
        updateOrgMembership(tx, ctx, {
          orgId,
          userId: otherAdmin.id,
          role: Role.MEMBER,
        }),
      );
      expect(after.role).toBe(Role.MEMBER);
      const userId = (await createUser()).id;
      await run((tx) =>
        createOrgMembership(tx, ctx, { orgId, userId, role: Role.ADMIN }),
      );
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
        run((tx) =>
          updateProjectMembership(tx, ctx, {
            projectId,
            userId: target.id,
            role,
          }),
        );

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
        run((tx) =>
          updateProjectMembership(tx, ctx, {
            projectId,
            userId: owner.id,
            role: Role.VIEWER,
          }),
        ),
      ).rejects.toMatchObject({ httpCode: 403 });
    });

    it("lets an org OWNER grant project OWNER despite a lower own project role", async () => {
      const { orgId, projectId } = await org();
      const owner = await createUser(orgId, Role.OWNER);
      await grantProjectRoleDirectly(orgId, projectId, owner.id, Role.VIEWER);
      const target = await createUser(orgId, Role.MEMBER);
      const ctx = await userContext(owner.id, orgId);

      const { after } = await run((tx) =>
        updateProjectMembership(tx, ctx, {
          projectId,
          userId: target.id,
          role: Role.OWNER,
        }),
      );
      expect(after?.role).toBe(Role.OWNER);
    });

    it("lets a member remove themselves but nobody else", async () => {
      const { orgId } = await org();
      await createUser(orgId, Role.OWNER);
      const member = await createUser(orgId, Role.MEMBER);
      const other = await createUser(orgId, Role.MEMBER);
      const ctx = await userContext(member.id, orgId);

      await expect(
        run((tx) => deleteOrgMembership(tx, ctx, { orgId, userId: other.id })),
      ).rejects.toMatchObject({ httpCode: 403 });
      expect(
        await run((tx) =>
          deleteOrgMembership(tx, ctx, { orgId, userId: member.id }),
        ),
      ).toEqual(expect.objectContaining({ userId: member.id }));
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
        run((tx) => deleteOrgMembership(tx, ctxA, { orgId, userId: b.id })),
        run((tx) => deleteOrgMembership(tx, ctxB, { orgId, userId: a.id })),
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
        run((tx) => deleteOrgMemberships(tx, ctx, { userId: owner.id }));

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
        run((tx) => updateOrgMembership(tx, ctx, { orgId, userId, role }));
      const remove = () =>
        run((tx) => deleteOrgMembership(tx, ctx, { orgId, userId }));

      expect((await update(Role.MEMBER)).outcome).toBe("created");
      expect((await update(Role.MEMBER)).outcome).toBe("unchanged");
      const duplicate = run((tx) =>
        createOrgMembership(tx, ctx, { orgId, userId, role: Role.VIEWER }),
      );
      await expect(duplicate).rejects.toBeInstanceOf(MembershipExistsError);
      await expect(duplicate).rejects.toMatchObject({ httpCode: 400 });
      expect((await update(Role.ADMIN)).outcome).toBe("updated");
      expect(await remove()).not.toBeNull();
      expect(await remove()).toBeNull();
      expect((await membershipLogs(orgId)).map((log) => log.action)).toEqual([
        "create",
        "update",
        "delete",
      ]);
    });

    it("adds a project role, joining the org with NONE only when not yet a member", async () => {
      const { orgId, projectId } = await org();
      const owner = await createUser(orgId, Role.OWNER);
      const member = await createUser(orgId, Role.VIEWER);
      const outsider = await createUser();
      const ctx = await userContext(owner.id, orgId);
      const grant = (userId: string) =>
        run((tx) =>
          createProjectMembership(tx, ctx, {
            projectId,
            userId,
            role: Role.ADMIN,
          }),
        );
      const orgRole = async (userId: string) =>
        (
          await prisma.organizationMembership.findUnique({
            where: { orgId_userId: { orgId, userId } },
          })
        )?.role;

      expect(await grant(member.id)).toMatchObject({ role: Role.ADMIN });
      expect(await grant(outsider.id)).toMatchObject({ role: Role.ADMIN });
      expect(await orgRole(member.id)).toBe(Role.VIEWER);
      expect(await orgRole(outsider.id)).toBe(Role.NONE);
      await expect(grant(member.id)).rejects.toBeInstanceOf(
        MembershipExistsError,
      );
    });

    it("rolls back every write in the transaction when a later one fails", async () => {
      const { orgId, projectId } = await org();
      await createUser(orgId, Role.OWNER);
      const orgAdmin = await createUser(orgId, Role.ADMIN);
      const userId = (await createUser()).id;
      const ctx = await userContext(orgAdmin.id, orgId);

      await expect(
        run(async (tx) => {
          await createOrgMembership(tx, ctx, {
            orgId,
            userId,
            role: Role.MEMBER,
          });
          await createProjectMembership(tx, ctx, {
            projectId,
            userId,
            role: Role.OWNER,
          });
        }),
      ).rejects.toMatchObject({ httpCode: 403 });
      expect(
        await prisma.organizationMembership.count({ where: { orgId, userId } }),
      ).toBe(0);
      expect(await membershipLogs(orgId)).toEqual([]);
    });

    it("refuses project roles without the rbac-project-roles entitlement", async () => {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "STAGING";
      const { orgId, projectId } = await org("Hobby");
      const owner = await createUser(orgId, Role.OWNER);
      const { context } = await apiKeyContext(orgId, owner.id);

      const grant = (ctx: AuthorizationContext) =>
        run((tx) =>
          updateProjectMembership(tx, ctx, {
            projectId,
            userId: owner.id,
            role: Role.VIEWER,
          }),
        );

      await expect(grant(context)).rejects.toMatchObject({ httpCode: 403 });
      await grant(systemContext("bootstrap"));
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
        await run((tx) =>
          updateOrgMembership(tx, ctx, { orgId, userId, role: Role.MEMBER }),
        );
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
      const ownerCtx = await userContext(owner.id, orgId);
      const invitation = await run((tx) =>
        createInvitation(tx, ownerCtx, {
          orgId,
          email,
          orgRole: Role.NONE,
          projectId,
          projectRole: Role.MEMBER,
          invitedByUserId: owner.id,
        }),
      );
      const user = await prisma.user.create({ data: { email } });

      await run((tx) => claimInvitations(tx, { userId: user.id, email }));

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
      expect(logs.find((log) => log.resourceId === invitation.id)).toBeTruthy();
      expect(
        await prisma.projectMembership.findUnique({
          where: { projectId_userId: { projectId, userId: user.id } },
        }),
      ).toMatchObject({ role: Role.MEMBER });
    });
  });
});
