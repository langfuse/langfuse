import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { GroupSource, Role, type prisma } from "@langfuse/shared/src/db";
import {
  GroupId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
} from "@langfuse/shared/rbac";
import { assignRole } from "@langfuse/shared/rbac/server";
import { projectRoleAccessRights } from "@langfuse/shared";
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
const GroupRole = z.enum([Role.ADMIN, Role.MEMBER, Role.VIEWER]);

const groupRoleAssignmentsSelect = {
  select: { projectId: true, systemRole: true },
} as const;

function toGroupRoles(
  assignments: { projectId: string | null; systemRole: string }[],
) {
  return {
    orgRole:
      (assignments.find((a) => a.projectId === null)?.systemRole as
        | Role
        | undefined) ?? null,
    projectRoles: assignments
      .filter((a): a is { projectId: string; systemRole: string } =>
        Boolean(a.projectId),
      )
      .map((a) => ({ projectId: a.projectId, role: a.systemRole as Role })),
  };
}

const DisplayName = z.string().trim().min(1).max(256);

/** Guards shared by every org-level group write. */
function throwIfCannotManageGroups(
  session: Session & { user: NonNullable<Session["user"]> },
  orgId: string,
) {
  throwIfNoOrganizationAccess({
    session,
    organizationId: orgId,
    scope: "organizationMembers:CUD",
  });
  throwIfNoEntitlement({
    entitlement: "admin-api",
    sessionUser: session.user,
    orgId,
  });
}

async function findGroupOrThrow(
  db: typeof prisma,
  orgId: string,
  groupId: string,
) {
  const group = await db.group.findFirst({
    where: { id: groupId, orgId },
    select: { id: true, displayName: true, externalId: true, source: true },
  });
  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
  }
  return group;
}

/**
 * Project admins may only hand out (or take away) a project role whose every
 * permission they hold on the project themselves, directly or through groups.
 */
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
  /** Org members to pick from when adding group members. */
  orgMembers: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfCannotManageGroups(ctx.session, input.orgId);
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
      throwIfCannotManageGroups(ctx.session, input.orgId);
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
      throwIfCannotManageGroups(ctx.session, input.orgId);
      const before = await findGroupOrThrow(
        ctx.prisma,
        input.orgId,
        input.groupId,
      );
      const after = await ctx.prisma.group.update({
        where: { id: before.id },
        data: { displayName: input.displayName },
        select: { id: true, displayName: true, externalId: true, source: true },
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

  /** Deletes the group with its memberships and role assignments (FK cascade). */
  delete: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), groupId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfCannotManageGroups(ctx.session, input.orgId);
      const group = await findGroupOrThrow(
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

  /**
   * Adds org members to a group. Members gain the group's roles, which are
   * capped at ADMIN, and only org admins/owners (organizationMembers:CUD) can
   * call this, so it cannot hand out more than the caller could grant directly.
   */
  addMembers: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        groupId: z.string(),
        userIds: z.array(z.string()).min(1).max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfCannotManageGroups(ctx.session, input.orgId);
      const group = await findGroupOrThrow(
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
      throwIfCannotManageGroups(ctx.session, input.orgId);
      const group = await findGroupOrThrow(
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
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:read",
      });
      throwIfNoEntitlement({
        entitlement: "admin-api",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });

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
                  user: { select: { id: true, name: true, email: true } },
                  // Org-wide roles from all of the member's groups
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
            directOrgRole: organizationMembership.role,
            groupOrgRoles,
            addedAt: createdAt,
          };
        }),
      }));
    }),

  /** Replaces all role assignments of a group. */
  setRoleAssignments: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        groupId: z.string(),
        orgRole: GroupRole.nullable(),
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
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:CUD",
      });
      throwIfNoEntitlement({
        entitlement: "admin-api",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });
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
      if (!group) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      }

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

  /** Sets or removes (role: null) one group's org-wide role; project roles stay untouched. */
  setOrgRole: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        groupId: z.string(),
        role: GroupRole.nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfCannotManageGroups(ctx.session, input.orgId);
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
      if (!group) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      }
      const before =
        (group.roleAssignments[0]?.systemRole as Role | undefined) ?? null;

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

  /** Every group of the project's org, with its role on this project and its org-wide role. */
  projectList: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectMembers:read",
      });
      throwIfNoEntitlement({
        entitlement: "admin-api",
        sessionUser: ctx.session.user,
        orgId: ctx.session.orgId,
      });

      const groups = await ctx.prisma.group.findMany({
        where: { orgId: ctx.session.orgId },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        select: {
          id: true,
          displayName: true,
          externalId: true,
          source: true,
          _count: { select: { members: true } },
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
        orgRole:
          (group.roleAssignments.find((a) => a.projectId === null)
            ?.systemRole as Role | undefined) ?? null,
        projectRole:
          (group.roleAssignments.find((a) => a.projectId === input.projectId)
            ?.systemRole as Role | undefined) ?? null,
      }));
    }),

  /** Sets or removes (role: null) one group's role on this project; other grants stay untouched. */
  setProjectRole: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        groupId: z.string(),
        role: GroupRole.nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectMembers:CUD",
      });
      throwIfNoEntitlement({
        entitlement: "admin-api",
        sessionUser: ctx.session.user,
        orgId: ctx.session.orgId,
      });
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
      if (!group) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      }
      const before =
        (group.roleAssignments[0]?.systemRole as Role | undefined) ?? null;

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
