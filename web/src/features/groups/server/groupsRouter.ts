import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { GroupSource, Role, type prisma } from "@langfuse/shared/src/db";
import {
  GroupId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  type OrganizationScope,
} from "@langfuse/shared/rbac";
import { assignRole } from "@langfuse/shared/rbac/server";
import { projectRoleAccessRights, type ProjectScope } from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  hasProjectAccess,
  throwIfNoProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import {
  hasEntitlement,
  throwIfNoEntitlement,
} from "@/src/features/entitlements/server/hasEntitlement";
import { auditLog } from "@/src/features/audit-logs/auditLog";

// No OWNER (too broad) and no NONE (adds nothing).
const groupRoles = [Role.ADMIN, Role.MEMBER, Role.VIEWER] as const;
const GroupRole = z.enum(groupRoles);
// AI Gateway grants only org permissions, so only org-wide group roles can be AI Gateway.
const OrgGroupRole = z.enum([...groupRoles, Role.AI_GATEWAY]);

const groupRoleAssignmentsSelect = {
  select: { projectId: true, systemRole: true },
} as const;

const roleOf = (assignment: { systemRole: string } | undefined) =>
  (assignment?.systemRole as Role | undefined) ?? null;

function toGroupRoles(
  assignments: { projectId: string | null; systemRole: string }[],
) {
  return {
    orgRole: roleOf(assignments.find((a) => a.projectId === null)),
    projectRoles: assignments
      .filter((a): a is { projectId: string; systemRole: string } =>
        Boolean(a.projectId),
      )
      .map((a) => ({ projectId: a.projectId, role: a.systemRole as Role })),
  };
}

const DisplayName = z.string().trim().min(1).max(256);

type AuthedSession = Session & { user: NonNullable<Session["user"]> };

function throwIfNoOrgGroupAccess(
  session: AuthedSession,
  orgId: string,
  scope: OrganizationScope = "organizationMembers:CUD",
) {
  throwIfNoOrganizationAccess({ session, organizationId: orgId, scope });
  throwIfNoEntitlement({
    entitlement: "admin-api",
    sessionUser: session.user,
    orgId,
  });
}

function throwIfNoProjectGroupAccess(
  session: AuthedSession & { orgId: string },
  projectId: string,
  scope: ProjectScope,
) {
  throwIfNoProjectAccess({ session, projectId, scope });
  throwIfNoEntitlement({
    entitlement: "admin-api",
    sessionUser: session.user,
    orgId: session.orgId,
  });
}

function throwIfGroupNotFound<T>(group: T | null): asserts group is T {
  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
  }
}

const editableGroupSelect = {
  id: true,
  displayName: true,
  externalId: true,
  source: true,
} as const;

/** The IdP owns SCIM groups' name, members and existence (the next sync would undo edits); roles stay editable since IdPs never send them. */
async function findEditableGroupOrThrow(
  db: typeof prisma,
  orgId: string,
  groupId: string,
) {
  const group = await db.group.findFirst({
    where: { id: groupId, orgId },
    select: editableGroupSelect,
  });
  throwIfGroupNotFound(group);
  if (group.source === GroupSource.SCIM) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This group is synced from your identity provider. Change its name and members, or delete it, there.",
    });
  }
  return group;
}

/** Project admins may only grant or revoke a project role whose every permission they hold on the project. */
function throwIfRoleNotCovered(
  session: Session,
  projectId: string,
  role: Role,
) {
  const covered = projectRoleAccessRights[role].every((scope) =>
    hasProjectAccess({ session, projectId, scope }),
  );
  if (!covered) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You cannot grant/edit a role higher than your own",
    });
  }
}

