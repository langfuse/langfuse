/* eslint-disable @repo/no-margin-on-root-elements */
"use client";
import { type IconComponent } from "@langfuse/icons";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/src/components/ui/sidebar";
import Link from "next/link";
import { type ReactNode } from "react";
import {
  ROUTE_GROUP_BADGES,
  type RouteGroup,
} from "@/src/components/layouts/routes";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

export type NavMainItem = {
  title: string;
  menuNode?: ReactNode;
  url: string;
  icon?: IconComponent;
  isActive?: boolean;
  label?: string | ReactNode;
  newTab?: boolean;
  /** Renders the entry disabled, e.g. until a prerequisite is set up. */
  disabledReason?: string;
  items?: {
    title: string;
    url: string;
    isActive?: boolean;
    newTab?: boolean;
  }[];
};

export function NavMain({
  items,
}: {
  items: {
    grouped: Partial<Record<RouteGroup, NavMainItem[]>> | null;
    ungrouped: NavMainItem[];
  };
}) {
  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.ungrouped.map((item) => (
              <SidebarMenuItem key={item.title}>
                <NavMainEntry item={item} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {items.grouped &&
        Object.entries(items.grouped).map(([group, items]) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel className="gap-2">
              {group}
              {ROUTE_GROUP_BADGES[group as RouteGroup]}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <NavMainEntry item={item} />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
    </>
  );
}

function NavMainEntry({ item }: { item: NavMainItem }) {
  if (item.menuNode) return item.menuNode;
  if (item.disabledReason) {
    // The disabled button takes no pointer or focus events, so a focusable
    // wrapper carries the reason in every sidebar state.
    return (
      <Tooltip
        label={item.disabledReason}
        placement="right"
        hoverableContent={false}
      >
        {({ getTriggerProps }) => (
          <span
            {...getTriggerProps()}
            role="link"
            aria-disabled="true"
            tabIndex={0}
            className="ring-sidebar-ring block cursor-not-allowed rounded-sm outline-hidden focus-visible:ring-2"
          >
            <SidebarMenuButton disabled tabIndex={-1}>
              <NavItemContent item={item} />
            </SidebarMenuButton>
          </span>
        )}
      </Tooltip>
    );
  }
  return (
    <SidebarMenuButton asChild tooltip={item.title} isActive={item.isActive}>
      <Link href={item.url} target={item.newTab ? "_blank" : undefined}>
        <NavItemContent item={item} />
      </Link>
    </SidebarMenuButton>
  );
}

function NavItemContent({ item }: { item: NavMainItem }) {
  return (
    <>
      {item.icon && <item.icon size="base" />}
      <span>{item.title}</span>
      {item.label &&
        (typeof item.label === "string" ? (
          <span className="-my-0.5 self-center rounded-sm border px-1 py-0.5 text-xs leading-none break-keep whitespace-nowrap">
            {item.label}
          </span>
        ) : (
          // ReactNode
          item.label
        ))}
    </>
  );
}
