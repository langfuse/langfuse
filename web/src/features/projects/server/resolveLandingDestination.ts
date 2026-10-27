import {
  createOrganizationRoute,
  createProjectRoute,
} from "@/src/features/setup";

const ORGANIZATIONS_OVERVIEW_PATH = "/organizations";
const SIGNUP_ONBOARDING_PATH = "/onboarding";

/** Why the overview was opened instead of a project; it shows a matching note. */
type LandingNotice = "welcome" | "last-project-unavailable";

type LandingProject = {
  id: string;
  /** Whether the project ever received data. */
  hasTraces: boolean;
};

type LandingOrganization = {
  id: string;
  /** Projects the user can read, in session order. Deleted projects are already excluded. */
  projects: LandingProject[];
  canCreateProjects: boolean;
};

export type LandingInput = {
  organizations: LandingOrganization[];
  /** Remembered project ids of this user, most trustworthy first. `null` entries are skipped. */
  rememberedProjectIds: Array<string | null>;
  canCreateOrganizations: boolean;
  demoOrganizationId: string | null;
  /** The signup survey has not been completed; only asked when the user has no organization. */
  hasPendingSignupOnboarding: () => Promise<boolean>;
};

export type LandingDecision = {
  destination: string;
  /** The remembered project is gone, so the memory of it should be cleared. */
  shouldForgetRememberedProject: boolean;
};

/** A project that never received data opens on its tracing setup instead of an empty home. */
const projectPath = (project: LandingProject) =>
  project.hasTraces
    ? `/project/${project.id}`
    : `/project/${project.id}/traces`;

const withNotice = (path: string, notice: LandingNotice) =>
  `${path}?notice=${notice}`;

/** The project to open without any history: the only one, or the only one with data. */
const pickOnlyCandidate = (projects: LandingProject[]) => {
  if (projects.length === 1) return projects[0];
  const projectsWithData = projects.filter((project) => project.hasTraces);
  return projectsWithData.length === 1 ? projectsWithData[0] : undefined;
};

/**
 * Where `/` sends a signed-in user:
 *
 * 1. The project they used last, while they can still read it.
 * 2. If that project was deleted or their access was removed: the projects
 *    overview with a note, and the stale memory is cleared.
 * 3. Without a usable memory (new device, just invited): their only project,
 *    or the only one that has data; with several candidates, the overview
 *    with a welcome note so they pick one deliberately.
 * 4. Without any project: project creation, the organization's overview,
 *    the signup onboarding, or organization creation, in that order.
 *
 * Never returns `/`, which would loop.
 */
export async function resolveLandingDestination({
  organizations,
  rememberedProjectIds,
  canCreateOrganizations,
  demoOrganizationId,
  hasPendingSignupOnboarding,
}: LandingInput): Promise<LandingDecision> {
  const readableProjects = new Map(
    organizations.flatMap((organization) =>
      organization.projects.map((project) => [project.id, project] as const),
    ),
  );
  const remembered = rememberedProjectIds
    .filter((projectId): projectId is string => projectId !== null)
    .map((projectId) => readableProjects.get(projectId));
  const rememberedProject = remembered.find((project) => project !== undefined);
  if (rememberedProject) {
    return {
      destination: projectPath(rememberedProject),
      shouldForgetRememberedProject: false,
    };
  }
  const isRememberedProjectGone = remembered.length > 0;

  // The demo organization is shared by everyone; it must not stand in for a
  // user's own workspace, or new users would never reach project creation.
  const ownOrganizations = organizations.filter(
    (organization) => organization.id !== demoOrganizationId,
  );
  const ownProjects = ownOrganizations.flatMap(
    (organization) => organization.projects,
  );
  const organizationsWithProjects = ownOrganizations.filter(
    (organization) => organization.projects.length > 0,
  );
  const overviewPath =
    organizationsWithProjects.length === 1
      ? `/organization/${organizationsWithProjects[0].id}`
      : ORGANIZATIONS_OVERVIEW_PATH;

  if (ownProjects.length > 0) {
    if (isRememberedProjectGone) {
      return {
        destination: withNotice(overviewPath, "last-project-unavailable"),
        shouldForgetRememberedProject: true,
      };
    }
    const onlyCandidate = pickOnlyCandidate(ownProjects);
    return onlyCandidate
      ? {
          destination: projectPath(onlyCandidate),
          shouldForgetRememberedProject: false,
        }
      : {
          destination: withNotice(overviewPath, "welcome"),
          shouldForgetRememberedProject: false,
        };
  }

  const decide = (destination: string): LandingDecision => ({
    destination,
    shouldForgetRememberedProject: isRememberedProjectGone,
  });

  const organizationForNewProject = ownOrganizations.find(
    (organization) => organization.canCreateProjects,
  );
  if (organizationForNewProject) {
    return decide(createProjectRoute(organizationForNewProject.id));
  }

  const firstOwnOrganization = ownOrganizations[0];
  if (firstOwnOrganization) {
    return decide(`/organization/${firstOwnOrganization.id}`);
  }

  if (await hasPendingSignupOnboarding()) {
    return decide(SIGNUP_ONBOARDING_PATH);
  }

  if (canCreateOrganizations) return decide(createOrganizationRoute);

  const demoProject = organizations.find(
    (organization) => organization.id === demoOrganizationId,
  )?.projects[0];
  if (demoProject) return decide(projectPath(demoProject));

  return decide(ORGANIZATIONS_OVERVIEW_PATH);
}
