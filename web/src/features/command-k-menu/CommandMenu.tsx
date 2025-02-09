import { type NavigationItem } from "@/src/components/layouts/layout";
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

export function CommandMenu({
  mainNavigation,
}: {
  mainNavigation: NavigationItem[];
}) {
  const { open, setOpen } = useCommandMenu();
  const router = useRouter();
  const { allProjectItems } = useNavigationItems();
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
        if (extendValue.toLowerCase().includes(search.toLowerCase())) return 1;
        return 0;
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
