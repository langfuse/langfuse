import { type OrganizationOverview } from "./buildProjectsOverview";

export type OverviewStatusFilter = "all" | "attention" | "not-set-up";

const matchesStatus = (
  project: OrganizationOverview["projects"][number],
  status: OverviewStatusFilter,
) => {
  if (status === "attention") return project.attention.length > 0;
  if (status === "not-set-up") return project.ingestion.kind === "not-set-up";
  return true;
};

/**
 * Applies the overview's search and status tabs. The search matches project
 * and organization names; the tab counts are taken after the search so they
 * describe what the tab would show. Organizations without a match are left
 * out unless nothing narrows the list.
 */
export function filterProjectsOverview(
  organizations: OrganizationOverview[],
  { search, status }: { search: string; status: OverviewStatusFilter },
) {
  const needle = search.trim().toLocaleLowerCase();
  const searched = organizations.map((organization) => ({
    ...organization,
    projects:
      !needle || organization.name.toLocaleLowerCase().includes(needle)
        ? organization.projects
        : organization.projects.filter((project) =>
            project.name.toLocaleLowerCase().includes(needle),
          ),
  }));
  const live = searched.flatMap((organization) =>
    organization.projects.filter((project) => !project.isDeleted),
  );
  const counts = {
    all: live.length,
    attention: live.filter((project) => matchesStatus(project, "attention"))
      .length,
    "not-set-up": live.filter((project) => matchesStatus(project, "not-set-up"))
      .length,
  } satisfies Record<OverviewStatusFilter, number>;

  const isNarrowed = needle.length > 0 || status !== "all";
  const filtered = searched
    .map((organization) => ({
      ...organization,
      projects: organization.projects.filter(
        (project) =>
          (status === "all" || !project.isDeleted) &&
          matchesStatus(project, status),
      ),
    }))
    .filter((organization) => !isNarrowed || organization.projects.length > 0);

  return { organizations: filtered, counts };
}
