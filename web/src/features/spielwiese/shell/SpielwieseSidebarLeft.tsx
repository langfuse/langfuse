import { Plus } from "lucide-react";
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
import { FooterTools } from "./SpielwieseSidebarLeftExtras";
import {
  SpielwieseHeaderFinder,
  type SpielwieseHeaderFinderProps,
} from "./SpielwieseHeaderFinder";
import { SidebarSectionList } from "./SpielwieseSidebarLeftTree";
import { SpielwieseWorkspaceSwitcher } from "./SpielwieseWorkspaceSwitcher";

type SpielwieseSidebarLeftProps = {
  compact?: boolean;
  finderProps?: Omit<SpielwieseHeaderFinderProps, "variant">;
  shell: SpielwieseShellVM;
};

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
    <SidebarMenuButton active={item.isActive} href={item.href} tone="primary">
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
        <SidebarMenu className="px-2" key={group.id}>
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
          <SpielwieseWorkspaceSwitcher
            name={shell.team.name}
            variant="compact"
          />
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
  finderProps,
  shell,
}: {
  finderProps?: Omit<SpielwieseHeaderFinderProps, "variant">;
  shell: SpielwieseShellVM;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-testid="spielwiese-left-sidebar-scroll-area"
    >
      <SidebarHeader className="p-0 pt-2 pb-[11px] shadow-[rgb(238,239,241)_0px_1px_0px_0px]">
        <ExpandedUtilityNav
          finderProps={finderProps}
          groups={shell.utilityNavGroups}
        />
      </SidebarHeader>

      <SidebarContent className="gap-5 px-2 pt-3 pb-4">
        <SidebarSectionList sections={shell.sidebarSections} />
      </SidebarContent>
    </div>
  );
}

export function SpielwieseSidebarLeft({
  compact = false,
  finderProps,
  shell,
}: SpielwieseSidebarLeftProps) {
  return (
    <SidebarSurface
      className="overflow-hidden"
      data-testid="spielwiese-left-sidebar"
    >
      {compact ? (
        <CompactSidebar shell={shell} />
      ) : (
        <ExpandedSidebar finderProps={finderProps} shell={shell} />
      )}
    </SidebarSurface>
  );
}
