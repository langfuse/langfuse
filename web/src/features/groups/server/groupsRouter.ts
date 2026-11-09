import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { Role } from "@langfuse/shared/src/db";
import {
  GroupId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
} from "@langfuse/shared/rbac";
import { assignRole } from "@langfuse/shared/rbac/server";
import { resolveOrganizationRole } from "@langfuse/shared/src/server";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  hasEntitlement,
  throwIfNoEntitlement,
} from "@/src/features/entitlements/server/hasEntitlement";
import { auditLog } from "@/src/features/audit-logs/auditLog";

// Groups never grant OWNER, and NONE adds nothing to a role that only ever adds.
const GroupRole = z.enum([Role.ADMIN, Role.MEMBER, Role.VIEWER]);

const groupRoleAssignmentsSelect = {
  select: { projectId: true, systemRole: true },
} as const;

/** Splits a group's stored assignments into its org-wide role and per-project roles. */
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

// Groups and their members are owned by the IdP (SCIM). In Langfuse, org admins
// only map a group to roles; those roles add to what its members hold directly.
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
                  // Org-wide roles from all of the member's groups, not only this one.
                  groupMemberships: {
                    select: {
                      group: {
                        select: {
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
          const groupRoles = organizationMembership.groupMemberships.flatMap(
            ({ group }) =>
              group.roleAssignments.map((assignment) => ({
                projectId: null,
                role: assignment.systemRole as Role,
              })),
          );
          // Highest org-wide role across all of the member's groups; null if none maps one.
          const groupOrgRole = resolveOrganizationRole({
            orgMembershipRole: Role.NONE,
            groupRoles,
          });
          return {
            userId: organizationMembership.user.id,
            name: organizationMembership.user.name,
            email: organizationMembership.user.email,
            directOrgRole: organizationMembership.role,
            groupOrgRole: groupOrgRole === Role.NONE ? null : groupOrgRole,
            effectiveOrgRole: resolveOrganizationRole({
              orgMembershipRole: organizationMembership.role,
              groupRoles,
            }),
            addedAt: createdAt,
          };
        }),
      }));
    }),

  /** Replaces all role assignments of a group: one optional org-wide role plus per-project roles. */
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
});
