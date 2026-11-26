import {
  addRecentEntry,
  buildCreateActions,
  buildPageShortcuts,
  getEntityBaseUrl,
  getIdNavigationItem,
  getRecentPickAnalytics,
  getSearchAnalytics,
  getVisibleRecents,
  toEntityGroup,
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
  it("hides pages, create actions and entities the menu no longer offers", () => {
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
      { title: "greeting", url: "/p/prompts/greeting", type: "prompt" },
      { title: "golden", url: "/p/datasets/d1", type: "dataset" },
    ];

    expect(
      getVisibleRecents(recents, {
        navUrls: new Set(["/p/prompts"]),
        createUrls: new Set(["/p/prompts/new"]),
        entityBaseUrls: ["/p/prompts"],
      }).map((e) => e.title),
    ).toEqual(["Prompts", "New prompt", "Cost", "greeting"]);
  });
});

describe("getRecentPickAnalytics", () => {
  it("reports entity picks by type only", () => {
    expect(
      getRecentPickAnalytics({
        title: "acme/secret-prompt",
        url: "/p/prompts/acme%2Fsecret-prompt",
        type: "prompt",
      }),
    ).toEqual({ type: "recent", entityType: "prompt" });
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

describe("buildPageShortcuts", () => {
  const navItems = [
    { href: "/project/[projectId]/dashboards", url: "/project/p1/dashboards" },
    { href: "/project/[projectId]/evals", url: "/project/p1/evals" },
  ];

  it("lists hidden pages under their sidebar page, gated by read scope", () => {
    const shortcuts = buildPageShortcuts({
      navItems,
      projectId: "p1",
      canRead: (scope) => scope !== "evalDefaultModel:read",
    });

    expect(
      [...shortcuts.byNavUrl.entries()].map(([navUrl, items]) => [
        navUrl,
        items.map((item) => item.url),
      ]),
    ).toEqual([
      ["/project/p1/dashboards", ["/project/p1/widgets"]],
      ["/project/p1/evals", ["/project/p1/evals/rules"]],
    ]);
    expect(shortcuts.standalone.map((item) => item.url)).toEqual([
      "/project/p1/automations",
    ]);
  });

  it("skips v4-only pages when the sidebar links to the legacy page", () => {
    const shortcuts = buildPageShortcuts({
      navItems: [
        { href: "/project/[projectId]/evals", url: "/project/p1/evals/legacy" },
      ],
      projectId: "p1",
      canRead: () => true,
    });

    expect(
      shortcuts.byNavUrl
        .get("/project/p1/evals/legacy")
        ?.map((item) => item.url),
    ).toEqual(["/project/p1/evals/default-model"]);
  });

  it("offers nothing the user cannot read", () => {
    const shortcuts = buildPageShortcuts({
      navItems,
      projectId: "p1",
      canRead: () => false,
    });

    expect(shortcuts.byNavUrl.size).toBe(0);
    expect(shortcuts.standalone).toEqual([]);
  });
});

describe("getEntityBaseUrl", () => {
  const navItems = [
    { href: "/project/[projectId]/prompts", url: "/project/p1/prompts" },
    { href: "/project/[projectId]/evals", url: "/project/p1/evals/legacy" },
  ];

  it("uses the sidebar URL when the page is visible and readable", () => {
    expect(
      getEntityBaseUrl({
        type: "prompt",
        navItems,
        projectId: "p1",
        canRead: (scope) => scope === "prompts:read",
      }),
    ).toBe("/project/p1/prompts");
  });

  it.each<[Parameters<typeof getEntityBaseUrl>[0]["type"], boolean]>([
    ["prompt", false],
    ["dataset", true],
    ["evaluator", true],
  ])("is null for %s when unreadable, hidden or legacy", (type, readable) => {
    expect(
      getEntityBaseUrl({
        type,
        navItems,
        projectId: "p1",
        canRead: () => readable,
      }),
    ).toBeNull();
  });
});

describe("toEntityGroup", () => {
  it("links prompts by encoded name and other entities by ID", () => {
    const row = { id: "c1", name: "support/greeting v2" };

    expect(
      toEntityGroup("prompt", "/project/p1/prompts", [row], "").items[0]?.url,
    ).toBe("/project/p1/prompts/support%2Fgreeting%20v2");
    expect(
      toEntityGroup("dataset", "/project/p1/datasets", [row], "").items[0]?.url,
    ).toBe("/project/p1/datasets/c1");
  });

  it("caps matches at 100, so rows past the cap stay findable", () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({
      id: `id-${i}`,
      name: `n-${i}`,
    }));

    expect(toEntityGroup("annotation_queue", "/q", rows, "").items.length).toBe(
      100,
    );
    expect(
      toEntityGroup("annotation_queue", "/q", rows, "queue n-149").items.map(
        (item) => item.name,
      ),
    ).toEqual(["n-149"]);
  });

  it("is empty when the page is gated off, even with cached rows", () => {
    expect(
      toEntityGroup("evaluator", null, [{ id: "e1", name: "Toxicity" }], "")
        .items,
    ).toEqual([]);
  });
});
