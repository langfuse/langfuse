import { EnvLabel } from "@/src/components/EnvLabel";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import BreadcrumbComponent from "@/src/components/layouts/breadcrumb";
import { PageHeaderControlsSlotTarget } from "@/src/components/layouts/page-header-controls-slot";
import { InAppAiAgentButton } from "@/src/components/nav/in-app-ai-agent-button";
import DocPopup from "@/src/components/layouts/doc-popup";
import { SidebarTrigger } from "@/src/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ParsedUrlQuery } from "querystring";
import { type ReactNode } from "react";

type TabDefinition = {
  value: string;
  label: string;
  href?: string;
  onClick?: () => void;
  querySelector?: (
    query: ParsedUrlQuery,
  ) => Record<string, string | string[] | undefined>;
  disabled?: boolean;
  className?: string;
};

type PageTabsProps = {
  tabs: TabDefinition[];
  activeTab: string;
  className?: string;
  listClassName?: string;
};

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
  const router = useRouter();
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
              {showSidebarTrigger ? (
                <SidebarTrigger />
              ) : (
                leadingControl && (
                  <div className="flex items-center">{leadingControl}</div>
                )
              )}
              <div>
                <EnvLabel />
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

            {/* Right side content — right-aligned by the row's
                justify-between while it shares the line with the title;
                left-aligned once it wraps to its own line. */}
            <div className="flex flex-wrap items-center gap-1">
              {actionButtonsRight}
            </div>
          </div>

          {tabsProps && (
            <div className={cn("ml-2", tabsProps.className)}>
              <div
                className={cn(
                  "inline-flex h-8 items-center justify-start",
                  tabsProps.listClassName,
                )}
              >
                {tabsProps.tabs.map((tab) => {
                  const tabClassName = cn(
                    "hover:bg-muted/50 focus-visible:ring-ring text-muted-foreground font-bold inline-flex h-full items-center justify-center rounded-none border-b-4 border-transparent px-2 py-0.5 text-sm whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
                    tab.value === tabsProps.activeTab
                      ? "border-primary-accent text-foreground bg-transparent shadow-none"
                      : "",
                    tab.disabled && "pointer-events-none opacity-50",
                    tab.className,
                  );

                  if (tab.onClick) {
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={tab.onClick}
                        className={tabClassName}
                        disabled={tab.disabled}
                      >
                        {tab.label}
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={tab.value}
                      href={{
                        pathname: tab.href ?? "",
                        query: tab.querySelector?.(router.query),
                      }}
                      className={tabClassName}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
