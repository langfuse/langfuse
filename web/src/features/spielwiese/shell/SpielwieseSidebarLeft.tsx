import { cn } from "@/src/utils/tailwind";
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
import { SpielwieseSidebarShortcut } from "./SpielwieseSidebarShortcut";
import { SidebarSectionList } from "./SpielwieseSidebarLeftTree";

type SpielwieseSidebarLeftProps = {
  compact?: boolean;
  finderProps?: Omit<SpielwieseHeaderFinderProps, "variant">;
  shell: SpielwieseShellVM;
};

const compactSidebarRowClassName =
  "size-7 justify-center gap-0 rounded-[9px] px-0 text-[0.875rem] leading-5 font-medium tracking-[-0.14px] text-[#242529] hover:bg-black/[0.06] hover:text-[#242529] [&_[data-sidebar-action]]:hidden [&_[data-sidebar-badge]]:hidden [&_[data-sidebar-icon]]:text-black/[0.55] [&_[data-sidebar-label]]:hidden [&_[data-sidebar-meta]]:hidden";
const compactSidebarRowActiveClassName =
  "bg-[#EEEFF1] text-[#242529] shadow-none";

function UtilityNavRow({ item }: { item: SpielwieseNavItem }) {
  const ActionIcon = item.actionIcon;
  const Icon = item.icon;

  return (
    <SidebarMenuButton
      active={item.isActive}
      className="group/sidebar-item"
      href={item.href}
      tone="primary"
    >
      <Icon className="size-3.5 shrink-0" data-sidebar-icon />
      <span data-sidebar-label>{item.label}</span>
      {item.shortcut ? (
        <SpielwieseSidebarShortcut label={item.shortcut} />
      ) : null}
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
                <SpielwieseHeaderFinder
                  {...finderProps}
                  shortcutLabel={item.shortcut}
                  variant="sidebar"
                />
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
    <nav
      aria-label="Primary workspace links"
      className="flex flex-col items-start gap-1"
    >
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <SidebarMenuButton
            className={cn(
              compactSidebarRowClassName,
              item.isActive && compactSidebarRowActiveClassName,
            )}
            key={item.id}
            href={item.href}
            active={item.isActive}
            title={item.label}
            tone="primary"
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
    <div className="contents" data-testid="spielwiese-left-sidebar-scroll-area">
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2.5 py-2.5">
        <CompactUtilityNav items={compactUtilityNav} />
        <div className="flex flex-col items-start gap-1.5 px-2">
          {shell.sidebarSections.map((section) => {
            const Icon = section.icon;

            return (
              <a
                key={section.id}
                className={compactSidebarRowClassName}
                href={`#${section.id}`}
                title={section.label}
              >
                <Icon className="size-4" data-sidebar-icon />
              </a>
            );
          })}
        </div>
      </div>

      <SidebarFooter className="mt-0 items-stretch gap-2 p-2.5 pt-0">
        <FooterTools compact tools={shell.footerTools} />
      </SidebarFooter>
    </div>
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
