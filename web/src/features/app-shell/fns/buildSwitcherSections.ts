export type SwitcherProject = {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  isCurrent: boolean;
};

export type SwitcherOrganization = {
  id: string;
  name: string;
  projectCount: number;
  isCurrent: boolean;
  isDemo: boolean;
  /** Where choosing the organization goes: its last-used project, its only project, or `null` for its overview. */
  landingProjectId: string | null;
};

type SwitcherProjectGroup = {
  organization: SwitcherOrganization;
  projects: SwitcherProject[];
};

export type SwitcherSections = {
  recentProjects: SwitcherProject[];
  /** Every organization's projects; the current organization first, the demo organization last. */
  projectGroups: SwitcherProjectGroup[];
  organizations: SwitcherOrganization[];
};

type SessionOrganization = {
  id: string;
  name: string;
  projects: Array<{ id: string; name: string }>;
};

const RECENT_PROJECTS_SHOWN = 5;

/**
 * Prepares the switcher's lists from the session's organizations and the
 * recently used project ids. Recent ids that are no longer readable (deleted
 * project, revoked access) are dropped.
 */
export function buildSwitcherSections({
  organizations,
  currentOrganizationId,
  currentProjectId,
  recentProjectIds,
  demoOrganizationId,
}: {
  organizations: SessionOrganization[];
  currentOrganizationId: string | null;
  currentProjectId: string | null;
  recentProjectIds: string[];
  demoOrganizationId: string | null;
}): SwitcherSections {
  const recencyRank = new Map(
    recentProjectIds.map((projectId, index) => [projectId, index]),
  );
  const rankOf = (projectId: string) =>
    recencyRank.get(projectId) ?? Number.POSITIVE_INFINITY;

  const orderWeight = (organization: SessionOrganization) => {
    if (organization.id === currentOrganizationId) return 0;
    if (organization.id === demoOrganizationId) return 2;
    return 1;
  };
  const orderedOrganizations = organizations.toSorted(
    (a, b) => orderWeight(a) - orderWeight(b),
  );

  const projectGroups = orderedOrganizations.map((organization) => {
    const projects = organization.projects.map((project) => ({
      id: project.id,
      name: project.name,
      organizationId: organization.id,
      organizationName: organization.name,
      isCurrent: project.id === currentProjectId,
    }));
    const mostRecentProject = projects
      .filter((project) => recencyRank.has(project.id))
      .toSorted((a, b) => rankOf(a.id) - rankOf(b.id))[0];

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        projectCount: projects.length,
        isCurrent: organization.id === currentOrganizationId,
        isDemo: organization.id === demoOrganizationId,
        landingProjectId:
          mostRecentProject?.id ??
          (projects.length === 1 ? projects[0].id : null),
      },
      projects,
    };
  });

  const recentProjects = projectGroups
    .flatMap((group) => group.projects)
    .filter((project) => recencyRank.has(project.id))
    .toSorted((a, b) => rankOf(a.id) - rankOf(b.id))
    .slice(0, RECENT_PROJECTS_SHOWN);

  return {
    recentProjects,
    projectGroups,
    organizations: projectGroups.map((group) => group.organization),
  };
}
