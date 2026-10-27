import { buildProjectsOverview } from "@/src/features/projects-overview/fns/projectsOverview/buildProjectsOverview";
import { filterProjectsOverview } from "@/src/features/projects-overview/fns/projectsOverview/filterProjectsOverview";
import { getIngestionStatus } from "@/src/features/projects-overview/fns/projectsOverview/getIngestionStatus";

const NOW = Date.UTC(2026, 9, 27, 12);
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW - ms);

const sessionProject = (
  id: string,
  overrides: Partial<{ hasTraces: boolean; deletedAt: string | null }> = {},
) => ({
  id,
  name: id,
  role: "OWNER" as const,
  retentionDays: null,
  hasTraces: true,
  deletedAt: null,
  ...overrides,
});

const organizations = [
  {
    id: "demo",
    name: "Demo",
    plan: "cloud:hobby" as const,
    role: "VIEWER" as const,
    projects: [sessionProject("demo-project")],
  },
  {
    id: "acme",
    name: "Acme Robotics",
    plan: "cloud:hobby" as const,
    role: "OWNER" as const,
    projects: [
      sessionProject("support-copilot"),
      sessionProject("search-api"),
      sessionProject("eval-sandbox", { hasTraces: false }),
      sessionProject("legacy", { deletedAt: "2026-10-01T00:00:00.000Z" }),
    ],
  },
];

const acmeOverview = {
  projects: [
    {
      projectId: "support-copilot",
      lastTraceAt: ago(HOUR),
      periodUnits: 38_000,
    },
    {
      projectId: "search-api",
      lastTraceAt: ago(48 * HOUR),
      periodUnits: 7_500,
    },
    { projectId: "eval-sandbox", lastTraceAt: null, periodUnits: 0 },
  ],
  usage: {
    periodStart: ago(10 * 24 * HOUR),
    periodEnd: ago(-20 * 24 * HOUR),
    periodKind: "billing-cycle" as const,
    units: 45_500,
    limit: 50_000,
    isIngestionBlocked: false,
  },
  memberCount: 4,
};

const build = (
  overrides: Partial<Parameters<typeof buildProjectsOverview>[0]> = {},
) =>
  buildProjectsOverview({
    organizations,
    overviewByOrganizationId: new Map([["acme", acmeOverview]]),
    migrationReadinessByProjectId: new Map([
      ["support-copilot", "ready"],
      ["search-api", "action-needed"],
    ]),
    failedOrganizationIds: new Set(),
    demoOrganizationId: "demo",
    now: NOW,
    ...overrides,
  });

describe("getIngestionStatus", () => {
  it.each([
    [ago(HOUR), "live"],
    [ago(3 * 24 * HOUR), "quiet"],
    [ago(12 * 24 * HOUR), "stale"],
  ])("reads a last trace at %s as %s", (lastTraceAt, kind) => {
    expect(
      getIngestionStatus({ hasTraces: true, lastTraceAt, now: NOW }).kind,
    ).toBe(kind);
  });

  it("tells a project that never received data from one that went quiet for a month", () => {
    expect(
      getIngestionStatus({ hasTraces: false, lastTraceAt: null, now: NOW }),
    ).toEqual({ kind: "not-set-up" });
    expect(
      getIngestionStatus({ hasTraces: true, lastTraceAt: null, now: NOW }),
    ).toEqual({ kind: "inactive" });
    expect(
      getIngestionStatus({ hasTraces: true, lastTraceAt: undefined, now: NOW }),
    ).toEqual({ kind: "checking" });
  });

  it("trusts a recent trace over a hasTraces flag that has not caught up", () => {
    expect(
      getIngestionStatus({ hasTraces: false, lastTraceAt: ago(HOUR), now: NOW })
        .kind,
    ).toBe("live");
  });
});

describe("buildProjectsOverview", () => {
  it("puts the demo organization last", () => {
    expect(build().map((organization) => organization.id)).toEqual([
      "acme",
      "demo",
    ]);
  });

  it("flags the organization near its limit and the project driving the usage", () => {
    const [acme] = build();
    expect(acme.usage).toMatchObject({ level: "near-limit", ratio: 0.91 });

    const byId = Object.fromEntries(
      acme.projects.map((project) => [project.id, project]),
    );
    expect(byId["support-copilot"].attention).toEqual(["usage"]);
    expect(byId["support-copilot"].usage?.share).toBeCloseTo(38_000 / 45_500);
    expect(byId["search-api"].attention).toEqual(["v4-migration"]);
    expect(byId["eval-sandbox"].attention).toEqual(["not-set-up"]);
    expect(byId.legacy).toMatchObject({ isDeleted: true, attention: [] });
  });

  it("does not report usage pressure on a paid plan without a limit", () => {
    const [acme] = build({
      overviewByOrganizationId: new Map([
        [
          "acme",
          { ...acmeOverview, usage: { ...acmeOverview.usage, limit: null } },
        ],
      ]),
    });
    expect(acme.usage?.level).toBe("unlimited");
    expect(
      acme.projects.find((p) => p.id === "support-copilot")?.attention,
    ).toEqual([]);
  });

  it("keeps an organization loading, and hides usage from roles that may not read it", () => {
    const [, demo] = build();
    expect(demo).toMatchObject({
      loadState: "loading",
      usage: null,
      memberCount: null,
    });
    expect(demo.projects[0]).toMatchObject({
      ingestion: { kind: "checking" },
      usage: null,
      migration: null,
    });
  });
});

describe("filterProjectsOverview", () => {
  it("counts tabs after the search and drops organizations without a match", () => {
    const result = filterProjectsOverview(build(), {
      search: "s",
      status: "attention",
    });

    expect(result.counts).toEqual({ all: 3, attention: 3, "not-set-up": 1 });
    expect(result.organizations.map((organization) => organization.id)).toEqual(
      ["acme"],
    );
  });

  it("matches the organization name to show all of its projects", () => {
    const result = filterProjectsOverview(build(), {
      search: "acme",
      status: "all",
    });

    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0].projects).toHaveLength(4);
  });

  it("lists projects that were never set up", () => {
    const result = filterProjectsOverview(build(), {
      search: "",
      status: "not-set-up",
    });

    expect(
      result.organizations.flatMap((organization) =>
        organization.projects.map((project) => project.id),
      ),
    ).toEqual(["eval-sandbox"]);
  });
});
