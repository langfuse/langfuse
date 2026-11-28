import * as z from "zod";
import { type Session } from "next-auth";
import { Role } from "@langfuse/shared/src/db";
import { type OrganizationScope } from "@langfuse/shared/rbac";
import { ForbiddenError, type ProjectScope } from "@langfuse/shared";
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
  throwIfNoEntitlement,
  throwIfNoEntitlements,
} from "@/src/features/entitlements/server/hasEntitlement";
import {
  addMembersToGroup,
  createGroup,
  deleteEditableGroup,
  listGroups,
  listOrgMembersForGroups,
  listProjectGroups,
  removeMemberFromGroup,
  renameGroup,
  setGroupOrgRole,
  setGroupProjectRole,
} from "@/src/ee/features/groups/server/groups";

// This router only gates: every procedure checks access and the entitlement, then hands over
// to the implementation in web/src/ee/features/groups/server.

// No OWNER (too broad) and no NONE (adds nothing).
const groupRoles = [Role.ADMIN, Role.MEMBER, Role.VIEWER] as const;
const GroupRole = z.enum(groupRoles);
// AI Gateway grants only org permissions, so only org-wide group roles can be AI Gateway.
const OrgGroupRole = z.enum([...groupRoles, Role.AI_GATEWAY]);

const DisplayName = z.string().trim().min(1).max(256);

type AuthedSession = Session & { user: NonNullable<Session["user"]> };

function throwIfNoOrgGroupAccess(
  session: AuthedSession,
  orgId: string,
  scope: OrganizationScope = "groups:CUD",
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
  throwIfNoEntitlements({
    entitlements: ["admin-api", "rbac-project-roles"],
    sessionUser: session.user,
    orgId: session.orgId,
  });
}

export const groupsRouter = createTRPCRouter({
  orgMembers: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      return listOrgMembersForGroups(ctx.prisma, input.orgId);
    }),

  create: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), displayName: DisplayName }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      return createGroup(ctx.prisma, ctx.session, input);
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
      return renameGroup(ctx.prisma, ctx.session, input);
    }),

  delete: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), groupId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      await deleteEditableGroup(ctx.prisma, ctx.session, input);
    }),

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
      await addMembersToGroup(ctx.prisma, ctx.session, input);
    }),

  removeMember: protectedOrganizationProcedure
    .input(
      z.object({ orgId: z.string(), groupId: z.string(), userId: z.string() }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId);
      await removeMemberFromGroup(ctx.prisma, ctx.session, input);
    }),

  list: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoOrgGroupAccess(ctx.session, input.orgId, "groups:read");
      return listGroups(ctx.prisma, input.orgId);
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
      return setGroupOrgRole(ctx.prisma, ctx.session, input);
    }),

  projectList: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const orgId = ctx.session.orgId;
      const orgAccess = hasOrganizationAccess({
        session: ctx.session,
        organizationId: orgId,
        scope: "groups:read",
      });

      const projectAccess = hasProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "projectGroups:read",
      });

      if (!orgAccess && !projectAccess) {
        throw new ForbiddenError("You do not have the required access rights");
      }
      throwIfNoEntitlement({
        entitlement: "admin-api",
        sessionUser: ctx.session.user,
        orgId,
      });

      return listProjectGroups(
        ctx.prisma,
        { orgId, projectId: input.projectId },
        orgAccess,
      );
    }),

  /** The implementation also rejects roles the caller does not fully hold on the project. */
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
        "projectGroups:CUD",
      );
      return setGroupProjectRole(ctx.prisma, ctx.session, input);
    }),
});
