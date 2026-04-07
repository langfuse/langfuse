"use client";

import { ChevronsUpDown } from "lucide-react";
import Link from "next/link";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/src/components/ui/sidebar";

export type UserNavigationItem = {
  name: string;
  onClick?: () => void;
  content?: React.ReactNode;
  href?: string;
};

export type UserNavigationProps = {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
  items: UserNavigationItem[];
};

export function NavUser({ user, items }: UserNavigationProps) {
  const { isMobile } = useSidebar();

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent/80 data-[state=open]:text-sidebar-foreground rounded-xl data-[state=open]:shadow-[inset_0_0_0_1px_hsl(var(--sidebar-border))]"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p
                  className="text-sidebar-foreground/60 truncate text-[0.8125rem]"
                  title={user.email}
                >
                  {user.email}
                </p>
              </div>
              <ChevronsUpDown className="text-sidebar-foreground/50 ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p
                    className="text-muted-foreground truncate text-[0.8125rem]"
                    title={user.email}
                  >
                    {user.email}
                  </p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {items.map((item) =>
                item.href ? (
                  <DropdownMenuItem key={item.name} asChild>
                    <Link href={item.href}>{item.content ?? item.name}</Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={item.name} onClick={item.onClick}>
                    {item.content ?? item.name}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
