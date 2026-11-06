import { useId } from "react";
import { SidebarNavItem } from "@/src/components/nav/SidebarNavItem";
import { type RouteGroup } from "@/src/components/layouts/routes";
import { type NavigationItem } from "@/src/components/layouts/utilities/routes";

type GroupedNavigationItems = {
  ungrouped: NavigationItem[];
  grouped: Partial<Record<RouteGroup, NavigationItem[]>> | null;
};

function NavigationItemLabel({ label }: { label: NavigationItem["label"] }) {
  return typeof label === "string" ? (
    <span className="rounded-sm border px-1 py-0.5 text-xs leading-none">
      {label}
    </span>
  ) : (
    label
  );
}

function NavigationList({ items }: { items: NavigationItem[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={`${item.title}:${item.url}`}>
          {item.menuNode ?? (
            <SidebarNavItem
              href={item.url}
              isActive={item.isActive}
              opensInNewTab={item.newTab === true}
              leading={item.icon ? <item.icon size="base" /> : null}
              label={item.title}
              trailing={
                item.label ? (
                  <NavigationItemLabel label={item.label} />
                ) : undefined
              }
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function NavigationGroup({
  title,
  items,
}: {
  title: string;
  items: NavigationItem[];
}) {
  const headingId = useId();
  return (
    <div role="group" aria-labelledby={headingId}>
      <div
        id={headingId}
        className="text-sidebar-foreground/70 px-2 pt-2 pb-0.5 text-xs font-bold"
      >
        {title}
      </div>
      <NavigationList items={items} />
    </div>
  );
}

/**
 * Renders a section of the route config (`ROUTES`), already filtered for
 * permissions, entitlements, flags and UI customization by
 * `useFilteredNavigation`.
 */
export function SidebarNavigation({
  label,
  items,
}: {
  label: string;
  items: GroupedNavigationItems;
}) {
  return (
    <nav aria-label={label} className="flex flex-col px-2">
      {items.ungrouped.length > 0 ? (
        <NavigationList items={items.ungrouped} />
      ) : null}
      {Object.entries(items.grouped ?? {}).map(([group, groupItems]) => (
        <NavigationGroup key={group} title={group} items={groupItems} />
      ))}
    </nav>
  );
}
