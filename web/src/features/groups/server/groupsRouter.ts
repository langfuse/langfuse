import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import {
  GroupSource,
  Role,
  type Prisma,
  type prisma,
} from "@langfuse/shared/src/db";
import { type OrganizationScope, groupRoleGrants } from "@langfuse/shared/rbac";
import {
  hasProjectAccessByRole,
  projectRoleAccessRights,
  type ProjectScope,
} from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  hasOrganizationAccess,
  throwIfNoOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  hasProjectAccess,
  throwIfNoProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import {
  hasEntitlement,
  throwIfNoEntitlement,
} from "@/src/features/entitlements/server/hasEntitlement";
import {
  addGroupMembers,
  deleteGroup,
  removeGroupMembers,
  replaceGroupRoles,
  roleOf,
  setGroupRole,
  toGroupRoles,
} from "@/src/features/groups/server/groupService";
import { auditLog } from "@/src/features/audit-logs/auditLog";

// No OWNER (too broad) and no NONE (adds nothing).
const groupRoles = [Role.ADMIN, Role.MEMBER, Role.VIEWER] as const;
const GroupRole = z.enum(groupRoles);
// AI Gateway grants only org permissions, so only org-wide group roles can be AI Gateway.
const OrgGroupRole = z.enum([...groupRoles, Role.AI_GATEWAY]);

const groupRoleAssignmentsSelect = {
  select: { projectId: true, systemRole: true },
} as const;

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

/** getProjectGroups lists a project's groups with their members and roles there: every group of the org, or only those with access to the project. */
async function getProjectGroups(
  db: typeof prisma,
  query: { orgId: string; projectId: string },
  showAllOrgGroups = true,
) {
  const conditions: Prisma.GroupWhereInput[] = [];

  // restrict to only groups with a role in the project if showAllOrgGroups is false
  if (!showAllOrgGroups) {
    const rolesWithoutProjectRead = Object.values(Role).filter(
      (role) => !hasProjectAccessByRole({ role, scope: "project:read" }),
    );
    conditions.push({
      // either org level role or project level role
      roleAssignments: {
        some: {
          OR: [{ projectId: null }, { projectId: query.projectId }],
          systemRole: { notIn: rolesWithoutProjectRead },
        },
      },
    });
  }

  const groups = await db.group.findMany({
    where: { orgId: query.orgId, AND: conditions },
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
          OR: [{ projectId: null }, { projectId: query.projectId }],
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
    orgRole: roleOf(group.roleAssignments.find((a) => a.projectId === null)),
    projectRole: roleOf(
      group.roleAssignments.find((a) => a.projectId === query.projectId),
    ),
  }));
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
      return ctx.prisma.$transaction(async (tx) => {
        const group = await tx.group.create({
          data: {
            orgId: input.orgId,
            displayName: input.displayName,
            source: GroupSource.MANUAL,
          },
          select: { id: true, displayName: true, source: true },
        });
        await auditLog(
          {
            session: ctx.session,
            resourceType: "group",
            resourceId: group.id,
            action: "create",
            after: group,
          },
          tx,
        );
        return group;
      });
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
      return ctx.prisma.$transaction(async (tx) => {
        const after = await tx.group.update({
          where: { id: before.id },
          data: { displayName: input.displayName },
          select: editableGroupSelect,
        });
        await auditLog(
          {
            session: ctx.session,
            resourceType: "group",
            resourceId: before.id,
            action: "update",
            before,
            after,
          },
          tx,
        );
        return after;
      });
    }),

  delete: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), groupId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      const group = await findEditableGroupOrThrow(
        ctx.prisma,
        input.orgId,
        input.groupId,
      );
      await ctx.prisma.$transaction(async (tx) => {
        const roles = await deleteGroup(tx, { id: group.id });
        await auditLog(
          {
            session: ctx.session,
            resourceType: "group",
            resourceId: group.id,
            action: "delete",
            before: { ...group, ...roles },
          },
          tx,
        );
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
      await ctx.prisma.$transaction(async (tx) => {
        await addGroupMembers(tx, {
          orgId: input.orgId,
          groupId: group.id,
          userIds,
        });
        await auditLog(
          {
            session: ctx.session,
            resourceType: "group",
            resourceId: group.id,
            action: "addMembers",
            after: { userIds },
          },
          tx,
        );
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
      await ctx.prisma.$transaction(async (tx) => {
        await removeGroupMembers(tx, {
          groupId: group.id,
          userIds: [input.userId],
        });
        await auditLog(
          {
            session: ctx.session,
            resourceType: "group",
            resourceId: group.id,
            action: "removeMember",
            before: { userId: input.userId },
          },
          tx,
        );
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
          const groupOrgRoles = groupRoleGrants(
            organizationMembership.groupMemberships.map(({ group }) => group),
          ).map(({ group, role }) => ({
            groupId: group.id,
            groupName: group.displayName,
            role,
          }));
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

      const after = {
        orgRole: input.orgRole,
        projectRoles: input.projectRoles,
      };
      await ctx.prisma.$transaction(async (tx) => {
        await replaceGroupRoles(tx, {
          orgId: input.orgId,
          groupId: group.id,
          ...after,
        });
        await auditLog(
          {
            session: ctx.session,
            resourceType: "group",
            resourceId: group.id,
            action: "updateRoleAssignments",
            before: toGroupRoles(group.roleAssignments),
            after,
          },
          tx,
        );
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

      await ctx.prisma.$transaction(async (tx) => {
        await setGroupRole(tx, {
          orgId: input.orgId,
          groupId: group.id,
          projectId: null,
          role: input.role,
        });
        await auditLog(
          {
            session: ctx.session,
            resourceType: "group",
            resourceId: group.id,
            action: "updateOrgRole",
            before: { role: before },
            after: { role: input.role },
          },
          tx,
        );
      });
      return { role: input.role };
    }),

  projectList: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const orgId = ctx.session.orgId;
      const orgAccess = hasOrganizationAccess({
        session: ctx.session,
        organizationId: orgId,
        scope: "organizationMembers:read",
      });

      const projectAccess = hasProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectMembers:read",
      });

      if (!orgAccess && !projectAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have the required access rights",
        });
      }
      throwIfNoEntitlement({
        entitlement: "admin-api",
        sessionUser: ctx.session.user,
        orgId,
      });

      return getProjectGroups(
        ctx.prisma,
        { orgId, projectId: input.projectId },
        orgAccess,
      );
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

      await ctx.prisma.$transaction(async (tx) => {
        await setGroupRole(tx, {
          orgId: ctx.session.orgId,
          groupId: group.id,
          projectId: input.projectId,
          role: input.role,
        });
        await auditLog(
          {
            session: ctx.session,
            resourceType: "group",
            resourceId: group.id,
            action: "updateProjectRole",
            before: { projectId: input.projectId, role: before },
            after: { projectId: input.projectId, role: input.role },
          },
          tx,
        );
      });
      return { projectId: input.projectId, role: input.role };
    }),
});
