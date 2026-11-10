import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { Role } from "@langfuse/shared/src/db";
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
