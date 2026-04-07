"use client";
import { type LucideIcon } from "lucide-react";
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
import { cn } from "@/src/utils/tailwind";
import { RouteGroup } from "@/src/components/layouts/routes";

export type NavMainItem = {
  title: string;
  menuNode?: ReactNode;
  url: string;
  icon?: LucideIcon;
  isActive?: boolean;
  label?: string | ReactNode;
  newTab?: boolean;
  items?: {
    title: string;
    url: string;
    isActive?: boolean;
    newTab?: boolean;
  }[];
};

function NavItemContent({ item }: { item: NavMainItem }) {
  return (
    <>
      {item.icon && <item.icon />}
      <div className="min-w-0 flex-1 truncate">{item.title}</div>
      {item.label &&
        (typeof item.label === "string" ? (
          <div
            className={cn(
              "text-sidebar-foreground/65 border-sidebar-border/80 bg-sidebar self-center rounded-md border px-1.5 py-0.5 text-[0.6875rem] leading-none break-keep whitespace-nowrap",
            )}
          >
            {item.label}
          </div>
        ) : (
          // ReactNode
          item.label
        ))}
    </>
  );
}

export function NavMain({
  items,
}: {
  items: {
    grouped: Partial<Record<RouteGroup, NavMainItem[]>> | null;
    ungrouped: NavMainItem[];
  };
}) {
  const groupedSections = [
    RouteGroup.Observability,
    RouteGroup.PromptManagement,
    RouteGroup.Evaluation,
  ]
    .map((group) => ({
      group,
      items: items.grouped?.[group] ?? [],
    }))
    .filter((section) => section.items.length > 0);

  if (items.ungrouped.length === 0 && groupedSections.length === 0) {
    return null;
  }

  return (
    <>
      {items.ungrouped.length > 0 && (
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.ungrouped.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.menuNode || (
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={item.isActive}
                    >
                      <Link
                        href={item.url}
                        target={item.newTab ? "_blank" : undefined}
                      >
                        <NavItemContent item={item} />
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
      {groupedSections.map(({ group, items: groupItems }) => (
        <SidebarGroup key={group}>
          <SidebarGroupLabel>{group}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {groupItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.menuNode || (
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={item.isActive}
                    >
                      <Link
                        href={item.url}
                        target={item.newTab ? "_blank" : undefined}
                      >
                        <NavItemContent item={item} />
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
