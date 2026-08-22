import { prisma } from "@langfuse/shared/src/db";
import { Role } from "@langfuse/shared";
import { resolveProjectRole } from "@langfuse/shared/src/server";

/**
 * Shared query layer for the user-related APIs.
 *
 * Both surfaces of the user APIs are built on these functions:
 * - the instance admin API (`/api/admin/users/**`, ADMIN_API_KEY, self-hosted EE)
 * - the organization-scoped public API (`/api/public/organizations/memberships/{email}`)
 *
 * Keeping the queries here means email normalization, tenant scoping and role
 * resolution are decided once instead of per route. Route handlers only map the
 * results onto HTTP responses.
 */

/**
 * Users are always looked up by lowercased email. Emails are stored lowercased
 * by every write path (credential signup, SSO, SCIM provisioning), so callers
 * must normalize before querying — see `web/src/server/auth.ts` and
 * `web/src/pages/api/public/scim/Users/index.ts`.
 */
export const normalizeUserEmail = (email: string) => email.toLowerCase();

const userSelect = {
  id: true,
  email: true,
  name: true,
} as const;

export type UserSummary = {
  userId: string;
  email: string | null;
  name: string | null;
};

export type UserOrganizationAccess = {
  id: string;
  name: string;
  createdAt: Date;
  role: Role;
  metadata: unknown;
};

export type UserProjectAccess = {
  projectId: string;
  name: string;
  role: Role;
  inheritedFromOrgRole: boolean;
};

/**
 * Every organization a user is a member of, instance-wide, with the user's
 * organization role. Returns null if no user exists for the email.
 */
export async function findUserOrganizations({
  email,
}: {
  email: string;
}): Promise<
  (UserSummary & { organizations: UserOrganizationAccess[] }) | null
> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeUserEmail(email) },
    select: {
      ...userSelect,
      organizationMemberships: {
        select: {
          role: true,
          organization: {
            select: {
              id: true,
              name: true,
              createdAt: true,
              metadata: true,
            },
          },
        },
        orderBy: { organization: { name: "asc" } },
      },
    },
  });

  if (!user) return null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    organizations: user.organizationMemberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      createdAt: membership.organization.createdAt,
      role: membership.role,
      metadata: membership.organization.metadata ?? {},
    })),
  };
}

/**
 * A user's access within a single organization: the organization role plus the
 * effective role for each project of that organization.
 *
 * Role resolution is delegated to `resolveProjectRole`, the same helper the
 * session callback uses, so API and application access levels cannot drift: an
 * explicit project role overrides the organization role, and an effective role
 * of NONE means no access and is omitted.
 *
 * The lookup is scoped to `orgId`, so a user outside the organization is
 * indistinguishable from a user that does not exist (returns null).
 */
export async function findUserOrganizationAccess({
  orgId,
  email,
}: {
  orgId: string;
  email: string;
}): Promise<
  (UserSummary & { orgRole: Role; projects: UserProjectAccess[] }) | null
> {
  const orgMembership = await prisma.organizationMembership.findFirst({
    where: {
      orgId,
      user: { email: normalizeUserEmail(email) },
    },
    select: {
      role: true,
      user: { select: userSelect },
      ProjectMemberships: true,
    },
  });

  if (!orgMembership) return null;

  const projects = await prisma.project.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return {
    userId: orgMembership.user.id,
    email: orgMembership.user.email,
    name: orgMembership.user.name,
    orgRole: orgMembership.role,
    projects: projects
      .map((project) => ({
        projectId: project.id,
        name: project.name,
        role: resolveProjectRole({
          projectId: project.id,
          projectMemberships: orgMembership.ProjectMemberships,
          orgMembershipRole: orgMembership.role,
        }),
        inheritedFromOrgRole: !orgMembership.ProjectMemberships.some(
          (membership) => membership.projectId === project.id,
        ),
      }))
      .filter((project) => project.role !== Role.NONE),
  };
}
