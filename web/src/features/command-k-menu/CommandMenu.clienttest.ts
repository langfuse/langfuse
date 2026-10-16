import {
  addRecentEntry,
  buildCreateActions,
  getIdNavigationItem,
  getSearchAnalytics,
  getVisibleRecents,
} from "./CommandMenu";

describe("getIdNavigationItem", () => {
  it("filters traces by an exact 32-character hex ID", () => {
    expect(
      getIdNavigationItem("0123456789abcdef0123456789ABCDEF", "project-1"),
    ).toEqual({
      type: "trace_id",
      title: "Find trace by ID",
      url: "/project/project-1/traces?filter=id%3Bstring%3B%3B%3D%3B0123456789abcdef0123456789ABCDEF",
    });
  });

  it("filters v4 traces by the trace ID column", () => {
    expect(
      getIdNavigationItem(
        "0123456789abcdef0123456789ABCDEF",
        "project-1",
        true,
      ),
    ).toEqual({
      type: "trace_id",
      title: "Find trace by ID",
      url: "/project/project-1/traces?filter=traceId%3Bstring%3B%3Bcontains%3B0123456789abcdef0123456789ABCDEF",
    });
  });

  it("filters the v4 traces table by an exact observation ID", () => {
    expect(getIdNavigationItem("0123456789aBCDef", "project-1", true)).toEqual({
      type: "observation_id",
      title: "Find observation by ID",
      url: "/project/project-1/traces?filter=id%3Bstring%3B%3Bcontains%3B0123456789aBCDef",
    });
  });

  it("filters the v3 observations table by an exact observation ID", () => {
    expect(getIdNavigationItem("0123456789aBCDef", "project-1")).toEqual({
      type: "observation_id",
      title: "Find observation by ID",
      url: "/project/project-1/observations?filter=id%3BstringOptions%3B%3Bany%20of%3B0123456789aBCDef",
    });
  });

  it.each([
    ["", "project-1"],
    ["0123456789abcde", "project-1"],
    ["0123456789abcdefg", "project-1"],
    ["not-a-hex-id-123", "project-1"],
    ["0123456789abcdef", undefined],
  ])("does not match %j in project %j", (search, projectId) => {
    expect(getIdNavigationItem(search, projectId)).toBeNull();
  });

  it("classifies searches without retaining their raw value", () => {
    const search = "0123456789abcdef";

    expect(getSearchAnalytics(search)).toEqual({
      queryLength: 16,
      queryType: "observation_id",
    });
    expect(getSearchAnalytics(search)).not.toHaveProperty("search");
  });
});

describe("addRecentEntry", () => {
  const entry = (url: string) => ({ title: url, url, type: "dashboard" });

  it("moves a repeated pick to the top instead of duplicating it", () => {
    expect(
      addRecentEntry([entry("/a"), entry("/b")], entry("/b")).map((e) => e.url),
    ).toEqual(["/b", "/a"]);
  });

  it("keeps the four most recent picks", () => {
    const recents = ["/1", "/2", "/3", "/4"].map(entry);
    expect(addRecentEntry(recents, entry("/5")).map((e) => e.url)).toEqual([
      "/5",
      "/1",
      "/2",
      "/3",
    ]);
  });
});

describe("getVisibleRecents", () => {
  it("hides pages and create actions the menu no longer offers", () => {
    const recents = [
      { title: "Prompts", url: "/p/prompts", type: "main_navigation" },
      { title: "Alerts", url: "/p/alerts", type: "main_navigation" },
      {
        title: "New dashboard",
        url: "/p/dashboards/new",
        type: "create_action",
      },
      { title: "New prompt", url: "/p/prompts/new", type: "create_action" },
      { title: "Cost", url: "/p/dashboards/1", type: "dashboard" },
    ];

    expect(
      getVisibleRecents(recents, {
        navUrls: new Set(["/p/prompts"]),
        createUrls: new Set(["/p/prompts/new"]),
      }).map((e) => e.title),
    ).toEqual(["Prompts", "New prompt", "Cost"]);
  });
});

describe("buildCreateActions", () => {
  const navItems = [
    { href: "/project/[projectId]/dashboards", url: "/project/p1/dashboards" },
    { href: "/project/[projectId]/evals", url: "/project/p1/evals/legacy" },
  ];

  it("offers an action only for sidebar pages the user can write to", () => {
    const actions = buildCreateActions({
      navItems,
      projectId: "p1",
      canCreate: (scope) => scope === "dashboards:CUD",
    });

    expect([...actions.byNavUrl.values()].flat().map((a) => a.url)).toEqual([
      "/project/p1/dashboards/new",
    ]);
    expect(actions.standalone).toEqual([]);
  });

  it("follows the sidebar URL, so legacy projects get the legacy create page", () => {
    const actions = buildCreateActions({
      navItems,
      projectId: "p1",
      canCreate: () => true,
    });

    expect(actions.byNavUrl.get("/project/p1/evals/legacy")?.[0]?.url).toBe(
      "/project/p1/evals/legacy/new",
    );
    expect(actions.standalone.map((a) => a.url)).toEqual([
      "/project/p1/automations?view=create",
    ]);
  });
});
