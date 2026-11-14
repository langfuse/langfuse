import { type Session } from "next-auth";

import { type Role } from "@langfuse/shared";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  systemRoleAccessRights,
  type ResourceId,
} from "@langfuse/shared/rbac";

import {
  type PrincipalOrganization,
  type PrincipalProject,
  type PrincipalUser,
} from "@/src/features/auth/policy/types";
import {
  getSessionOrganizationRole,
  getSessionProjectRole,
  type AuthedSession,
} from "@/src/features/rbac/new/sessionAccessors";
import { type Policy } from "@/src/features/rbac/types";
import { testFeatureFlags } from "./feature-flags";

/** testEnvironment is a self-hosted OSS deployment without experimental features. */
const testEnvironment: Session["environment"] = {
  enableExperimentalFeatures: false,
  selfHostedInstancePlan: null,
};

/** testPrincipalOrganization is a free-plan org with no projects, overridable per test. */
export const testPrincipalOrganization = (
  overrides: Partial<PrincipalOrganization> = {},
): PrincipalOrganization => ({
  id: "org_1",
  createdAt: "2026-09-16T00:00:00.000Z",
  name: "Org",
  metadata: {},
  plan: "oss",
  rateLimitOverrides: [],
  isIngestionSuspended: false,
  accessAuditLogEnabled: false,
  supportAccess: false,
  aiFeaturesEnabled: false,
  aiTelemetryEnabled: true,
  featureFlagDefaults: testFeatureFlags(),
  cloudConfig: undefined,
  projects: [],
  ...overrides,
});

/** testPrincipalProject is a live project with no allowlist flags, overridable per test. */
export const testPrincipalProject = (
  overrides: Partial<PrincipalProject> = {},
): PrincipalProject => ({
  id: "prj_1",
  name: "Project",
  retentionDays: null,
  hasTraces: false,
  metadata: {},
  createdAt: "2026-09-16T00:00:00.000Z",
  topicsEnabled: false,
  scoreEditsDisabled: false,
  forceV3Experience: false,
  ...overrides,
});

/** testPrincipalUser is a signed-in user without v4 access, overridable per test. */
export const testPrincipalUser = (
  overrides: Partial<PrincipalUser> = {},
): PrincipalUser => ({
  id: "user_1",
  email: "user@example.com",
  name: "User",
  image: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  hasPassword: false,
  featureFlags: testFeatureFlags(),
  v4BetaEnabled: false,
  v4UpgradeUiAvailable: false,
  canToggleV4: false,
  canCreateOrganizations: true,
  ...overrides,
});

/** testSession is a signed-in session whose policies bind each organization's role, and each project's role where given, with organizations defaulting to the user's flags, overridable per test. */
export const testSession = ({
  user = {},
  organizations = [],
  environment = {},
}: {
  user?: Partial<PrincipalUser>;
  organizations?: TestOrganization[];
  environment?: Partial<Session["environment"]>;
} = {}): Session & AuthedSession => ({
  expires: "2099-01-01T00:00:00.000Z",
  environment: { ...testEnvironment, ...environment },
  authCtx: {
    principal: {
      kind: "user",
      user: testPrincipalUser(user),
      organizations: organizations.map((org) =>
        toPrincipalOrganization({
          featureFlagDefaults: testPrincipalUser(user).featureFlags,
          ...org,
        }),
      ),
    },
    policies: [organizations.flatMap(organizationPolicies)],
  },
});

/** withSessionRoles rebinds a test session so the user holds role on every organization and, where given, projectRole on every project. */
export const withSessionRoles = (
  session: AuthedSession & Pick<Session, "environment">,
  { role, projectRole }: { role: Role; projectRole?: Role },
): Session & AuthedSession =>
  testSession({
    user: session.authCtx.principal.user,
    organizations: session.authCtx.principal.organizations.map((org) => ({
      ...org,
      role,
      projects: org.projects.map((project) => ({
        ...project,
        role: projectRole,
      })),
    })),
    environment: session.environment,
  });

/** withSessionOrganizations rebuilds a test session from its organizations, with the user's roles on them, as update returns them. */
export const withSessionOrganizations = (
  session: AuthedSession & Pick<Session, "environment">,
  update: (organizations: TestOrganization[]) => TestOrganization[],
): Session & AuthedSession =>
  testSession({
    user: session.authCtx.principal.user,
    organizations: update(
      session.authCtx.principal.organizations.map((org) => ({
        ...org,
        role: getSessionOrganizationRole(session, org.id),
        projects: org.projects.map((project) => ({
          ...project,
          role: getSessionProjectRole(session, project.id),
        })),
      })),
    ),
    environment: session.environment,
  });

/** withSessionUser replaces profile fields of a test session's user, keeping its policies. */
export const withSessionUser = <T extends AuthedSession>(
  session: T,
  user: Partial<PrincipalUser>,
): T => ({
  ...session,
  authCtx: {
    ...session.authCtx,
    principal: {
      ...session.authCtx.principal,
      user: { ...session.authCtx.principal.user, ...user },
    },
  },
});

/** toPrincipalOrganization drops the test-only roles from an organization and its projects. */
function toPrincipalOrganization({
  role: _role,
  projects = [],
  ...org
}: TestOrganization): PrincipalOrganization {
  return testPrincipalOrganization({
    ...org,
    projects: projects.map(({ role: _projectRole, ...project }) =>
      testPrincipalProject(project),
    ),
  });
}

/** organizationPolicies binds an organization's role to it and its projects, and each project role to its project. */
function organizationPolicies(org: TestOrganization): Policy[] {
  const tenant = OrganizationId(org.id ?? testPrincipalOrganization().id);
  const orgPolicies = rolePolicies(org.role, tenant, [tenant, ProjectId("*")]);
  const projectPolicies = (org.projects ?? []).flatMap((project) =>
    rolePolicies(project.role, tenant, [
      ProjectId(project.id ?? testPrincipalProject().id),
    ]),
  );
  return [...orgPolicies, ...projectPolicies];
}

/** rolePolicies binds a system role's policies to the resources of their kind. */
function rolePolicies(
  role: Role | undefined,
  tenantId: OrganizationId,
  resources: ResourceId[],
): Policy[] {
  if (!role) return [];
  const roleId = SystemRoleId(role);
  return systemRoleAccessRights[role].policies.flatMap((policy) => {
    const ofKind = resources.filter((resource) =>
      resource.startsWith(`${policy.resourceKind}/`),
    );
    if (ofKind.length === 0) return [];
    return [
      {
        id: `${roleId}:${policy.resourceKind}`,
        roleId,
        tenantId,
        effect: policy.effect,
        actions: policy.actions,
        resources: ofKind,
      },
    ];
  });
}

/** TestOrganization is a principal organization with the user's role on it and its projects. */
export type TestOrganization = Partial<
  Omit<PrincipalOrganization, "projects">
> & {
  role?: Role;
  projects?: TestProject[];
};

/** TestProject is a principal project with the user's role on it, overriding the organization's. */
type TestProject = Partial<PrincipalProject> & { role?: Role };
