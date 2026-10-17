/* eslint-disable @repo/no-null-render */
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/src/components/ui/command";
import { useRouter } from "next/router";
import {
  BotMessageSquare,
  Grid2X2,
  LayoutDashboard,
  ListTree,
  Moon,
  Plus,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Fragment, useEffect, memo, useState } from "react";
import { useSession } from "next-auth/react";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useCommandMenu } from "@/src/features/command-k-menu/CommandMenuProvider";
import { useOrganizationSettingsPages } from "@/src/features/organizations/OrganizationSettingsPage";
import { useAccountSettingsPages } from "@/src/features/account";
import { useQueryProjectOrOrganization } from "@/src/features/projects";
import { useProjectSettingsPages } from "@/src/features/projects/ProjectSettingsPage";
import { api } from "@/src/utils/api";
import { type NavigationItem } from "@/src/components/layouts/utilities/routes";
import useLocalStorage from "@/src/components/useLocalStorage";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type ProjectScope } from "@langfuse/shared";
import { useReadPath } from "@/src/features/events";
import {
  useInAppAiAgent,
  useIsInAppAgentLauncherVisible,
} from "@/src/features/in-app-agent";

type IdNavigationItem = {
  type: "trace_id" | "observation_id";
  title: string;
  url: string;
};

const getIdType = (search: string): IdNavigationItem["type"] | null => {
  const id = search.trim();
  if (/^[0-9a-f]{32}$/i.test(id)) return "trace_id";
  if (/^[0-9a-f]{16}$/i.test(id)) return "observation_id";
  return null;
};

export const getIdNavigationItem = (
  search: string,
  projectId?: string,
  isV4 = false,
): IdNavigationItem | null => {
  if (!projectId) return null;

  const id = search.trim();
  const encodedProjectId = encodeURIComponent(projectId);
  const idType = getIdType(id);

  if (idType === "trace_id") {
    const filter = `${isV4 ? "traceId;string;;contains" : "id;string;;="};${encodeURIComponent(id)}`;
    return {
      type: "trace_id",
      title: "Find trace by ID",
      url: `/project/${encodedProjectId}/traces?filter=${encodeURIComponent(filter)}`,
    };
  }

  if (idType === "observation_id") {
    const filter = isV4
      ? `id;string;;contains;${encodeURIComponent(id)}`
      : `id;stringOptions;;any of;${encodeURIComponent(id)}`;
    return {
      type: "observation_id",
      title: "Find observation by ID",
      url: `/project/${encodedProjectId}/${isV4 ? "traces" : "observations"}?filter=${encodeURIComponent(filter)}`,
    };
  }

  return null;
};

export const getSearchAnalytics = (search: string) => ({
  queryLength: search.length,
  queryType: getIdType(search) ?? "other",
});

const RECENTS_LIMIT = 4;

const RECENT_ICON_BY_TYPE: Record<string, LucideIcon> = {
  create_action: Plus,
  dashboard: LayoutDashboard,
  project: Grid2X2,
  project_settings: Settings,
  organization_settings: Settings,
  account_settings: Settings,
};

// Each action is offered only while its page is in the sidebar, so it
// inherits the sidebar's feature, plan and v4 gating.
const NAV_CREATE_ACTIONS: Array<{
  navHref: string;
  title: string;
  scope: ProjectScope;
  keywords: string[];
}> = [
  {
    navHref: "/project/[projectId]/dashboards",
    title: "New dashboard",
    scope: "dashboards:CUD",
    keywords: ["create", "add", "dashboard"],
  },
  {
    navHref: "/project/[projectId]/prompts",
    title: "New prompt",
    scope: "prompts:CUD",
    keywords: ["create", "add", "prompt"],
  },
  {
    navHref: "/project/[projectId]/evals",
    title: "New evaluator",
    scope: "evaluator:CUD",
    keywords: ["create", "add", "evaluator", "eval", "llm as a judge"],
  },
  {
    navHref: "/project/[projectId]/alerts",
    title: "New alert",
    scope: "alerts:CUD",
    keywords: ["create", "add", "alert", "monitor"],
  },
];