export const groupsRouter = createTRPCRouter({
  orgMembers: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      const memberships = await ctx.prisma.organizationMembership.findMany({
        where: { orgId: input.orgId },
        select: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { user: { email: "asc" } },
      });
      return memberships.map(({ user }) => user);
    }),

  create: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), displayName: DisplayName }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      const group = await ctx.prisma.group.create({
        data: {
          orgId: input.orgId,
          displayName: input.displayName,
          source: GroupSource.MANUAL,
        },
        select: { id: true, displayName: true, source: true },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "group",
        resourceId: group.id,
        action: "create",
        after: group,
      });
      return group;
    }),

  rename: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        groupId: z.string(),
        displayName: DisplayName,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      const before = await findEditableGroupOrThrow(
        ctx.prisma,
        input.orgId,
        input.groupId,
      );
      const after = await ctx.prisma.group.update({
        where: { id: before.id },
        data: { displayName: input.displayName },
        select: editableGroupSelect,
      });
      await auditLog({
        session: ctx.session,
        resourceType: "group",
        resourceId: before.id,
        action: "update",
        before,
        after,
      });
      return after;
    }),

  /** Memberships and role assignments go by FK cascade; SCIM groups are deleted by the IdP. */
  delete: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), groupId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      const group = await findEditableGroupOrThrow(
        ctx.prisma,
        input.orgId,
        input.groupId,
      );
      await ctx.prisma.group.delete({ where: { id: group.id } });
      await auditLog({
        session: ctx.session,
        resourceType: "group",
        resourceId: group.id,
        action: "delete",
        before: group,
      });
    }),

  /** Group roles are capped at ADMIN and this needs organizationMembers:CUD, so it grants no more than the caller could directly. */
  addMembers: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        groupId: z.string(),
        userIds: z.array(z.string()).min(1).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      const group = await findEditableGroupOrThrow(
        ctx.prisma,
        input.orgId,
        input.groupId,
      );
      const userIds = [...new Set(input.userIds)];
      const memberships = await ctx.prisma.organizationMembership.findMany({
        where: { orgId: input.orgId, userId: { in: userIds } },
        select: { id: true, userId: true },
      });
      if (memberships.length !== userIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Every user must be a member of the organization",
        });
      }
      await ctx.prisma.groupMembership.createMany({
        data: memberships.map((m) => ({
          groupId: group.id,
          orgMembershipId: m.id,
        })),
        skipDuplicates: true,
      });
      await auditLog({
        session: ctx.session,
        resourceType: "group",
        resourceId: group.id,
        action: "addMembers",
        after: { userIds },
      });
    }),

  removeMember: protectedOrganizationProcedure
    .input(
      z.object({ orgId: z.string(), groupId: z.string(), userId: z.string() }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      const group = await findEditableGroupOrThrow(
        ctx.prisma,
        input.orgId,
        input.groupId,
      );
      await ctx.prisma.groupMembership.deleteMany({
        where: {
          groupId: group.id,
          organizationMembership: { userId: input.userId },
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "group",
        resourceId: group.id,
        action: "removeMember",
        before: { userId: input.userId },
      });
    }),

  list: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(
        ctx.session,
        input.orgId,
        "organizationMembers:read",
      );

      const groups = await ctx.prisma.group.findMany({
        where: { orgId: input.orgId },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        include: {
          roleAssignments: groupRoleAssignmentsSelect,
          members: {
            orderBy: { createdAt: "asc" },
            include: {
              organizationMembership: {
                select: {
                  role: true,
                  user: {
                    select: { id: true, name: true, email: true, image: true },
                  },
                  groupMemberships: {
                    select: {
                      group: {
                        select: {
                          id: true,
                          displayName: true,
                          roleAssignments: {
                            where: { projectId: null },
                            select: { systemRole: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      return groups.map((group) => ({
        id: group.id,
        displayName: group.displayName,
        externalId: group.externalId,
        source: group.source,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        ...toGroupRoles(group.roleAssignments),
        members: group.members.map(({ organizationMembership, createdAt }) => {
          const groupOrgRoles = organizationMembership.groupMemberships.flatMap(
            ({ group }) =>
              group.roleAssignments.map((assignment) => ({
                groupId: group.id,
                groupName: group.displayName,
                role: assignment.systemRole as Role,
              })),
          );
          return {
            userId: organizationMembership.user.id,
            name: organizationMembership.user.name,
            email: organizationMembership.user.email,
            image: organizationMembership.user.image,
            directOrgRole: organizationMembership.role,
            groupOrgRoles,
            addedAt: createdAt,
          };
        }),
      }));
    }),

  setRoleAssignments: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        groupId: z.string(),
        orgRole: OrgGroupRole.nullable(),
        projectRoles: z
          .array(z.object({ projectId: z.string(), role: GroupRole }))
          .refine(
            (roles) =>
              new Set(roles.map((r) => r.projectId)).size === roles.length,
            "Each project can only be listed once",
          ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      if (
        input.projectRoles.length > 0 &&
        !hasEntitlement({
          entitlement: "rbac-project-roles",
          sessionUser: ctx.session.user,
          orgId: input.orgId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Organization does not have the required entitlement to set project roles",
        });
      }

      const group = await ctx.prisma.group.findFirst({
        where: { id: input.groupId, orgId: input.orgId },
        include: { roleAssignments: groupRoleAssignmentsSelect },
      });
      throwIfGroupNotFound(group);

      const tenantId = OrganizationId(input.orgId);
      const principalId = GroupId(group.id);
      await ctx.prisma.$transaction(async (tx) => {
        await tx.roleAssignment.deleteMany({ where: { groupId: group.id } });
        if (input.orgRole) {
          await assignRole(tx, {
            tenantId,
            ownerId: tenantId,
            principalId,
            roleId: SystemRoleId(input.orgRole),
            tags: [],
          });
        }
        for (const { projectId, role } of input.projectRoles) {
          // assignRole rejects projects outside the organization.
          await assignRole(tx, {
            tenantId,
            ownerId: ProjectId(projectId),
            principalId,
            roleId: SystemRoleId(role),
            tags: [],
          });
        }
      });

      const after = {
        orgRole: input.orgRole,
        projectRoles: input.projectRoles,
      };
      await auditLog({
        session: ctx.session,
        resourceType: "group",
        resourceId: group.id,
        action: "updateRoleAssignments",
        before: toGroupRoles(group.roleAssignments),
        after,
      });
      return after;
    }),

  setOrgRole: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        groupId: z.string(),
        role: OrgGroupRole.nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      const group = await ctx.prisma.group.findFirst({
        where: { id: input.groupId, orgId: input.orgId },
        select: {
          id: true,
          roleAssignments: {
            where: { projectId: null },
            select: { systemRole: true },
          },
        },
      });
      throwIfGroupNotFound(group);
      const before = roleOf(group.roleAssignments[0]);

      const tenantId = OrganizationId(input.orgId);
      await ctx.prisma.$transaction(async (tx) => {
        await tx.roleAssignment.deleteMany({
          where: { groupId: group.id, projectId: null },
        });
        if (input.role) {
          await assignRole(tx, {
            tenantId,
            ownerId: tenantId,
            principalId: GroupId(group.id),
            roleId: SystemRoleId(input.role),
            tags: [],
          });
        }
      });

      await auditLog({
        session: ctx.session,
        resourceType: "group",
        resourceId: group.id,
        action: "updateOrgRole",
        before: { role: before },
        after: { role: input.role },
      });
      return { role: input.role };
    }),

  projectList: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectGroupAccess(
        ctx.session,
        input.projectId,
        "projectMembers:read",
      );

      const groups = await ctx.prisma.group.findMany({
        where: { orgId: ctx.session.orgId },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        select: {
          id: true,
          displayName: true,
          externalId: true,
          source: true,
          _count: { select: { members: true } },
          members: {
            orderBy: { createdAt: "asc" },
            select: {
              organizationMembership: {
                select: {
                  user: {
                    select: { id: true, name: true, email: true, image: true },
                  },
                },
              },
            },
          },
          roleAssignments: {
            where: {
              OR: [{ projectId: null }, { projectId: input.projectId }],
            },
            select: { projectId: true, systemRole: true },
          },
        },
      });

      return groups.map((group) => ({
        id: group.id,
        displayName: group.displayName,
        externalId: group.externalId,
        source: group.source,
        memberCount: group._count.members,
        members: group.members.map(({ organizationMembership: { user } }) => ({
          userId: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        })),
        orgRole: roleOf(
          group.roleAssignments.find((a) => a.projectId === null),
        ),
        projectRole: roleOf(
          group.roleAssignments.find((a) => a.projectId === input.projectId),
        ),
      }));
    }),

  setProjectRole: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        groupId: z.string(),
        role: GroupRole.nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectGroupAccess(
        ctx.session,
        input.projectId,
        "projectMembers:CUD",
      );
      throwIfNoEntitlement({
        entitlement: "rbac-project-roles",
        sessionUser: ctx.session.user,
        orgId: ctx.session.orgId,
      });

      const group = await ctx.prisma.group.findFirst({
        where: { id: input.groupId, orgId: ctx.session.orgId },
        select: {
          id: true,
          roleAssignments: {
            where: { projectId: input.projectId },
            select: { systemRole: true },
          },
        },
      });
      throwIfGroupNotFound(group);
      const before = roleOf(group.roleAssignments[0]);

      if (before) throwIfRoleNotCovered(ctx.session, input.projectId, before);
      if (input.role) {
        throwIfRoleNotCovered(ctx.session, input.projectId, input.role);
      }

      const tenantId = OrganizationId(ctx.session.orgId);
      await ctx.prisma.$transaction(async (tx) => {
        await tx.roleAssignment.deleteMany({
          where: { groupId: group.id, projectId: input.projectId },
        });
        if (input.role) {
          await assignRole(tx, {
            tenantId,
            ownerId: ProjectId(input.projectId),
            principalId: GroupId(group.id),
            roleId: SystemRoleId(input.role),
            tags: [],
          });
        }
      });

      await auditLog({
        session: ctx.session,
        resourceType: "group",
        resourceId: group.id,
        action: "updateProjectRole",
        before: { projectId: input.projectId, role: before },
        after: { projectId: input.projectId, role: input.role },
      });
      return { projectId: input.projectId, role: input.role };
    }),
});
