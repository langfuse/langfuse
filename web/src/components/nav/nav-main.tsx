"use client";
import { type LucideIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/src/components/ui/sidebar";
import Link from "next/link";
import { type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTitle,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";

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
          <span
            className={cn(
              "-my-0.5 self-center whitespace-nowrap break-keep rounded-sm border px-1 py-0.5 text-xs leading-none",
            )}
          >
            {item.label}
          </span>
        ) : (
          // ReactNode
          item.label
        ))}
    </>
  );
}

export function NavMain({ items }: { items: NavMainItem[] }) {
  const { open, setOpen } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) =>
          item.items && item.items.length > 0 ? (
            <HoverCard
              key={item.title}
              openDelay={100}
              // asChild
              // defaultOpen={item.isActive || item.items.some((i) => i.isActive)}
              // className="group/collapsible"
            >
              <SidebarMenuItem>
                <HoverCardTrigger>
                  <SidebarMenuButton
                    tooltip={item.title}
                    onClick={(e) => {
                      if (!open) {
                        e.preventDefault();
                        setOpen(true);
                      }
                    }}
                    // when closed, the parent should be active if any of the children are active
                    isActive={!open && item.items.some((i) => i.isActive)}
                  >
                    <NavItemContent item={item} />
                  </SidebarMenuButton>
                </HoverCardTrigger>
                <HoverCardContent
                  side="right"
                  align="start"
                  className="relative isolate z-[9999]"
                >
                  <HoverCardTitle>{item.title}</HoverCardTitle>
                  <SidebarMenuSub>
                    {item.items.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={subItem.isActive}
                        >
                          <Link
                            href={subItem.url}
                            target={subItem.newTab ? "_blank" : undefined}
                          >
                            <span>{subItem.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </HoverCardContent>
              </SidebarMenuItem>
            </HoverCard>
          ) : (
            <SidebarMenuItem key={item.title}>
              {item.menuNode || (
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={item.isActive}
                >
                  <Link
                    href={item.url}
                    target={item.newTab ? "blank" : undefined}
                  >
                    <NavItemContent item={item} />
                  </Link>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ),
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
