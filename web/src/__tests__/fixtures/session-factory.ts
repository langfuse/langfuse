import { type Session } from "next-auth";

import { type Role } from "@langfuse/shared";
import {
  hasOrganizationKind,
  hasProjectKind,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  systemRoleAccessRights,
  type ResourceId,
  type TenantId,
} from "@langfuse/shared/rbac";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { type Policy } from "@/src/features/rbac/types";

/** createSession builds a signed-in session with the policies the user's roles on each organization and project bind, defaulting every field a test leaves out. */
export function createSession({
  user = {},
  organizations = [],
  environment = {},
  expires = "1",
}: {
  user?: Partial<Omit<SessionUser, "organizations">>;
  organizations?: TestOrganization[];
  environment?: Partial<Session["environment"]>;
  expires?: string;
} = {}): SignedInSession {
  return {
    expires,
    user: {
      id: "user-1",
      name: "Demo User",
      canCreateOrganizations: true,
      featureFlags: testFeatureFlags(),
      ...user,
      organizations: organizations.map(sessionOrganization),
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: null,
      ...environment,
    },
    policies: [organizations.flatMap(organizationPolicies)],
  };
}

/** sessionOrganization defaults an organization's fields and drops the roles, which the session carries as policies. */
function sessionOrganization({
  role: _role,
  projects = [],
  ...org
}: TestOrganization): SessionOrganization {
  return {
    name: "Test Organization",
    plan: "cloud:hobby",
    cloudConfig: undefined,
    metadata: {},
    aiFeaturesEnabled: false,
    aiTelemetryEnabled: false,
    ...org,
    projects: projects.map(sessionProject),
  };
}

/** sessionProject defaults a project's fields and drops its role. */
function sessionProject({
  role: _role,
  ...project
}: TestProject): SessionProject {
  return {
    name: "Test Project",
    deletedAt: null,
    retentionDays: 30,
    hasTraces: false,
    metadata: {},
    createdAt: new Date().toISOString(),
    ...project,
  };
}

/** organizationPolicies binds the org role to the org and all its projects, and each project role to its project. */
function organizationPolicies(org: TestOrganization): Policy[] {
  const tenant = OrganizationId(org.id);
  return [
    ...rolePolicies(org.role, tenant, [tenant, ProjectId("*")]),
    ...(org.projects ?? []).flatMap((project) =>
      rolePolicies(project.role, tenant, [ProjectId(project.id)]),
    ),
  ];
}

/** rolePolicies binds a role's catalog policies to the resources of each policy's kind. */
function rolePolicies(
  role: Role | undefined,
  tenantId: TenantId,
  resources: ResourceId[],
): Policy[] {
  if (!role) return [];
  const roleId = SystemRoleId(role);
  return systemRoleAccessRights[role].policies.flatMap((policy) => {
    const ofKind = resources.filter(kindFilter(policy.resourceKind));
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

/** kindFilter matches the resources of a policy's kind. */
function kindFilter(kind: "organization" | "project") {
  if (kind === "organization") return hasOrganizationKind;
  return hasProjectKind;
}

type SignedInSession = Session & { user: SessionUser };

type SessionUser = NonNullable<Session["user"]>;

type SessionOrganization = SessionUser["organizations"][number];

type SessionProject = SessionOrganization["projects"][number];

/** TestOrganization is an organization's id and the user's role on it, plus the fields that differ from the defaults. */
export type TestOrganization = Partial<
  Omit<SessionOrganization, "projects">
> & {
  id: string;
  role: Role;
  projects?: TestProject[];
};

/** TestProject is a project's id, the user's role on it when it differs from the organization role, plus the fields that differ from the defaults. */
type TestProject = Partial<SessionProject> & { id: string; role?: Role };
