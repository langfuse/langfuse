import { cn } from "@/src/utils/tailwind";
import { ArrowUpRight } from "@langfuse/icons";
import Link from "next/link";
import { type ReactNode } from "react";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useRouter } from "next/router";

type SettingsPage = {
  title: string;
  slug: string;
  section?: string;
  show?: boolean | (() => boolean);
  /** Lists the page but blocks opening it; shown as the entry's tooltip */
  disabledReason?: string;
  /** Marks the entry with a dot when something there needs the user */
  indicator?: boolean;
} & (
  | { content: ReactNode }
  | {
      href: string;
      /** Hides the external-link arrow for links that stay in the settings nav */
      internal?: boolean;
    }
);

type SettingsProps = {
  pages: Array<SettingsPage>;
  activeSlug?: string;
  fullHeight?: boolean;
  /** Replaces a section's label; rendered even when the section has no pages */
  sectionHeaders?: Record<string, ReactNode>;
  /** Shown next to a section's default label, e.g. a Beta badge */
  sectionBadges?: Record<string, ReactNode>;
};

const pageKey = (page: SettingsPage) => `${page.section ?? ""}:${page.slug}`;

export const PagedSettingsContainer = ({
  pages,
  activeSlug,
  fullHeight = false,
  sectionHeaders = {},
  sectionBadges = {},
}: SettingsProps) => {
  const router = useRouter();
  const availablePages = pages.filter(isSettingsPageShown);

  const contentPages = availablePages.filter((page) => "content" in page);
  const enabledContentPages = contentPages.filter(
    (page) => !page.disabledReason,
  );
  const requestedPage = contentPages.find((page) => page.slug === activeSlug);
  const currentPage = requestedPage?.disabledReason
    ? (enabledContentPages.find(
        (page) => page.section === requestedPage.section,
      ) ?? enabledContentPages[0])
    : (requestedPage ?? enabledContentPages[0]);

  const onChange = (newSlug: string) => {
    router.push(settingsPath(router.asPath, newSlug));
  };

  const handleSelectPage = (key: string) => {
    const page = availablePages.find((p) => pageKey(p) === key);
    if (!page || page.disabledReason) return;
    if ("href" in page) router.push(page.href);
    else onChange(page.slug);
  };

  const groups = groupPagesBySection(availablePages);
  const headerOnlySections = Object.keys(sectionHeaders).filter(
    (section) => !groups.some((group) => group.section === section),
  );

  return (
    <main
      className={cn(
        "flex flex-1 flex-col gap-4 py-4 md:gap-8",
        fullHeight && "min-h-0 overflow-hidden",
      )}
    >
      <div
        className={cn(
          "grid w-full items-start gap-4 md:grid-cols-[150px_1fr] lg:grid-cols-[220px_1fr]",
          fullHeight &&
            "min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1",
        )}
      >
        <nav className="flex flex-col gap-2 md:hidden">
          {Object.entries(sectionHeaders).map(([section, header]) => (
            <div key={section}>{header}</div>
          ))}
          <Select
            onValueChange={handleSelectPage}
            value={currentPage ? pageKey(currentPage) : undefined}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a page" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectGroup key={group.section ?? "default"}>
                  {group.section ? (
                    <SelectLabel className="flex items-center gap-2">
                      {group.section}
                      {sectionBadges[group.section]}
                    </SelectLabel>
                  ) : null}
                  {group.pages.map((page) => (
                    <SelectItem
                      key={pageKey(page)}
                      value={pageKey(page)}
                      disabled={!!page.disabledReason}
                    >
                      {page.title}
                      {"href" in page && !page.internal && (
                        <ArrowUpRight
                          size="base"
                          __rawClassName="ml-1 inline"
                        />
                      )}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </nav>
        <nav
          className={cn(
            "text-muted-foreground hidden text-sm md:sticky md:top-5 md:grid md:gap-y-1",
            fullHeight && "md:top-0",
          )}
          x-chunk="dashboard-04-chunk-0"
        >
          {[
            ...groups,
            ...headerOnlySections.map((section) => ({ section, pages: [] })),
          ].map((group) => (
            <div
              key={group.section ?? "default"}
              className="grid gap-y-1 [&:not(:first-child)]:mt-4"
            >
              {group.section
                ? (sectionHeaders[group.section] ?? (
                    <span className="text-foreground flex h-8 items-center gap-2 px-2 text-xs font-bold">
                      {group.section}
                      {sectionBadges[group.section]}
                    </span>
                  ))
                : null}
              {group.pages.map((page) =>
                page.disabledReason ? (
                  <DisabledNavEntry
                    key={pageKey(page)}
                    title={page.title}
                    reason={page.disabledReason}
                  />
                ) : (
                  <NavEntry
                    key={pageKey(page)}
                    page={page}
                    isActive={page === currentPage}
                    contentHref={settingsPath(router.asPath, page.slug)}
                  />
                ),
              )}
            </div>
          ))}
        </nav>
        <div
          className={cn(
            "w-full overflow-hidden p-1",
            fullHeight && "h-full min-h-0",
          )}
        >
          {currentPage && "content" in currentPage ? currentPage.content : null}
        </div>
      </div>
    </main>
  );
};

const navEntryClassName =
  "hover:bg-muted hover:text-foreground focus-visible:ring-ring flex h-8 items-center gap-2 rounded-sm px-2 focus-visible:ring-2 focus-visible:outline-hidden";

function NavEntry({
  page,
  isActive,
  contentHref,
}: {
  page: SettingsPage;
  isActive: boolean;
  contentHref: string;
}) {
  if ("href" in page) {
    return (
      <Link href={page.href} className={navEntryClassName}>
        {page.title}
        {page.indicator && <NavIndicator />}
        {!page.internal && <ArrowUpRight size="base" __rawClassName="inline" />}
      </Link>
    );
  }

  return (
    <Link
      href={contentHref}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        navEntryClassName,
        isActive && "bg-muted text-primary font-bold",
      )}
    >
      {page.title}
      {page.indicator && <NavIndicator />}
    </Link>
  );
}

function NavIndicator() {
  return (
    <span
      aria-label="Needs your attention"
      className="size-1.75 shrink-0 rounded-full bg-orange-400"
    />
  );
}

function DisabledNavEntry({
  title,
  reason,
}: {
  title: string;
  reason: string;
}) {
  return (
    <Tooltip label={reason} placement="right" hoverableContent={false}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          role="link"
          aria-disabled="true"
          tabIndex={0}
          className="text-muted-foreground/50 focus-visible:ring-ring flex h-8 w-fit cursor-not-allowed items-center rounded-sm px-2 focus-visible:ring-2 focus-visible:outline-hidden"
        >
          {title}
        </span>
      )}
    </Tooltip>
  );
}

function settingsPath(asPath: string, slug: string) {
  const pathSegments = asPath.split("?")[0].split("/");
  if (pathSegments[pathSegments.length - 1] !== "settings") pathSegments.pop();
  if (slug !== "index") pathSegments.push(slug);
  return pathSegments.join("/");
}

function groupPagesBySection<T extends { section?: string }>(pages: T[]) {
  return pages.reduce<Array<{ section: string | undefined; pages: T[] }>>(
    (groups, page) => {
      const previous = groups.at(-1);
      if (previous && previous.section === page.section) {
        previous.pages.push(page);
      } else {
        groups.push({ section: page.section, pages: [page] });
      }
      return groups;
    },
    [],
  );
}

/** isSettingsPageShown resolves a page's show flag, defaulting to shown */
export function isSettingsPageShown(page: Pick<SettingsPage, "show">) {
  if (typeof page.show === "function") return page.show();
  return page.show ?? true;
}
