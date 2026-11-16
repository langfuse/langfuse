import { type Session } from "next-auth";

import { type Role } from "@langfuse/shared";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";

/** createSession builds a signed-in session with the user's role on each organization and project, defaulting every field a test leaves out. */
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
      organizations: organizations.map(testOrganization),
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: null,
      ...environment,
    },
  };
}

/** testOrganization defaults an organization's fields; its projects take the organization role unless they name their own. */
function testOrganization({
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
    projects: projects.map((project) => testProject(project, org.role)),
  };
}

/** testProject defaults a project's fields, falling back to the organization role. */
function testProject(project: TestProject, orgRole: Role): SessionProject {
  return {
    name: "Test Project",
    deletedAt: null,
    retentionDays: 30,
    hasTraces: false,
    metadata: {},
    createdAt: new Date().toISOString(),
    role: orgRole,
    ...project,
  };
}

/** SignedInSession is a session whose user is signed in. */
type SignedInSession = Session & { user: SessionUser };

/** SessionUser is the signed-in user on a session. */
type SessionUser = NonNullable<Session["user"]>;

/** SessionOrganization is an organization on the session user. */
type SessionOrganization = SessionUser["organizations"][number];

/** SessionProject is a project on a session organization. */
type SessionProject = SessionOrganization["projects"][number];

/** TestOrganization is an organization's id and the user's role on it, plus the fields that differ from the defaults. */
type TestOrganization = Partial<Omit<SessionOrganization, "projects">> & {
  id: string;
  role: Role;
  projects?: TestProject[];
};

/** TestProject is a project's id plus the fields that differ from the defaults. */
type TestProject = Partial<SessionProject> & { id: string };
