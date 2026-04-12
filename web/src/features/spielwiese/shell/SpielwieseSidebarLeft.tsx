import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
} from "./SpielwieseSidebarLeftExtras";
import { SpielwieseSidebarDocumentPage } from "./SpielwieseSidebarDocumentPage";
import {
  SpielwieseHeaderFinder,
  type SpielwieseHeaderFinderProps,
} from "./SpielwieseHeaderFinder";
import { SidebarSectionList } from "./SpielwieseSidebarLeftTree";

type SpielwieseSidebarLeftProps = {
  compact?: boolean;
  finderProps?: Omit<SpielwieseHeaderFinderProps, "variant">;
  shell: SpielwieseShellVM;
};

function SpaceSwitcher({
  compact,
  shell,
}: Pick<SpielwieseSidebarLeftProps, "compact" | "shell">) {
  const avatar = (
    <Avatar className="size-9 rounded-lg">
      <AvatarFallback className="rounded-lg text-sm font-medium">
        {shell.team.initials}
      </AvatarFallback>
    </Avatar>
  );

  if (compact) {
    return (
      <a
        className="hover:bg-sidebar-accent inline-flex size-11 items-center justify-center rounded-xl transition-colors"
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
    <SidebarMenuButton active={item.isActive} href={item.href}>
      <Icon className="size-3.5 shrink-0" data-sidebar-icon />
      <span data-sidebar-label>{item.label}</span>
      {item.count ? <span data-sidebar-meta>{item.count}</span> : null}
      {ActionIcon ? (
        <span data-sidebar-action>
          <ActionIcon className="size-3.5" />
        </span>
      ) : null}
    </SidebarMenuButton>
  );
}

function ExpandedUtilityNav({
  finderProps,
  groups,
}: {
  finderProps?: Omit<SpielwieseHeaderFinderProps, "variant">;
  groups: SpielwieseNavGroup[];
}) {
  return (
    <nav aria-label="Primary workspace links" className="flex flex-col gap-1.5">
      {groups.map((group) => (
        <SidebarMenu key={group.id}>
          {group.items.map((item) => (
            <SidebarMenuItem key={item.id}>
              {finderProps && item.id === "search" ? (
                <SpielwieseHeaderFinder {...finderProps} variant="sidebar" />
              ) : (
                <UtilityNavRow item={item} />
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      ))}
    </nav>
  );
}

function CompactUtilityNav({ items }: { items: SpielwieseNavItem[] }) {
  return (
    <nav aria-label="Primary workspace links" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <SidebarMenuButton
            key={item.id}
            href={item.href}
            active={item.isActive}
            compact
            title={item.label}
          >
            <Icon className="size-4" data-sidebar-icon />
          </SidebarMenuButton>
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
  finderProps,
  onModeChange,
  shell,
}: {
  activeMode: "folders" | "document";
  finderProps?: Omit<SpielwieseHeaderFinderProps, "variant">;
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
              <ExpandedUtilityNav
                finderProps={finderProps}
                groups={shell.utilityNavGroups}
              />
            </SidebarHeader>

            <SidebarContent className="gap-4 p-3 pt-0">
              <SidebarSectionList sections={shell.sidebarSections} />
            </SidebarContent>
          </>
        ) : (
          <SpielwieseSidebarDocumentPage shell={shell} />
        )}
      </div>

      <SidebarFooter
        className="mt-0 shrink-0 bg-[#F3F3F4] p-3"
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
  finderProps,
  shell,
}: SpielwieseSidebarLeftProps) {
  const [activeMode, setActiveMode] = useState<"folders" | "document">(
    "folders",
  );

  return (
    <SidebarSurface
      className="overflow-hidden bg-[#F3F3F4]"
      data-testid="spielwiese-left-sidebar"
    >
      {compact ? (
        <CompactSidebar shell={shell} />
      ) : (
        <ExpandedSidebar
          activeMode={activeMode}
          finderProps={finderProps}
          onModeChange={setActiveMode}
          shell={shell}
        />
      )}
    </SidebarSurface>
  );
}
