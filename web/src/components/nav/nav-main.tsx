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
import {
  RouteGroup as RouteGroupValue,
  type RouteGroup,
} from "@/src/components/layouts/routes";
import { useTranslations } from "next-intl";

const routeGroupMessageKeys = {
  [RouteGroupValue.Observability]: "observability",
  [RouteGroupValue.PromptManagement]: "promptManagement",
  [RouteGroupValue.Evaluation]: "evaluation",
} as const;

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

export function NavMain({
  items,
}: {
  items: {
    grouped: Partial<Record<RouteGroup, NavMainItem[]>> | null;
    ungrouped: NavMainItem[];
  };
}) {
  const t = useTranslations("navigation.groups");

  return (
    <>
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
      {items.grouped &&
        Object.entries(items.grouped).map(([group, items]) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel>
              {t(routeGroupMessageKeys[group as RouteGroup])}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
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
