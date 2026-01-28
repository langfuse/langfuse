import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import { useRouter } from "next/router";
import { useEffect, memo } from "react";
import { useSession } from "next-auth/react";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useCommandMenu } from "@/src/features/command-k-menu/CommandMenuProvider";
import { useProjectSettingsPages } from "@/src/pages/project/[projectId]/settings";
import { useOrganizationSettingsPages } from "@/src/pages/organization/[organizationId]/settings";
import { useAccountSettingsPages } from "@/src/pages/account/settings";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { api } from "@/src/utils/api";
import { type NavigationItem } from "@/src/components/layouts/utilities/routes";

function MainNavigationGroup({
  navItems,
  onNavigate,
}: {
  navItems: Array<{ title: string; url: string }>;
  onNavigate: (item: { title: string; url: string }) => void;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();

  return (
    <CommandGroup heading="Main Navigation">
      {navItems.map((item) => (
        <CommandItem
          key={item.url}
          value={item.url}
          keywords={[item.title]}
          onSelect={() => {
            router.push(item.url);
            capture("cmd_k_menu:navigated", {
              type: "main_navigation",
              title: item.title,
              url: item.url,
            });
            onNavigate(item);
          }}
        >
          {item.title}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function ProjectsGroup({ onNavigate }: { onNavigate: () => void }) {
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
              onNavigate();
            }}
          >
            {item.title}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

function DashboardsGroup({ onNavigate }: { onNavigate: () => void }) {
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
              onNavigate();
            }}
          >
            {dashboard.name}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

function ProjectSettingsGroup({ onNavigate }: { onNavigate: () => void }) {
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
      <CommandGroup heading="Project Settings">
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
              onNavigate();
            }}
          >
            {item.title}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

function OrganizationSettingsGroup({ onNavigate }: { onNavigate: () => void }) {
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
      <CommandGroup heading="Organization Settings">
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
              onNavigate();
            }}
          >
            {item.title}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

function AccountSettingsGroup({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const accountSettingsPages = useAccountSettingsPages();

  const accountSettingsItems = accountSettingsPages.map((page) => ({
    title: `Account Settings > ${page.title}`,
    url: `/account/settings${page.slug === "index" ? "" : `/${page.slug}`}`,
    keywords: page.cmdKKeywords || [],
  }));

  if (accountSettingsItems.length === 0) return null;

  return (
    <>
      <CommandSeparator />
      <CommandGroup heading="Account Settings">
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
              onNavigate();
            }}
          >
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

  const debouncedSearchChange = useDebounce(
    (value: string) => {
      capture("cmd_k_menu:search_entered", {
        search: value,
      });
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
        }));
      }
      return [
        {
          title: item.title,
          url: item.url,
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
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [capture, setOpen, open]);

  const handleNavigate = () => {
    setOpen(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
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
        placeholder="Type a command or search..."
        className="border-none focus:border-none focus:outline-none focus:ring-0 focus:ring-transparent"
        onValueChange={debouncedSearchChange}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <MainNavigationGroup navItems={navItems} onNavigate={handleNavigate} />
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
