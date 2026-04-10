import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarSeparator,
  SidebarSurface,
} from "../ui/sidebar";
import type {
  SpielwieseFooterTool,
  SpielwieseNavItem,
  SpielwieseShellVM,
} from "../types/shell";
import { SidebarSectionList } from "./SpielwieseSidebarLeftTree";

type SpielwieseSidebarLeftProps = {
  compact?: boolean;
  shell: SpielwieseShellVM;
};

function SpaceSwitcher({
  compact,
  shell,
}: Pick<SpielwieseSidebarLeftProps, "compact" | "shell">) {
  const avatar = (
    <Avatar className="border-sidebar-border/60 size-9 rounded-lg border">
      <AvatarFallback className="rounded-lg text-sm font-medium">
        {shell.team.initials}
      </AvatarFallback>
    </Avatar>
  );

  if (compact) {
    return (
      <a
        className="border-sidebar-border/70 hover:bg-sidebar-accent inline-flex size-11 items-center justify-center rounded-xl border transition-colors"
        href="#assistant"
        title={shell.team.name}
      >
        <span className="scale-[0.89]">{avatar}</span>
      </a>
    );
  }

  return (
    <a
      className="hover:bg-sidebar-accent flex items-center gap-3 rounded-xl px-2 py-2 transition-colors"
      href="#assistant"
    >
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{shell.team.name}</p>
        <p className="text-muted-foreground truncate text-sm">
          {shell.team.plan}
        </p>
      </div>
      <ChevronDown className="text-muted-foreground size-4 shrink-0" />
    </a>
  );
}

function CreateDocumentButton({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <Button
        aria-label="New document"
        className="size-11 rounded-xl"
        size="icon"
        variant="secondary"
      >
        <Plus size={18} />
      </Button>
    );
  }

  return (
    <Button
      className="border-sidebar-border/70 bg-secondary/75 h-10 w-full justify-start rounded-xl border px-3 text-sm font-medium shadow-none"
      data-testid="spielwiese-left-new-document"
      variant="secondary"
    >
      <Plus size={16} />
      <span>New Document</span>
    </Button>
  );
}

function UtilityNavRow({ item }: { item: SpielwieseNavItem }) {
  const ActionIcon = item.actionIcon;
  const Icon = item.icon;

  return (
    <a
      aria-current={item.isActive ? "page" : undefined}
      className={cn(
        "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        item.isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
      href={item.href}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count ? (
        <span className="text-muted-foreground shrink-0 text-sm">
          {item.count}
        </span>
      ) : null}
      {ActionIcon ? (
        <span className="text-muted-foreground shrink-0">
          <ActionIcon className="size-4" />
        </span>
      ) : null}
    </a>
  );
}

function ExpandedUtilityNav({ items }: { items: SpielwieseNavItem[] }) {
  return (
    <nav aria-label="Primary workspace links" className="flex flex-col gap-1">
      {items.map((item) => (
        <UtilityNavRow item={item} key={item.id} />
      ))}
    </nav>
  );
}

function CompactUtilityNav({ items }: { items: SpielwieseNavItem[] }) {
  return (
    <nav aria-label="Primary workspace links" className="flex flex-col gap-1.5">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <a
            key={item.id}
            aria-current={item.isActive ? "page" : undefined}
            className={cn(
              "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground inline-flex size-10 items-center justify-center rounded-xl transition-colors",
              item.isActive &&
                "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
            href={item.href}
            title={item.label}
          >
            <Icon size={18} />
          </a>
        );
      })}
    </nav>
  );
}

function UsageMeter({ shell }: { shell: SpielwieseShellVM }) {
  const progress = Math.min(100, (shell.usage.used / shell.usage.limit) * 100);

  return (
    <div className="border-sidebar-border/70 bg-muted/35 flex flex-col gap-3 rounded-2xl border p-3">
      <p className="text-sm font-medium">{shell.usage.label}</p>
      <div className="bg-sidebar-border/60 h-2 overflow-hidden rounded-full">
        <div
          className="bg-foreground/75 h-full rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-muted-foreground text-sm">
        {shell.usage.used} of {shell.usage.limit} blocks used
      </p>
      <Button className="w-full rounded-xl">{shell.usage.ctaLabel}</Button>
    </div>
  );
}

function FooterTools({
  compact,
  tools,
}: {
  compact: boolean;
  tools: SpielwieseFooterTool[];
}) {
  return (
    <div
      className={cn(
        "border-sidebar-border/70 flex items-center gap-1.5 border-t pt-3",
        compact && "flex-col border-t-0 pt-0",
      )}
    >
      {tools.map((tool) => {
        const Icon = tool.icon;

        return (
          <a
            key={tool.id}
            className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground inline-flex size-9 items-center justify-center rounded-xl transition-colors"
            href={tool.href}
            title={tool.label}
          >
            <Icon className="size-4" />
          </a>
        );
      })}
    </div>
  );
}

function CompactSidebar({ shell }: { shell: SpielwieseShellVM }) {
  return (
    <>
      <SidebarHeader className="items-center gap-2 p-2.5">
        <SpaceSwitcher compact shell={shell} />
        <CreateDocumentButton compact />
      </SidebarHeader>

      <SidebarContent className="items-center gap-2 overflow-y-auto p-2.5 pt-0">
        <CompactUtilityNav items={shell.utilityNav} />
        <SidebarSeparator className="w-full" />
        <div className="flex flex-col gap-1.5">
          {shell.sidebarSections.map((section) => {
            const Icon = section.icon;

            return (
              <a
                key={section.id}
                className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground inline-flex size-10 items-center justify-center rounded-xl transition-colors"
                href={`#${section.id}`}
                title={section.label}
              >
                <Icon className="size-4" />
              </a>
            );
          })}
        </div>
      </SidebarContent>

      <SidebarFooter className="items-center gap-2 p-2.5 pt-0">
        <FooterTools compact tools={shell.footerTools} />
      </SidebarFooter>
    </>
  );
}

function ExpandedSidebar({ shell }: { shell: SpielwieseShellVM }) {
  return (
    <>
      <SidebarHeader className="gap-2.5 p-3">
        <SpaceSwitcher compact={false} shell={shell} />
        <CreateDocumentButton compact={false} />
        <ExpandedUtilityNav items={shell.utilityNav} />
      </SidebarHeader>

      <SidebarContent className="gap-4 overflow-y-auto p-3 pt-0">
        <SidebarSectionList sections={shell.sidebarSections} />
      </SidebarContent>

      <SidebarFooter className="gap-4 p-3 pt-0">
        <UsageMeter shell={shell} />
        <FooterTools compact={false} tools={shell.footerTools} />
      </SidebarFooter>
    </>
  );
}

export function SpielwieseSidebarLeft({
  compact = false,
  shell,
}: SpielwieseSidebarLeftProps) {
  return (
    <SidebarSurface
      className="border-sidebar-border bg-background overflow-hidden border-r"
      data-testid="spielwiese-left-sidebar"
    >
      {compact ? (
        <CompactSidebar shell={shell} />
      ) : (
        <ExpandedSidebar shell={shell} />
      )}
    </SidebarSurface>
  );
}
