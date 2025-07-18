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
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useCommandMenu } from "@/src/features/command-k-menu/CommandMenuProvider";
import { useProjectSettingsPages } from "@/src/pages/project/[projectId]/settings";
import { useOrganizationSettingsPages } from "@/src/pages/organization/[organizationId]/settings";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { api } from "@/src/utils/api";
import { type NavigationItem } from "@/src/components/layouts/utilities/routes";

export function CommandMenu({
  mainNavigation,
}: {
  mainNavigation: NavigationItem[];
}) {
  const { open, setOpen } = useCommandMenu();
  const router = useRouter();
  const { allProjectItems } = useNavigationItems();
  const settingsPages = useProjectSettingsPages();
  const orgSettingsPages = useOrganizationSettingsPages();
  const { organization, project } = useQueryProjectOrOrganization();

  const projectSettingsItems = settingsPages
    .filter((page) => page.show !== false && !("href" in page))
    .map((page) => ({
      title: `Project Settings > ${page.title}`,
      url: `/project/${project?.id}/settings${page.slug === "index" ? "" : `/${page.slug}`}`,
      keywords: page.cmdKKeywords || [],
    }));

  const orgSettingsItems = orgSettingsPages
    .filter((page) => page.show !== false && !("href" in page))
    .map((page) => ({
      title: `Organization Settings > ${page.title}`,
      url: `/organization/${organization?.id}/settings${page.slug === "index" ? "" : `/${page.slug}`}`,
      keywords: page.cmdKKeywords || [],
    }));

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
    .filter(
      (item) =>
        Boolean(item.url) && // no empty urls
        !item.url.includes("["), // no dynamic routes without inserted values
    );

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

  const dashboardItems =
    dashboardsQuery.data?.dashboards.map((d) => ({
      title: `Dashboard > ${d.name}`,
      url: `/project/${project?.id}/dashboards/${d.id}`,
      keywords: [
        "dashboard",
        d.name.toLowerCase(),
        (d.description ?? "").toLowerCase(),
      ],
      active: router.query.dashboardId === d.id,
    })) ?? [];

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
                setOpen(false);
              }}
            >
              {item.title}
            </CommandItem>
          ))}
        </CommandGroup>
        {allProjectItems.length > 0 && (
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
                    setOpen(false);
                  }}
                >
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {dashboardItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Dashboards">
              {dashboardItems.map((item) => (
                <CommandItem
                  key={item.url}
                  value={item.title}
                  keywords={item.keywords}
                  disabled={item.active}
                  onSelect={() => {
                    router.push(item.url);
                    capture("cmd_k_menu:navigated", {
                      type: "dashboard",
                      title: item.title,
                      url: item.url,
                    });
                    setOpen(false);
                  }}
                >
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {projectSettingsItems.length > 0 && (
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
                    setOpen(false);
                  }}
                >
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {orgSettingsItems.length > 0 && (
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
                    setOpen(false);
                  }}
                >
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

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
