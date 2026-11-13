import { buildSwitcherSections } from "@/src/features/app-shell/fns/buildSwitcherSections";

const organizations = [
  {
    id: "demo",
    name: "Langfuse Demo",
    projects: [{ id: "demo-project", name: "Demo" }],
  },
  {
    id: "acme",
    name: "Acme",
    projects: [
      { id: "acme-api", name: "API" },
      { id: "acme-web", name: "Web" },
      { id: "acme-batch", name: "Batch" },
    ],
  },
  {
    id: "globex",
    name: "Globex",
    projects: [{ id: "globex-chat", name: "Chat" }],
  },
  { id: "empty", name: "Empty", projects: [] },
];

const build = (
  overrides: Partial<Parameters<typeof buildSwitcherSections>[0]> = {},
) =>
  buildSwitcherSections({
    organizations,
    currentOrganizationId: "globex",
    currentProjectId: "globex-chat",
    recentProjectIds: [],
    demoOrganizationId: "demo",
    ...overrides,
  });

describe("buildSwitcherSections", () => {
  it("lists recent projects by recency with their organization, dropping ones that are gone", () => {
    const { recentProjects } = build({
      recentProjectIds: ["acme-web", "deleted-project", "globex-chat"],
    });

    expect(
      recentProjects.map(({ id, organizationName, isCurrent }) => ({
        id,
        organizationName,
        isCurrent,
      })),
    ).toEqual([
      { id: "acme-web", organizationName: "Acme", isCurrent: false },
      { id: "globex-chat", organizationName: "Globex", isCurrent: true },
    ]);
  });

  it("caps the recent list", () => {
    const { recentProjects } = build({
      recentProjectIds: [
        "acme-api",
        "acme-web",
        "acme-batch",
        "globex-chat",
        "demo-project",
        "acme-api",
      ],
    });

    expect(recentProjects).toHaveLength(5);
  });

  it("puts the current organization first and the demo organization last", () => {
    const { organizations: ordered, projectGroups } = build();

    expect(ordered.map((organization) => organization.id)).toEqual([
      "globex",
      "acme",
      "empty",
      "demo",
    ]);
    expect(ordered[0]).toMatchObject({ isCurrent: true, projectCount: 1 });
    expect(ordered[3].isDemo).toBe(true);
    expect(projectGroups[1].projects.map((project) => project.id)).toEqual([
      "acme-api",
      "acme-web",
      "acme-batch",
    ]);
  });

  it("lands an organization on its last-used project, its only project, or its overview", () => {
    const byId = Object.fromEntries(
      build({
        recentProjectIds: ["globex-chat", "acme-batch"],
      }).organizations.map((organization) => [
        organization.id,
        organization.landingProjectId,
      ]),
    );

    expect(byId).toEqual({
      acme: "acme-batch",
      globex: "globex-chat",
      demo: "demo-project",
      empty: null,
    });
    expect(
      build().organizations.find((organization) => organization.id === "acme")
        ?.landingProjectId,
    ).toBeNull();
  });
});
