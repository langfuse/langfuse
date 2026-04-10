import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
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
  SpielwieseNavGroup,
  SpielwieseNavItem,
  SpielwieseShellVM,
} from "../types/shell";
import {
  FooterTools,
  SidebarBottomModeSwitch,
  UsageMeter,
} from "./SpielwieseSidebarLeftExtras";
import { SpielwieseSidebarDocumentPage } from "./SpielwieseSidebarDocumentPage";
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
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {shell.team.name}
      </span>
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
      className="h-10 w-full justify-start rounded-xl px-3 text-sm font-medium shadow-none"
      data-testid="spielwiese-left-new-document"
      variant="outline"
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
        <span className="text-muted-foreground inline-flex size-5 shrink-0 items-center justify-center">
          <ActionIcon className="size-3.5" />
        </span>
      ) : null}
    </a>
  );
}

function ExpandedUtilityNav({ groups }: { groups: SpielwieseNavGroup[] }) {
  return (
    <nav aria-label="Primary workspace links" className="flex flex-col gap-2">
      {groups.map((group) => (
        <div className="flex flex-col gap-1" key={group.id}>
          {group.items.map((item) => (
            <UtilityNavRow item={item} key={item.id} />
          ))}
        </div>
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

function CompactSidebar({ shell }: { shell: SpielwieseShellVM }) {
  const compactUtilityNav = shell.utilityNavGroups.flatMap(
    (group) => group.items,
  );

  return (
    <>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-testid="spielwiese-left-sidebar-scroll-area"
      >
        <SidebarHeader className="items-center gap-2 p-2.5">
          <SpaceSwitcher compact shell={shell} />
          <CreateDocumentButton compact />
        </SidebarHeader>

        <SidebarContent className="items-center gap-2 p-2.5 pt-0">
          <CompactUtilityNav items={compactUtilityNav} />
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

        <SidebarFooter className="mt-0 items-center gap-2 p-2.5 pt-0">
          <FooterTools compact tools={shell.footerTools} />
        </SidebarFooter>
      </div>
    </>
  );
}

function ExpandedSidebar({
  activeMode,
  onModeChange,
  shell,
}: {
  activeMode: "folders" | "document";
  onModeChange: (mode: "folders" | "document") => void;
  shell: SpielwieseShellVM;
}) {
  return (
    <>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-testid="spielwiese-left-sidebar-scroll-area"
      >
        {activeMode === "folders" ? (
          <>
            <SidebarHeader className="gap-3 p-3">
              <SpaceSwitcher compact={false} shell={shell} />
              <CreateDocumentButton compact={false} />
              <ExpandedUtilityNav groups={shell.utilityNavGroups} />
            </SidebarHeader>

            <SidebarContent className="gap-5 p-3 pt-0">
              <SidebarSectionList sections={shell.sidebarSections} />
              <div className="flex flex-col gap-3 pt-2">
                <FooterTools compact={false} tools={shell.footerTools} />
                <UsageMeter shell={shell} />
              </div>
            </SidebarContent>
          </>
        ) : (
          <SpielwieseSidebarDocumentPage shell={shell} />
        )}
      </div>

      <SidebarFooter
        className="border-sidebar-border bg-background mt-0 shrink-0 border-t p-3"
        data-testid="spielwiese-left-sidebar-sticky-footer"
      >
        <SidebarBottomModeSwitch
          activeMode={activeMode}
          onModeChange={onModeChange}
        />
      </SidebarFooter>
    </>
  );
}

export function SpielwieseSidebarLeft({
  compact = false,
  shell,
}: SpielwieseSidebarLeftProps) {
  const [activeMode, setActiveMode] = useState<"folders" | "document">(
    "folders",
  );

  return (
    <SidebarSurface
      className="border-sidebar-border bg-background overflow-hidden border-r"
      data-testid="spielwiese-left-sidebar"
    >
      {compact ? (
        <CompactSidebar shell={shell} />
      ) : (
        <ExpandedSidebar
          activeMode={activeMode}
          onModeChange={setActiveMode}
          shell={shell}
        />
      )}
    </SidebarSurface>
  );
}
