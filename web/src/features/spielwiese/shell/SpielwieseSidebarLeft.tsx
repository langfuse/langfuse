import { ChevronDown, FileText, Search } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  SidebarSurface,
} from "../ui/sidebar";
import type { SpielwieseShellVM } from "../types/shell";

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
        "flex items-center gap-3 rounded-lg px-1 py-1.5",
        compact && "justify-center",
      )}
    >
      <div className="bg-muted flex h-10 w-8 shrink-0 items-center justify-center rounded-md border">
        <div className="flex flex-col gap-1">
          <span className="bg-foreground/85 block h-1.5 w-1.5 rounded-[2px]" />
          <span className="bg-foreground/45 block h-0.5 w-3 rounded-full" />
          <span className="bg-foreground/75 block h-0.5 w-4 rounded-full" />
        </div>
      </div>
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

function ToolbarRow({
  compact,
  shell,
}: Pick<SpielwieseSidebarLeftProps, "compact" | "shell">) {
  return (
    <div
      className={cn(
        "bg-secondary/65 flex items-center gap-1 rounded-lg p-1",
        compact && "flex-col p-1.5",
      )}
    >
      {shell.primaryNav.map((item) => {
        const Icon = item.icon;

        return (
          <a
            key={item.id}
            aria-current={item.isActive ? "page" : undefined}
            className={cn(
              "text-muted-foreground hover:bg-background hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors",
              item.isActive && "bg-background text-foreground shadow-xs",
            )}
            href={item.href}
            title={item.label}
          >
            <Icon size={16} />
          </a>
        );
      })}
    </div>
  );
}

function SearchField({ compact }: Pick<SpielwieseSidebarLeftProps, "compact">) {
  if (compact) {
    return null;
  }

  return (
    <div className="text-muted-foreground bg-background flex items-center gap-2 rounded-md border px-3 py-2">
      <Search size={15} />
      <span className="truncate text-sm">Search</span>
    </div>
  );
}

function TableOfContents({
  compact,
  shell,
}: Pick<SpielwieseSidebarLeftProps, "compact" | "shell">) {
  const rootLabel = shell.team.name;

  return (
    <div className="flex flex-col gap-4">
      {!compact ? (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">Table of Contents</p>
        </div>
      ) : null}

      <SidebarMenu>
        {!compact ? (
          <SidebarMenuItem>
            <SidebarMenuButton href="#root">
              <FileText size={16} />
              <span className="truncate">{rootLabel}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}

        {shell.workspaces.map((workspace) => (
          <SidebarMenuItem key={workspace.id}>
            <SidebarMenuButton
              active={workspace.pages.some((page) => page.isActive)}
              compact={compact}
              href={workspace.pages[0]?.href ?? "#workspace"}
            >
              <span className={cn("shrink-0", compact && "hidden")}>
                <ChevronDown size={14} />
              </span>
              <FileText size={16} />
              <span className={cn("truncate", compact && "hidden")}>
                {workspace.label}
              </span>
            </SidebarMenuButton>

            {!compact ? (
              <SidebarMenuSub>
                {workspace.pages.map((page) => (
                  <SidebarMenuSubItem key={page.id}>
                    <SidebarMenuSubButton
                      active={page.isActive}
                      href={page.href}
                    >
                      <FileText size={15} />
                      <span className="truncate">{page.label}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            ) : null}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </div>
  );
}

function FooterActions({
  compact,
  shell,
}: Pick<SpielwieseSidebarLeftProps, "compact" | "shell">) {
  return (
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
  );
}

export function SpielwieseSidebarLeft({
  compact = false,
  shell,
}: SpielwieseSidebarLeftProps) {
  return (
    <SidebarSurface className="border-sidebar-border bg-background border-r">
      <SidebarHeader className="gap-3">
        <TeamCard compact={compact} shell={shell} />
        <ToolbarRow compact={compact} shell={shell} />
        <SearchField compact={compact} />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className={cn(compact && "items-center")}>
        <TableOfContents compact={compact} shell={shell} />
      </SidebarContent>

      <SidebarFooter>
        <FooterActions compact={compact} shell={shell} />
      </SidebarFooter>
    </SidebarSurface>
  );
}
