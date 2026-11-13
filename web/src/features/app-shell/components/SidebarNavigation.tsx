import motion from "./sidebarMotion.module.css";
import { cn } from "@/src/utils/tailwind";
import { useId } from "react";
import { useSidebarSurface } from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { SidebarNavItem } from "@/src/components/nav/SidebarNavItem";
import {
  ROUTE_GROUP_BADGES,
  type RouteGroup,
} from "@/src/components/layouts/routes";
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

function NavigationEntry({
  item,
  isCollapsed,
}: {
  item: NavigationItem;
  isCollapsed: boolean;
}) {
  if (item.menuNode) return item.menuNode({ isCollapsed });
  if (item.disabledReason) {
    return (
      <Tooltip
        label={item.disabledReason}
        placement="right"
        hoverableContent={false}
      >
        {({ getTriggerProps }) => (
          <span
            {...getTriggerProps()}
            tabIndex={0}
            role="link"
            aria-disabled="true"
            aria-label={`${item.title}: ${item.disabledReason}`}
            className="block opacity-50"
          >
            <SidebarNavItem.Button
              isCollapsed={isCollapsed}
              disabled
              leading={item.icon ? <item.icon size="base" /> : null}
              label={item.title}
            />
          </span>
        )}
      </Tooltip>
    );
  }
  return (
    <SidebarNavItem
      isCollapsed={isCollapsed}
      href={item.url}
      isActive={item.isActive}
      opensInNewTab={item.newTab === true}
      leading={item.icon ? <item.icon size="base" /> : null}
      label={item.title}
      trailing={
        item.label ? <NavigationItemLabel label={item.label} /> : undefined
      }
    />
  );
}

function NavigationList({
  items,
  isCollapsed,
}: {
  items: NavigationItem[];
  isCollapsed: boolean;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={`${item.title}:${item.url}`}>
          <NavigationEntry item={item} isCollapsed={isCollapsed} />
        </li>
      ))}
    </ul>
  );
}

function NavigationGroup({
  title,
  items,
  isCollapsed,
}: {
  title: string;
  items: NavigationItem[];
  isCollapsed: boolean;
}) {
  const headingId = useId();
  return (
    <div role="group" aria-labelledby={headingId}>
      <div id={headingId} className={motion.groupHeading}>
        <span
          className={cn(
            "text-sidebar-foreground/70 text-xs font-bold",
            motion.groupCaption,
            motion.label,
          )}
        >
          {title}
          {ROUTE_GROUP_BADGES[title as RouteGroup]}
        </span>
      </div>
      <NavigationList items={items} isCollapsed={isCollapsed} />
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
  const isCollapsed = useSidebarSurface() === "collapsed";
  return (
    <nav aria-label={label} className="flex min-w-14 flex-col px-2">
      {items.ungrouped.length > 0 ? (
        <NavigationList items={items.ungrouped} isCollapsed={isCollapsed} />
      ) : null}
      {Object.entries(items.grouped ?? {}).map(([group, groupItems]) => (
        <NavigationGroup
          key={group}
          title={group}
          items={groupItems}
          isCollapsed={isCollapsed}
        />
      ))}
    </nav>
  );
}
