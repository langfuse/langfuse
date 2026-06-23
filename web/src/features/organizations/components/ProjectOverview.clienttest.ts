import { getSortedOrganizationProjects } from "./ProjectOverview";

describe("getSortedOrganizationProjects", () => {
  const projects = [
    { id: "1", name: "Zeta" },
    { id: "2", name: "Alpha" },
    { id: "3", name: "Beta" },
  ];

  it("filters projects by search term", () => {
    expect(
      getSortedOrganizationProjects(projects, { search: "alp" }).map(
        (project) => project.name,
      ),
    ).toEqual(["Alpha"]);
  });

  it("sorts projects A-Z", () => {
    expect(
      getSortedOrganizationProjects(projects, { sort: "asc" }).map(
        (project) => project.name,
      ),
    ).toEqual(["Alpha", "Beta", "Zeta"]);
  });

  it("sorts projects Z-A", () => {
    expect(
      getSortedOrganizationProjects(projects, { sort: "desc" }).map(
        (project) => project.name,
      ),
    ).toEqual(["Zeta", "Beta", "Alpha"]);
  });

  it("keeps the original order when no sort is selected", () => {
    expect(
      getSortedOrganizationProjects(projects, {}).map(
        (project) => project.name,
      ),
    ).toEqual(["Zeta", "Alpha", "Beta"]);
  });

  it("filters then sorts projects", () => {
    expect(
      getSortedOrganizationProjects(projects, {
        search: "e",
        sort: "desc",
      }).map((project) => project.name),
    ).toEqual(["Zeta", "Beta"]);
  });
});