function RecentGroup({
  recents,
  iconByUrl,
  onNavigate,
}: {
  recents: RecentEntry[];
  iconByUrl: Map<string, LucideIcon | undefined>;
  onNavigate: (entry: RecentEntry) => void;
}) {
  if (recents.length === 0) return null;

  return (
    <CommandGroup heading="Recent">
      {recents.map((entry) => (
        <RecentItem
          key={entry.url}
          entry={entry}
          icon={
            entry.type === "main_navigation"
              ? iconByUrl.get(entry.url)
              : RECENT_ICON_BY_TYPE[entry.type]
          }
          onNavigate={onNavigate}
        />
      ))}
    </CommandGroup>
  );
}

function RecentItem({
  entry,
  icon: Icon,
  onNavigate,
}: {
  entry: RecentEntry;
  icon: LucideIcon | undefined;
  onNavigate: (entry: RecentEntry) => void;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();

  const handleSelect = () => {
    router.push(entry.url);
    capture("cmd_k_menu:navigated", {
      type: "recent",
      title: entry.title,
      url: entry.url,
    });
    onNavigate(entry);
  };

  return (
    <CommandItem value={`recent:${entry.url}`} onSelect={handleSelect}>
      {Icon && <Icon className="icon-base" />}
      {entry.title}
    </CommandItem>
  );
}

function CreateActionItem({
  action,
  onNavigate,
}: {
  action: CreateAction;
  onNavigate: (entry: RecentEntry) => void;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();

  const handleSelect = () => {
    router.push(action.url);
    capture("cmd_k_menu:navigated", {
      type: "create_action",
      title: action.title,
      url: action.url,
    });
    onNavigate({
      title: action.title,
      url: action.url,
      type: "create_action",
    });
  };

  return (
    <CommandItem
      value={action.title}
      keywords={action.keywords}
      onSelect={handleSelect}
    >
      <Plus className="icon-base" />
      {action.title}
    </CommandItem>
  );
}

function AssistantItem({ onDone }: { onDone: () => void }) {
  const { openAssistant, selectConversation } = useInAppAiAgent();
  const isLauncherVisible = useIsInAppAgentLauncherVisible();

  if (!isLauncherVisible) return null;

  const handleSelect = () => {
    onDone();
    selectConversation(null);
    openAssistant("command_menu");
  };

  return (
    <CommandItem
      value="Ask Assistant"
      keywords={["assistant", "ai", "agent", "chat", "new chat", "ask"]}
      onSelect={handleSelect}
    >
      <BotMessageSquare className="icon-base" />
      Ask Assistant
      <CommandShortcut keys={["Mod", "I"]} variant="subtle" />
    </CommandItem>
  );
}

function ThemeItem({ onDone }: { onDone: () => void }) {
  const { resolvedTheme, setTheme } = useTheme();
  const capture = usePostHogClientCapture();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const Icon = nextTheme === "dark" ? Moon : Sun;

  const handleSelect = () => {
    onDone();
    setTheme(nextTheme);
    capture("user_settings:theme_changed", {
      theme: nextTheme,
      source: "command_menu",
    });
  };

  return (
    <CommandItem
      value={`Switch to ${nextTheme} theme`}
      keywords={["theme", "dark", "light", "mode", "appearance"]}
      onSelect={handleSelect}
    >
      <Icon className="icon-base" />
      Switch to {nextTheme} theme
    </CommandItem>
  );
}

function MainNavigationGroup({
  navItems,
  createActions,
  showCreateActions,
  onNavigate,
  onDone,
}: {
  navItems: Array<{ title: string; url: string; icon?: LucideIcon }>;
  createActions: CreateActions;
  showCreateActions: boolean;
  onNavigate: (entry: RecentEntry) => void;
  onDone: () => void;
}) {
  return (
    <CommandGroup heading="Go to">
      <AssistantItem onDone={onDone} />
      {navItems.map((item) => (
        <Fragment key={item.url}>
          <MainNavigationItem item={item} onNavigate={onNavigate} />
          {showCreateActions &&
            createActions.byNavUrl
              .get(item.url)
              ?.map((action) => (
                <CreateActionItem
                  key={action.url}
                  action={action}
                  onNavigate={onNavigate}
                />
              ))}
        </Fragment>
      ))}
      {showCreateActions &&
        createActions.standalone.map((action) => (
          <CreateActionItem
            key={action.url}
            action={action}
            onNavigate={onNavigate}
          />
        ))}
      {showCreateActions && <ThemeItem onDone={onDone} />}
    </CommandGroup>
  );
}

function MainNavigationItem({
  item,
  onNavigate,
}: {
  item: { title: string; url: string; icon?: LucideIcon };
  onNavigate: (entry: RecentEntry) => void;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();

  const handleSelect = () => {
    router.push(item.url);
    capture("cmd_k_menu:navigated", {
      type: "main_navigation",
      title: item.title,
      url: item.url,
    });
    onNavigate({ title: item.title, url: item.url, type: "main_navigation" });
  };

  return (
    <CommandItem
      value={item.url}
      keywords={[item.title]}
      onSelect={handleSelect}
    >
      {item.icon && <item.icon className="icon-base" />}
      {item.title}
    </CommandItem>
  );
}

function ProjectsGroup({
  onNavigate,
}: {
  onNavigate: (entry: RecentEntry) => void;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const { allProjectItems } = useNavigationItems();

  if (allProjectItems.length === 0) return null;

  return (
    <>
      <CommandSeparator />
      <CommandGroup heading="Projects">
        {allProjectItems.map((item) => (
          <CommandItem
            key={item.url}
            value={item.title}
            keywords={item.keywords}
            disabled={item.active}
            onSelect={() => {
              router.push(item.url);
              capture("cmd_k_menu:navigated", {
                type: "project",
                title: item.title,
                url: item.url,
              });
              onNavigate({
                title: item.title,
                url: `/project/${item.projectId}`,
                type: "project",
              });
            }}
          >
            <Grid2X2 className="icon-base" />
            {item.title}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

function DashboardsGroup({
  onNavigate,
}: {
  onNavigate: (entry: RecentEntry) => void;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const { project } = useQueryProjectOrOrganization();
  const { open } = useCommandMenu();

  const dashboardsQuery = api.dashboard.allDashboards.useQuery(
    {
      projectId: project?.id ?? "",
      orderBy: {
        column: "updatedAt",
        order: "DESC",
      },
      limit: 100,
      page: 0,
    },
    {
      enabled: open && Boolean(project?.id),
    },
  );

  const dashboards = dashboardsQuery.data?.dashboards ?? [];

  if (dashboards.length === 0) return null;

  return (
    <>
      <CommandSeparator />
      <CommandGroup heading="Dashboards">
        {dashboards.map((dashboard) => (
          <CommandItem
            key={dashboard.id}
            value={`Dashboard > ${dashboard.name}`}
            keywords={[
              "dashboard",
              dashboard.name.toLowerCase(),
              (dashboard.description ?? "").toLowerCase(),
            ]}
            disabled={router.query.dashboardId === dashboard.id}
            onSelect={() => {
              const url = `/project/${project?.id}/dashboards/${dashboard.id}`;
              router.push(url);
              capture("cmd_k_menu:navigated", {
                type: "dashboard",
                title: `Dashboard > ${dashboard.name}`,
                url: url,
              });
              onNavigate({ title: dashboard.name, url, type: "dashboard" });
            }}
          >
            <LayoutDashboard className="icon-base" />
            {dashboard.name}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

function ProjectSettingsGroup({
  onNavigate,
}: {
  onNavigate: (entry: RecentEntry) => void;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const settingsPages = useProjectSettingsPages();
  const { project } = useQueryProjectOrOrganization();

  const projectSettingsItems = settingsPages
    .filter((page) => page.show !== false && !("href" in page))
    .map((page) => ({
      title: `Project Settings > ${page.title}`,
      url: `/project/${project?.id}/settings${page.slug === "index" ? "" : `/${page.slug}`}`,
      keywords: page.cmdKKeywords || [],
    }));

  if (projectSettingsItems.length === 0) return null;

  return (
    <>
      <CommandSeparator />
      <CommandGroup heading="Project settings">
        {projectSettingsItems.map((item) => (
          <CommandItem
            key={item.url}
            value={item.title}
            keywords={item.keywords}
            onSelect={() => {
              router.push(item.url);
              capture("cmd_k_menu:navigated", {
                type: "project_settings",
                title: item.title,
                url: item.url,
              });
              onNavigate({
                title: item.title,
                url: item.url,
                type: "project_settings",
              });
            }}
          >
            <Settings className="icon-base" />
            {item.title}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

function OrganizationSettingsGroup({
  onNavigate,
}: {
  onNavigate: (entry: RecentEntry) => void;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const orgSettingsPages = useOrganizationSettingsPages();
  const { organization } = useQueryProjectOrOrganization();

  const orgSettingsItems = orgSettingsPages
    .filter((page) => page.show !== false && !("href" in page))
    .map((page) => ({
      title: `Organization Settings > ${page.title}`,
      url: `/organization/${organization?.id}/settings${page.slug === "index" ? "" : `/${page.slug}`}`,
      keywords: page.cmdKKeywords || [],
    }));

  if (orgSettingsItems.length === 0) return null;

  return (
    <>
      <CommandSeparator />
      <CommandGroup heading="Organization settings">
        {orgSettingsItems.map((item) => (
          <CommandItem
            key={item.url}
            value={item.title}
            keywords={item.keywords}
            onSelect={() => {
              router.push(item.url);
              capture("cmd_k_menu:navigated", {
                type: "organization_settings",
                title: item.title,
                url: item.url,
              });
              onNavigate({
                title: item.title,
                url: item.url,
                type: "organization_settings",
              });
            }}
          >
            <Settings className="icon-base" />
            {item.title}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

function AccountSettingsGroup({
  onNavigate,
}: {
  onNavigate: (entry: RecentEntry) => void;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const accountSettingsPages = useAccountSettingsPages();

  const accountSettingsItems = accountSettingsPages
    .filter((page) => !("href" in page))
    .map((page) => ({
      title: `Account Settings > ${page.title}`,
      url: `/account/settings${page.slug === "index" ? "" : `/${page.slug}`}`,
      keywords: page.cmdKKeywords || [],
    }));

  if (accountSettingsItems.length === 0) return null;

  return (
    <>
      <CommandSeparator />
      <CommandGroup heading="Account settings">
        {accountSettingsItems.map((item) => (
          <CommandItem
            key={item.url}
            value={item.title}
            keywords={item.keywords}
            onSelect={() => {
              router.push(item.url);
              capture("cmd_k_menu:navigated", {
                type: "account_settings",
                title: item.title,
                url: item.url,
              });
              onNavigate({
                title: item.title,
                url: item.url,
                type: "account_settings",
              });
            }}
          >
            <Settings className="icon-base" />
            {item.title}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

function CommandMenuComponent({
  mainNavigation,
}: {
  mainNavigation: NavigationItem[];
}) {
  const { open, setOpen } = useCommandMenu();
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const { project } = useQueryProjectOrOrganization();
  const { isV4 } = useReadPath();
  const [search, setSearch] = useState("");
  const { recents, addRecent } = useCommandMenuRecents(project?.id);
  const createActions = useCreateActions(mainNavigation);
  const idNavigationItem = getIdNavigationItem(search, project?.id, isV4);

  const debouncedSearchChange = useDebounce(
    (value: string) => {
      capture("cmd_k_menu:search_entered", getSearchAnalytics(value));
    },
    500,
    false,
  );

  const navItems = mainNavigation
    .flatMap((item) => {
      if (item.items) {
        // if the item has children, return the children and not the parent
        return item.items.map((child) => ({
          title: `${item.title} > ${child.title}`,
          url: child.url,
          icon: item.icon,
        }));
      }
      return [
        {
          title: item.title,
          url: item.url,
          icon: item.icon,
        },
      ];
    })
    .filter((item) => Boolean(item.url) && !item.url.includes("["));

  // Keyboard shortcut effect
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!open) {
          capture("cmd_k_menu:opened", {
            source: "cmd_k",
          });
        }
        const nextOpen = !open;
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [capture, setOpen, open]);

  const flatNavigation = flattenNavigation(mainNavigation);
  const iconByUrl = new Map(
    flatNavigation.map((item) => [item.url, item.icon]),
  );
  const visibleRecents = getVisibleRecents(recents, {
    navUrls: new Set(flatNavigation.map((item) => item.url)),
    createUrls: new Set(
      [
        ...[...createActions.byNavUrl.values()].flat(),
        ...createActions.standalone,
      ].map((action) => action.url),
    ),
  });

  const handleNavigate = (entry?: RecentEntry) => {
    if (entry) addRecent(entry);
    setSearch("");
    setOpen(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
      filter={(value, search, keywords) => {
        const extendValue = value + " " + keywords?.join(" ");
        const searchTerms = search.toLowerCase().split(" ");
        return searchTerms.every((term) =>
          extendValue.toLowerCase().includes(term),
        )
          ? 1
          : 0;
      }}
    >
      <CommandInput
        placeholder="Search pages, projects, dashboards…"
        className="border-none text-lg focus:border-none focus:ring-0 focus:ring-transparent focus:outline-hidden"
        value={search}
        onValueChange={(value) => {
          setSearch(value);
          debouncedSearchChange(value);
        }}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {idNavigationItem ? (
          <CommandGroup heading="Tracing">
            <CommandItem
              value={`${idNavigationItem.title} ${search}`}
              onSelect={() => {
                router.push(idNavigationItem.url);
                capture("cmd_k_menu:navigated", {
                  type: idNavigationItem.type,
                });
                handleNavigate();
              }}
            >
              <ListTree className="icon-base" />
              {idNavigationItem.title}
            </CommandItem>
          </CommandGroup>
        ) : null}
        {search === "" && (
          <RecentGroup
            recents={visibleRecents}
            iconByUrl={iconByUrl}
            onNavigate={handleNavigate}
          />
        )}
        <MainNavigationGroup
          navItems={navItems}
          createActions={createActions}
          showCreateActions={search !== ""}
          onNavigate={handleNavigate}
          onDone={() => handleNavigate()}
        />
        <ProjectsGroup onNavigate={handleNavigate} />
        <DashboardsGroup onNavigate={handleNavigate} />
        <ProjectSettingsGroup onNavigate={handleNavigate} />
        <OrganizationSettingsGroup onNavigate={handleNavigate} />
        <AccountSettingsGroup onNavigate={handleNavigate} />
      </CommandList>
    </CommandDialog>
  );
}

export const CommandMenu = memo(
  CommandMenuComponent,
  (prevProps, nextProps) => {
    // Only re-render if mainNavigation titles or urls change
    if (prevProps.mainNavigation.length !== nextProps.mainNavigation.length) {
      return false;
    }

    const isSame = prevProps.mainNavigation.every((item, idx) => {
      const nextItem = nextProps.mainNavigation[idx];
      const itemTitleUrl =
        item.title === nextItem.title && item.url === nextItem.url;

      if (!itemTitleUrl) {
        return false;
      }

      // Check children if they exist
      if (item.items && nextItem.items) {
        if (item.items.length !== nextItem.items.length) {
          return false;
        }
        const childrenMatch = item.items.every((child, childIdx) => {
          const nextChild = nextItem.items![childIdx];
          const match =
            child.title === nextChild.title && child.url === nextChild.url;
          return match;
        });
        return itemTitleUrl && childrenMatch;
      }

      if ((item.items || nextItem.items) && !(item.items && nextItem.items)) {
        return false;
      }

      return itemTitleUrl && !item.items && !nextItem.items;
    });

    return isSame;
  },
);

export const useNavigationItems = () => {
  const router = useRouter();
  const session = useSession();

  const organizations = session.data?.user?.organizations;

  const truncatePathBeforeDynamicSegments = (path: string) => {
    const allowlistedIds = ["[projectId]", "[organizationId]", "[page]"];
    const segments = router.route.split("/");
    const idSegments = segments.filter(
      (segment) => segment.startsWith("[") && segment.endsWith("]"),
    );
    const stopSegment = idSegments.filter((id) => !allowlistedIds.includes(id));
    if (stopSegment.length === 0) return path;
    const stopIndex = segments.indexOf(stopSegment[0]);
    const truncatedPath = path.split("/").slice(0, stopIndex).join("/");
    return truncatedPath;
  };

  const getProjectPath = (projectId: string) =>
    router.query.projectId
      ? truncatePathBeforeDynamicSegments(router.asPath).replace(
          router.query.projectId as string,
          projectId,
        )
      : `/project/${projectId}`;

  const allProjectItems = organizations
    ? organizations
        .sort((a, b) => {
          // sort demo org to the bottom
          const isDemoA = env.NEXT_PUBLIC_DEMO_ORG_ID === a.id;
          const isDemoB = env.NEXT_PUBLIC_DEMO_ORG_ID === b.id;
          if (isDemoA) return 1;
          if (isDemoB) return -1;
          return a.name.localeCompare(b.name);
        })
        .flatMap((org) =>
          org.projects.map((proj) => ({
            title: `${org.name} > ${proj.name}`,
            url: getProjectPath(proj.id),
            projectId: proj.id,
            active: router.query.projectId === proj.id,
            keywords: [
              "project",
              org.name.toLowerCase(),
              proj.name.toLowerCase(),
            ],
          })),
        )
    : [];

  return {
    allProjectItems,
    isLoading: !organizations,
  };
};

function useCommandMenuRecents(projectId: string | undefined) {
  const [recentsByProject, setRecentsByProject] = useLocalStorage<
    Record<string, RecentEntry[]>
  >("cmdk-recents", {});

  const recents = projectId ? (recentsByProject[projectId] ?? []) : [];

  const addRecent = (entry: RecentEntry) => {
    if (!projectId) return;
    setRecentsByProject((prev) => ({
      ...prev,
      [projectId]: addRecentEntry(prev[projectId] ?? [], entry),
    }));
  };

  return { recents, addRecent };
}

function useCreateActions(mainNavigation: NavigationItem[]): CreateActions {
  const session = useSession();
  const { project } = useQueryProjectOrOrganization();

  if (!project) return { byNavUrl: new Map(), standalone: [] };

  return buildCreateActions({
    navItems: flattenNavigation(mainNavigation),
    projectId: project.id,
    canCreate: (scope) =>
      hasProjectAccess({ session: session.data, scope, projectId: project.id }),
  });
}

/** Most recent first, one entry per URL, capped at RECENTS_LIMIT. */
export function addRecentEntry(
  recents: RecentEntry[],
  entry: RecentEntry,
): RecentEntry[] {
  return [entry, ...recents.filter((e) => e.url !== entry.url)].slice(
    0,
    RECENTS_LIMIT,
  );
}

/** Drops saved pages and create actions the live menu no longer offers. */
export function getVisibleRecents(
  recents: RecentEntry[],
  offered: { navUrls: Set<string>; createUrls: Set<string> },
): RecentEntry[] {
  return recents.filter((entry) => {
    if (entry.type === "main_navigation") return offered.navUrls.has(entry.url);
    if (entry.type === "create_action")
      return offered.createUrls.has(entry.url);
    return true;
  });
}

export function buildCreateActions({
  navItems,
  projectId,
  canCreate,
}: {
  navItems: Pick<NavigationItem, "href" | "url">[];
  projectId: string;
  canCreate: (scope: ProjectScope) => boolean;
}): CreateActions {
  const byNavUrl = new Map<string, CreateAction[]>();
  for (const navItem of navItems) {
    const action = NAV_CREATE_ACTIONS.find((a) => a.navHref === navItem.href);
    if (!action || !navItem.url || !canCreate(action.scope)) continue;
    byNavUrl.set(navItem.url, [
      {
        title: action.title,
        url: `${navItem.url}/new`,
        keywords: action.keywords,
      },
    ]);
  }

  const standalone: CreateAction[] = canCreate("automations:CUD")
    ? [
        {
          title: "New automation",
          url: `/project/${projectId}/automations?view=create`,
          keywords: ["create", "add", "automation", "webhook", "slack"],
        },
      ]
    : [];

  return { byNavUrl, standalone };
}

function flattenNavigation(items: NavigationItem[]): NavigationItem[] {
  return items.flatMap((item) => [
    item,
    ...flattenNavigation(item.items ?? []),
  ]);
}

type RecentEntry = { title: string; url: string; type: string };

type CreateAction = { title: string; url: string; keywords: string[] };

type CreateActions = {
  byNavUrl: Map<string, CreateAction[]>;
  standalone: CreateAction[];
};
