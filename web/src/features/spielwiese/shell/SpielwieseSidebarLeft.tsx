import { ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback } from "../ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  SidebarSurface,
  sidebarMenuButtonVariants,
} from "../ui/sidebar";
import type { SpielwieseShellVM } from "../types/shell";
import { cn } from "@/src/utils/tailwind";

type SpielwieseSidebarLeftProps = {
  compact?: boolean;
  shell: SpielwieseShellVM;
};

function TeamCard({
  compact,
  shell,
}: Pick<SpielwieseSidebarLeftProps, "compact" | "shell">) {
  return (
    <div
      className={cn(
        "border-sidebar-border/70 bg-background/60 flex items-center gap-3 rounded-[1.25rem] border p-3",
        compact && "justify-center",
      )}
    >
      <Avatar className="bg-sidebar-primary text-sidebar-primary-foreground size-10 rounded-[1rem]">
        <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground rounded-[1rem]">
          {shell.team.initials}
        </AvatarFallback>
      </Avatar>
      <div className={cn("min-w-0 flex-1", compact && "hidden")}>
        <p className="text-foreground truncate text-sm font-semibold">
          {shell.team.name}
        </p>
        <p className="text-muted-foreground truncate text-sm">
          {shell.team.plan}
        </p>
      </div>
    </div>
  );
}

function PrimaryNavigation({
  compact,
  shell,
}: Pick<SpielwieseSidebarLeftProps, "compact" | "shell">) {
  return (
    <SidebarGroup className="gap-3">
      <SidebarGroupLabel className={compact ? "hidden" : undefined}>
        Primary
      </SidebarGroupLabel>
      <SidebarMenu>
        {shell.primaryNav.map((item) => {
          const Icon = item.icon;

          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                active={item.isActive}
                compact={compact}
                href={item.href}
              >
                <Icon size={16} />
                <span className={cn("truncate", compact && "hidden")}>
                  {item.label}
                </span>
                {!compact && item.badge ? (
                  <span className="bg-muted text-muted-foreground ml-auto rounded-full px-2 py-0.5 text-xs font-medium">
                    {item.badge}
                  </span>
                ) : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function FavoritesSection({
  shell,
}: Pick<SpielwieseSidebarLeftProps, "shell">) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Favorites</SidebarGroupLabel>
      <SidebarMenu>
        {shell.favorites.map((favorite) => (
          <SidebarMenuItem key={favorite.id}>
            <SidebarMenuButton href={favorite.href}>
              <span className="truncate">{favorite.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function WorkspaceSection({
  compact,
  shell,
}: Pick<SpielwieseSidebarLeftProps, "compact" | "shell">) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className={compact ? "hidden" : undefined}>
        Workspaces
      </SidebarGroupLabel>
      <div className="flex flex-col gap-2">
        {shell.workspaces.map((workspace) => (
          <Collapsible
            key={workspace.id}
            className="rounded-[1.25rem]"
            defaultOpen={workspace.defaultOpen}
          >
            <CollapsibleTrigger
              className={cn(
                sidebarMenuButtonVariants({ compact }),
                "cursor-pointer",
              )}
            >
              <span aria-hidden="true">{workspace.emoji}</span>
              <span className={cn("truncate", compact && "hidden")}>
                {workspace.label}
              </span>
              {!compact ? (
                <ChevronRight
                  className="ml-auto transition-transform group-open/collapsible:rotate-90"
                  size={16}
                />
              ) : null}
            </CollapsibleTrigger>
            {!compact ? (
              <CollapsibleContent>
                <SidebarMenuSub>
                  {workspace.pages.map((page) => (
                    <SidebarMenuSubItem key={page.id}>
                      <SidebarMenuSubButton href={page.href}>
                        {page.label}
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            ) : null}
          </Collapsible>
        ))}
      </div>
    </SidebarGroup>
  );
}

function UtilitiesSection({
  compact,
  shell,
}: Pick<SpielwieseSidebarLeftProps, "compact" | "shell">) {
  return (
    <SidebarGroup className="gap-3">
      <SidebarGroupLabel className={compact ? "hidden" : undefined}>
        Utilities
      </SidebarGroupLabel>
      <SidebarMenu>
        {shell.secondaryNav.map((item) => {
          const Icon = item.icon;

          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton compact={compact} href={item.href}>
                <Icon size={16} />
                <span className={cn("truncate", compact && "hidden")}>
                  {item.label}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function SpielwieseSidebarLeft({
  compact = false,
  shell,
}: SpielwieseSidebarLeftProps) {
  return (
    <SidebarSurface className="border-sidebar-border/70 border-r">
      <SidebarHeader>
        <TeamCard compact={compact} shell={shell} />
        <PrimaryNavigation compact={compact} shell={shell} />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {!compact ? <FavoritesSection shell={shell} /> : null}
        <WorkspaceSection compact={compact} shell={shell} />
      </SidebarContent>

      <SidebarFooter>
        <UtilitiesSection compact={compact} shell={shell} />
      </SidebarFooter>
    </SidebarSurface>
  );
}
