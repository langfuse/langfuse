import {
  CommandMenu,
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
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { CommandMenuProvider } from "./CommandMenuProvider";

const menuMocks = vi.hoisted(() => ({
  push: vi.fn(),
  capture: vi.fn(),
  prompts: vi.fn(),
  datasets: vi.fn(),
  queues: vi.fn(),
  evaluators: vi.fn(),
  dashboards: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { projectId: "project-1" },
    route: "/project/[projectId]/traces",
    asPath: "/project/project-1/traces",
    push: menuMocks.push,
  }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { organizations: [] } } }),
}));
vi.mock("@/src/features/projects", () => ({
  useQueryProjectOrOrganization: () => ({ project: { id: "project-1" } }),
}));
vi.mock("@/src/features/events", () => ({
  useReadPath: () => ({ isV4: true }),
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => menuMocks.capture,
}));
vi.mock("@/src/features/in-app-agent", () => ({
  useInAppAiAgent: () => ({}),
  useIsInAppAgentLauncherVisible: () => false,
}));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  hasProjectAccess: ({ scope }: { scope: string }) => scope.endsWith(":read"),
}));
vi.mock("@/src/features/projects/ProjectSettingsPage", () => ({
  useProjectSettingsPages: () => [],
}));
vi.mock("@/src/features/organizations/OrganizationSettingsPage", () => ({
  useOrganizationSettingsPages: () => [],
}));
vi.mock("@/src/features/account", () => ({
  useAccountSettingsPages: () => [],
}));
vi.mock("@/src/utils/api", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  const endpoint = (
    name: string,
    fetch: (input: Record<string, unknown>) => Promise<unknown>,
  ) => ({
    useQuery: (
      input: Record<string, unknown>,
      options: Omit<Parameters<typeof useQuery>[0], "queryKey">,
    ) =>
      useQuery({
        ...options,
        queryKey: [name, input],
        queryFn: () => fetch(input),
      }),
  });
  return {
    api: {
      prompts: { allNames: endpoint("prompts", menuMocks.prompts) },
      datasets: { allNamesAndIds: endpoint("datasets", menuMocks.datasets) },
      annotationQueues: {
        allNamesAndIds: endpoint("queues", menuMocks.queues),
      },
      evalsV2: { options: endpoint("evaluators", menuMocks.evaluators) },
      dashboard: {
        allDashboards: endpoint("dashboards", menuMocks.dashboards),
      },
    },
  };
});

