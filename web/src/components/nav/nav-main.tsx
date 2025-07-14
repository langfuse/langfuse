"use client";
import { ChevronRightIcon, type LucideIcon } from "lucide-react";
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
import { useState, type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTitle,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { Portal } from "@radix-ui/react-hover-card";

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
  const { open, isMobile } = useSidebar();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) =>
          item.items && item.items.length > 0 ? (
            isMobile ? (
              // Mobile: Use DropdownMenu (tap to show)
              <SidebarMenuItem key={item.title}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      isActive={item.items.some((i) => i.isActive)}
                    >
                      <NavItemContent item={item} />
                      <ChevronRightIcon className="ml-auto h-4 w-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="bottom"
                    align="start"
                    sideOffset={4}
                  >
                    {item.items.map((subItem) => (
                      <DropdownMenuItem key={subItem.title} asChild>
                        <Link
                          href={subItem.url}
                          className={cn(
                            "flex cursor-pointer items-center",
                            subItem.isActive &&
                              "bg-accent text-accent-foreground",
                          )}
                        >
                          <span>{subItem.title}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            ) : (
              // Desktop: Use HoverCard (hover to show)
              <HoverCard
                key={item.title}
                openDelay={0}
                closeDelay={0}
                onOpenChange={(isOpen) =>
                  setHoveredItem(isOpen ? item.title : null)
                }
              >
                <SidebarMenuItem>
                  <HoverCardTrigger>
                    <SidebarMenuButton
                      isActive={
                        item.items.some((i) => i.isActive) ||
                        hoveredItem === item.title
                      }
                    >
                      <NavItemContent item={item} />
                      <ChevronRightIcon className="ml-auto" />
                    </SidebarMenuButton>
                  </HoverCardTrigger>
                  <Portal>
                    <HoverCardContent
                      side="right"
                      align="start"
                      // relative + isolate create a new stacking context
                      // z-[9999] ensures this appears above other elements, even across different stacking contexts
                      className="relative isolate z-[9999] p-1"
                    >
                      {!open && <HoverCardTitle>{item.title}</HoverCardTitle>}
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
                  </Portal>
                </SidebarMenuItem>
              </HoverCard>
            )
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
