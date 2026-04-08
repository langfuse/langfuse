"use client";
import {
  FileJson,
  ListTree,
  SquarePercent,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/src/components/ui/sidebar";
import Link from "next/link";
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

const GREENFIELD_GROUP_ICONS: Record<RouteGroup, LucideIcon> = {
  [RouteGroup.Observability]: ListTree,
  [RouteGroup.PromptManagement]: FileJson,
  [RouteGroup.Evaluation]: SquarePercent,
};

export function NavMain({
  items,
  variant = "default",
}: {
  items: {
    grouped: Partial<Record<RouteGroup, NavMainItem[]>> | null;
    ungrouped: NavMainItem[];
  };
  variant?: "default" | "greenfield";
}) {
  const groupClassName =
    variant === "greenfield" ? "px-3 py-1.5 first:pt-3" : undefined;
  const groupLabelClassName =
    variant === "greenfield"
      ? "text-sidebar-foreground/50 mb-1.5 px-2 text-[0.6875rem]"
      : undefined;
  const menuButtonClassName =
    variant === "greenfield"
      ? "h-9 rounded-xl px-2.5 text-[0.8125rem] font-medium"
      : undefined;

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
        <SidebarGroup className={groupClassName}>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.ungrouped.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.menuNode || (
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={item.isActive}
                      className={menuButtonClassName}
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
      {variant === "greenfield" ? (
        <SidebarGroup className={groupClassName}>
          <SidebarGroupContent>
            <Accordion
              type="multiple"
              defaultValue={groupedSections.map(({ group }) => group)}
              className="space-y-1.5"
            >
              {groupedSections.map(({ group, items: groupItems }) => {
                const GroupIcon = GREENFIELD_GROUP_ICONS[group];

                return (
                  <AccordionItem
                    key={group}
                    value={group}
                    className="overflow-hidden rounded-xl border-none"
                  >
                    <AccordionTrigger
                      className={cn(
                        "text-sidebar-foreground/85 data-[state=open]:bg-sidebar-accent/40 hover:bg-sidebar-accent/45 [&>svg]:text-sidebar-foreground/45 rounded-xl px-2.5 py-2 text-[0.8125rem] font-medium hover:no-underline [&>svg]:mr-0 [&>svg]:size-3.5",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <GroupIcon className="text-sidebar-foreground/55 size-4 shrink-0" />
                        <span className="truncate">{group}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-1 pt-1 pb-0">
                      <SidebarMenu className="gap-1">
                        {groupItems.map((item) => (
                          <SidebarMenuItem key={item.title}>
                            {item.menuNode || (
                              <SidebarMenuButton
                                asChild
                                tooltip={item.title}
                                isActive={item.isActive}
                                className="h-8 rounded-lg px-2.5 text-[0.8125rem] font-medium"
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
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : (
        groupedSections.map(({ group, items: groupItems }) => (
          <SidebarGroup key={group} className={groupClassName}>
            <SidebarGroupLabel className={groupLabelClassName}>
              {group}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {groupItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    {item.menuNode || (
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={item.isActive}
                        className={menuButtonClassName}
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
        ))
      )}
    </>
  );
}
