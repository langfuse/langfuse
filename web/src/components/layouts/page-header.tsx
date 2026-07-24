import { EnvLabelBadge } from "@/src/components/EnvLabelBadge";
import { useEnvLabel } from "@/src/hooks/useEnvLabel";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import BreadcrumbComponent from "@/src/components/layouts/breadcrumb";
import { PageHeaderControlsSlotTarget } from "@/src/components/layouts/page-header-controls-slot";
import { InAppAiAgentButton } from "@/src/components/nav/in-app-ai-agent-button";
import { TopbarBrand } from "@/src/components/nav/topbar-brand";
import { useHasAppSidebar } from "@/src/components/nav/sidebar-presence";
import DocPopup from "@/src/components/layouts/doc-popup";
import { SidebarTrigger } from "@/src/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  PageTabs,
  type PageTabsProps,
} from "@/src/components/layouts/page-tabs";
import { cn } from "@/src/utils/tailwind";
import { type ReactNode } from "react";
const containerLayoutClassName =
  "lg:mx-auto lg:w-full lg:max-w-screen-lg lg:px-8 xl:max-w-screen-xl 2xl:max-w-[1400px]";

export type PageHeaderProps = {
  title: string;
  titleDescription?: ReactNode;
  fitTitleToContent?: boolean;
  /** Rich title rendering (e.g. inline-editable); replaces the plain title
   * span inside the heading. `title` stays the canonical string. */
  titleContent?: ReactNode;
  breadcrumb?: { name: string; href?: string }[];
  actionButtonsLeft?: React.ReactNode; // Right-side actions (buttons, etc.)
  actionButtonsRight?: React.ReactNode; // Right-side actions (buttons, etc.)
  /** Mobile-only: the same actions rendered as full-width labeled menu rows
   * (icon + label), for the compact header's `⋯` overflow. Pages pass a
   * `layout="menu"` variant of their actions here (mirrors the table peek's
   * `actionsMenu`). When omitted, the mobile header falls back to folding the
   * inline `actionButtonsRight`/`actionButtonsLeft` nodes as-is. Desktop
   * `PageHeader` ignores this. */
  actionButtonsMenu?: React.ReactNode;
  help?: { description: React.ReactNode; href?: string; className?: string };
  titleTooltip?: string;
  itemType?: LangfuseItemType;
  container?: boolean;
  tabsProps?: PageTabsProps;
  className?: string;
  showSidebarTrigger?: boolean;
  leadingControl?: ReactNode;
  titleBadges?: ReactNode;
  breadcrumbBadges?: ReactNode;
};

const PageHeader = ({
  title,
  titleDescription,
  fitTitleToContent = false,
  titleContent,
  itemType,
  actionButtonsLeft,
  actionButtonsRight,
  breadcrumb,
  help,
  titleTooltip,
  tabsProps,
  container = false,
  className,
  showSidebarTrigger = true,
  leadingControl,
  titleBadges,
  breadcrumbBadges,
}: PageHeaderProps) => {
  const hasAppSidebar = useHasAppSidebar();
  const envLabel = useEnvLabel();
  // The sidebar trigger + brand mark only make sense where a real AppSidebar
  // exists to toggle/mirror. On the sidebar-less MinimalLayout (public/shared
  // trace and session views) show the page's own leadingControl instead — no
  // hamburger opening an empty sheet, no orphaned brand mark.
  const showSidebarChrome = showSidebarTrigger && hasAppSidebar;
  return (
    <div
      className={cn([
        "top-banner-offset bg-background sticky z-30 w-full border-b shadow-xs",
        className,
      ])}
      id="page-header"
    >
      <div className="flex flex-col justify-center">
        {/* Top Row */}
        <div className="border-b">
          <div
            className={cn(
              // py-1.5 (not py-2) so a 32px control in the right-aligned slot
              // fits inside the 44px (min-h-11) row without growing it; the
              // min-height keeps rows without controls at the same height.
              // justify-between (not ml-auto on the slot) so the controls sit
              // right when the row fits on one line but fall back to the LEFT
              // edge when they wrap to their own line on narrow viewports (a
              // line with a single flex item renders as flex-start).
              "flex min-h-11 flex-wrap items-center justify-between gap-3 px-3 py-1.5",
              container && containerLayoutClassName,
            )}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {showSidebarChrome ? (
                <>
                  <SidebarTrigger />
                  {/* Brand the app in the top bar while the sidebar (which
                      owns the logo) is off-canvas below `md`. Hidden on
                      desktop where the sidebar logo is visible. */}
                  <TopbarBrand className="md:hidden" />
                </>
              ) : (
                leadingControl && (
                  <div className="flex items-center">{leadingControl}</div>
                )
              )}
              <div>
                {envLabel.visible && (
                  <EnvLabelBadge
                    region={envLabel.region}
                    onClick={envLabel.dismiss}
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <BreadcrumbComponent items={breadcrumb} />
                {breadcrumbBadges}
              </div>
            </div>
            {/* Slot for page-level controls (time range, auto-refresh)
                hoisted from a list table via PageHeaderControlsPortal.
                Empty on pages that don't use it. */}
            <div className="flex flex-wrap items-center gap-2">
              <PageHeaderControlsSlotTarget />
              <InAppAiAgentButton />
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div>
          <div
            className={cn(
              "flex min-h-11 w-full flex-wrap items-center justify-between gap-1 px-3 py-1 md:flex-nowrap",
              container && containerLayoutClassName,
            )}
          >
            {/* Left side content */}
            <div className="flex grow flex-wrap items-center md:grow-0">
              <div className="mr-2 flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-1">
                  {itemType && (
                    <div className="flex items-center">
                      <ItemBadge type={itemType} showLabel />
                    </div>
                  )}
                  <div
                    className={cn(
                      "relative inline-block",
                      fitTitleToContent
                        ? "max-w-none shrink-0"
                        : "max-w-md md:max-w-none",
                    )}
                  >
                    <h2
                      className={cn(
                        "text-primary text-lg leading-7 font-bold",
                        fitTitleToContent
                          ? "whitespace-nowrap"
                          : "line-clamp-1",
                      )}
                    >
                      {titleContent ? (
                        titleContent
                      ) : titleTooltip ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="cursor-help wrap-break-word"
                                data-testid="page-header-title"
                              >
                                {title}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              {titleTooltip}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span
                          className="wrap-break-word"
                          title={title}
                          data-testid="page-header-title"
                        >
                          {title}
                        </span>
                      )}
                      {help && (
                        <span className="whitespace-nowrap">
                          &nbsp;
                          <DocPopup
                            description={help.description}
                            href={help.href}
                            className={help.className}
                          />
                        </span>
                      )}
                    </h2>
                  </div>
                  {titleBadges && (
                    <div className="ml-1 flex items-center gap-1">
                      {titleBadges}
                    </div>
                  )}
                </div>
                {titleDescription}
              </div>
              {actionButtonsLeft && (
                <div className="flex flex-wrap items-center gap-1 self-center">
                  {actionButtonsLeft}
                </div>
              )}
            </div>

            {/* Right side content — right-aligned by the row's
                justify-between while it shares the line with the title;
                left-aligned once it wraps to its own line. */}
            <div className="flex flex-wrap items-center gap-1">
              {actionButtonsRight}
            </div>
          </div>

          {tabsProps && (
            <PageTabs
              {...tabsProps}
              className={cn("ml-2 pr-3", tabsProps.className)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