describe("command menu search lifecycle", () => {
  const rows = [
    { id: "correctness", name: "Correctness" },
    { id: "safety", name: "Safety" },
  ];
  const clients: QueryClient[] = [];

  function toggleMenu() {
    fireEvent.keyDown(document, { key: "k", metaKey: true });
  }

  function mountMenu() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    clients.push(client);
    render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          CommandMenuProvider,
          null,
          createElement(CommandMenu, {
            mainNavigation: [
              {
                title: "Evaluators",
                isActive: false,
                href: "/project/[projectId]/evals",
                url: "/project/project-1/evals",
              },
              {
                title: "Prompts",
                isActive: false,
                href: "/project/[projectId]/prompts",
                url: "/project/project-1/prompts",
              },
              {
                title: "Dashboards",
                isActive: false,
                href: "/project/[projectId]/dashboards",
                url: "/project/project-1/dashboards",
              },
            ],
          }),
        ),
      ),
    );
    toggleMenu();
    return client;
  }

  async function advance(ms = 0) {
    await act(() => vi.advanceTimersByTimeAsync(ms));
    await act(() => vi.advanceTimersByTimeAsync(0));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    menuMocks.prompts.mockResolvedValue([{ id: "p1", name: "Safety prompt" }]);
    menuMocks.datasets.mockResolvedValue([]);
    menuMocks.queues.mockResolvedValue([]);
    menuMocks.dashboards.mockResolvedValue({ dashboards: [] });
    menuMocks.evaluators.mockImplementation(
      async ({ search }: { search?: string }) =>
        rows.filter(
          (row) =>
            !search || row.name.toLowerCase().includes(search.toLowerCase()),
        ),
    );
  });

  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
  });

  it("removes all actionable results as soon as the query changes", async () => {
    mountMenu();
    await advance();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Safety" },
    });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Searching");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(menuMocks.push).not.toHaveBeenCalled();
    await advance(600);
    expect(screen.getByRole("option", { name: "Safety" })).toBeVisible();
  });

  it("waits for every result source instead of publishing partial lists", async () => {
    const dashboardResponse = Promise.withResolvers<{ dashboards: never[] }>();
    const promptResponse = Promise.withResolvers<typeof rows>();
    menuMocks.dashboards.mockReturnValue(dashboardResponse.promise);
    menuMocks.prompts.mockReturnValue(promptResponse.promise);
    mountMenu();
    await advance();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    await act(async () => dashboardResponse.resolve({ dashboards: [] }));
    await advance();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    await act(async () => promptResponse.resolve([]));
    await advance();
    expect(screen.getByRole("option", { name: "Evaluators" })).toBeVisible();
  });

  it("ignores an older response that arrives after the current query", async () => {
    mountMenu();
    await advance();
    const oldResponse = Promise.withResolvers<typeof rows>();
    menuMocks.evaluators.mockImplementation(
      ({ search }: { search?: string }) =>
        search === "correctness"
          ? oldResponse.promise
          : Promise.resolve([rows[1]]),
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Correctness" },
    });
    await advance(250);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Safety" },
    });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    await advance(250);
    const safety = screen.getByRole("option", { name: "Safety" });
    await act(async () => oldResponse.resolve([rows[0]]));
    await advance();
    expect(screen.getByRole("option", { name: "Safety" })).toBe(safety);
    expect(
      screen.queryByRole("option", { name: "Correctness" }),
    ).not.toBeInTheDocument();
    fireEvent.click(safety);
    expect(menuMocks.push).toHaveBeenCalledWith(
      "/project/project-1/evals/safety",
    );
  });

  it("hides cached rows while refreshing on reopen", async () => {
    mountMenu();
    await advance();
    toggleMenu();
    const dashboardResponse = Promise.withResolvers<{ dashboards: never[] }>();
    menuMocks.dashboards.mockReturnValue(dashboardResponse.promise);
    toggleMenu();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    await act(async () => dashboardResponse.resolve({ dashboards: [] }));
    await advance();
    expect(screen.getByRole("option", { name: "Evaluators" })).toBeVisible();
  });

  it("keeps the visible list stable on focus and reconnect", async () => {
    mountMenu();
    await advance();
    const options = screen.getAllByRole("option");
    await act(async () => {
      focusManager.setFocused(false);
      onlineManager.setOnline(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(true);
    });
    await advance();
    expect(screen.getAllByRole("option")).toEqual(options);
    expect(menuMocks.dashboards).toHaveBeenCalledTimes(1);
    expect(menuMocks.evaluators).toHaveBeenCalledTimes(1);
    expect(menuMocks.prompts).toHaveBeenCalledTimes(1);
  });

  it("removes actionable rows during an explicit refresh", async () => {
    const client = mountMenu();
    await advance();
    const dashboardResponse = Promise.withResolvers<{ dashboards: never[] }>();
    menuMocks.dashboards.mockReturnValue(dashboardResponse.promise);
    act(() => {
      client.invalidateQueries({ queryKey: ["dashboards"] });
    });
    await advance();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(menuMocks.push).not.toHaveBeenCalled();
    await act(async () => dashboardResponse.resolve({ dashboards: [] }));
    await advance();
    expect(screen.getByRole("option", { name: "Evaluators" })).toBeVisible();
  });

  it("releases navigation when a result source fails", async () => {
    menuMocks.dashboards.mockRejectedValue(new Error("Unavailable"));
    mountMenu();
    await advance();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Evaluators" })).toBeVisible();
  });

  it("discards a pending search when the menu closes", async () => {
    mountMenu();
    await advance();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Correctness" },
    });
    toggleMenu();
    await advance(600);
    toggleMenu();
    await advance();
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(
      menuMocks.evaluators.mock.calls.map(([input]) => input.search),
    ).not.toContain("correctness");
    expect(
      menuMocks.capture.mock.calls.filter(
        ([event]) => event === "cmd_k_menu:search_entered",
      ),
    ).toHaveLength(0);
  });

  it("keeps evaluator keyword results after the server search completes", async () => {
    mountMenu();
    await advance();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "eval Safety" },
    });
    await advance(600);
    expect(screen.getByRole("option", { name: "Safety" })).toBeVisible();
  });
});

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
