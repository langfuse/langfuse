import {
  createOrganizationRoute,
  createProjectRoute,
} from "@/src/features/setup";

export const ORGANIZATIONS_OVERVIEW_PATH = "/organizations";

type LandingOrganization = {
  id: string;
  /** Projects the user can read, in session order. Deleted projects are already excluded. */
  projectIds: string[];
  canCreateProjects: boolean;
};

export type LandingInput = {
  organizations: LandingOrganization[];
  /** Remembered project ids, most trustworthy first. `null` entries are skipped. */
  rememberedProjectIds: Array<string | null>;
  canCreateOrganizations: boolean;
  demoOrganizationId: string | null;
};

/**
 * Where `/` sends a signed-in user: the project they used last, otherwise the
 * first project they can read, otherwise the step that gets them a project.
 * A remembered project only wins while the user can still read it, so a
 * deleted project or revoked access falls through to the next option.
 *
 * Never returns `/`, which would loop.
 */
export function resolveLandingDestination({
  organizations,
  rememberedProjectIds,
  canCreateOrganizations,
  demoOrganizationId,
}: LandingInput): string {
  const readableProjectIds = new Set(
    organizations.flatMap((organization) => organization.projectIds),
  );
  const rememberedProjectId = rememberedProjectIds.find(
    (projectId): projectId is string =>
      projectId !== null && readableProjectIds.has(projectId),
  );
  if (rememberedProjectId) return `/project/${rememberedProjectId}`;

  // The demo organization is shared by everyone; it must not stand in for a
  // user's own workspace, or new users would never reach project creation.
  const ownOrganizations = organizations.filter(
    (organization) => organization.id !== demoOrganizationId,
  );
  const firstOwnProjectId = ownOrganizations.find(
    (organization) => organization.projectIds.length > 0,
  )?.projectIds[0];
  if (firstOwnProjectId) return `/project/${firstOwnProjectId}`;

  const organizationForNewProject = ownOrganizations.find(
    (organization) => organization.canCreateProjects,
  );
  if (organizationForNewProject) {
    return createProjectRoute(organizationForNewProject.id);
  }

  const firstOwnOrganization = ownOrganizations[0];
  if (firstOwnOrganization) return `/organization/${firstOwnOrganization.id}`;

  if (canCreateOrganizations) return createOrganizationRoute;

  const demoProjectId = organizations.find(
    (organization) => organization.id === demoOrganizationId,
  )?.projectIds[0];
  if (demoProjectId) return `/project/${demoProjectId}`;

  return ORGANIZATIONS_OVERVIEW_PATH;
}
