/* eslint-disable @repo/no-style-props */
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
import {
  APP_SHELL_CHROME_ROW_CLASS,
  APP_SHELL_CHROME_ROW_TEST_ID,
} from "@/src/components/layouts/app-shell-chrome";

const containerLayoutClassName =
  "lg:mx-auto lg:w-full lg:max-w-screen-lg lg:px-8 xl:max-w-screen-xl 2xl:max-w-[1400px]";

export type PageHeaderProps = {
  title: string;
  /** Rich title rendering (e.g. inline-editable); replaces the plain title
   * span inside the heading. `title` stays the canonical string. */
  titleContent?: ReactNode;
  breadcrumb?: { name: string; href?: string }[];
  actionButtonsLeft?: React.ReactNode; // Right-side actions (buttons, etc.)
  actionButtonsRight?: React.ReactNode; // Right-side actions (buttons, etc.)
  actionButtonsRightClassName?: string;
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
  titleContent,
  itemType,
  actionButtonsLeft,
  actionButtonsRight,
  actionButtonsRightClassName,
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
        {/* Top Row — same min-h-11 + border-b box as the sidebar logo strip
            so the sidebar `border-r` T-junction is a single pixel. The
            divider stays on this full-width box; container max-width only
            caps the inner content so settings pages don't leave a gap. */}
        <div
          data-testid={APP_SHELL_CHROME_ROW_TEST_ID}
          className={APP_SHELL_CHROME_ROW_CLASS}
        >
          <div
            className={cn(
              // Named container so chrome controls compact from remaining
              // pane width (docked right rail) rather than the viewport.
              // No extra vertical padding: min-h-11 + border-b already is
              // the 44px box. Extra py would grow the row past the sidebar
              // strip (border-box counts padding inside min-height, then
              // 32px controls no longer fit). nowrap keeps breadcrumbs and
              // controls on one row; the controls compact at the pageheader
              // container breakpoint instead of wrapping.
              "@container/pageheader flex h-full w-full flex-nowrap items-center justify-between gap-2 px-3 leading-none",
              container && containerLayoutClassName,
            )}
          >
            <div className="flex min-h-5 min-w-0 flex-nowrap items-center gap-2">
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
              <div className="flex min-w-0 translate-y-px items-center gap-2">
                <BreadcrumbComponent items={breadcrumb} />
                {breadcrumbBadges}
              </div>
            </div>
            {/* Slot for page-level controls (time range, auto-refresh)
                hoisted from a list table via PageHeaderControlsPortal.
                Empty on pages that don't use it. */}
            <div className="flex shrink-0 flex-nowrap items-center gap-2">
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
              <div className="mr-2 flex items-center gap-1">
                {itemType && (
                  <div className="flex items-center">
                    <ItemBadge type={itemType} showLabel />
                  </div>
                )}
                <div className="relative inline-block max-w-md md:max-w-none">
                  {/* Explicit color: the SidebarProvider shell sets
                      text-sidebar-foreground (60% grey in dark) on the whole
                      app, so unstyled text here would inherit the dimmed
                      sidebar tint. text-primary is the emphasis tier —
                      brighter than body text-foreground in dark. */}
                  <h2 className="text-primary line-clamp-1 text-lg leading-7 font-bold">
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
              {actionButtonsLeft && (
                <div className="flex flex-wrap items-center gap-1 self-center">
                  {actionButtonsLeft}
                </div>
              )}
            </div>

            {/* Right side content. Pages can override the default alignment
                when wrapped actions should retain a shared right edge. */}
            <div
              className={cn(
                "flex flex-wrap items-center gap-1",
                actionButtonsRightClassName,
              )}
            >
              {actionButtonsRight}
            </div>
          </div>

          {tabsProps && (
            <PageTabs
              {...tabsProps}
              className={cn("ml-2", tabsProps.className)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
