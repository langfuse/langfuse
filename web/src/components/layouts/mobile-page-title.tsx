import { type ReactNode } from "react";
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import BreadcrumbComponent from "@/src/components/layouts/breadcrumb";
import DocPopup from "@/src/components/layouts/doc-popup";
import { PageHeaderControlsSlotTarget } from "@/src/components/layouts/page-header-controls-slot";
import { InAppAiAgentButton } from "@/src/components/nav/in-app-ai-agent-button";
import {
  PageTabs,
  type PageTabsProps,
} from "@/src/components/layouts/page-tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

type MobilePageTitleProps = {
  title: string;
  titleContent?: ReactNode;
  titleTooltip?: string;
  help?: { description: ReactNode; href?: string; className?: string };
  itemType?: LangfuseItemType;
  actionButtonsLeft?: ReactNode;
  actionButtonsRight?: ReactNode;
  titleBadges?: ReactNode;
  breadcrumbBadges?: ReactNode;
  tabsProps?: PageTabsProps;
  className?: string;
};

/**
 * The page-specific block for the minimal-chrome mobile shell. Rendered at the
 * top of the scrollable content (not in the sticky chrome), so the title reads
 * as part of the page and scrolls away as you go. Holds the org/project context
 * switcher, the large page title, page actions, the hoisted controls slot
 * (time range / refresh), the agent launcher, and the section tabs.
 *
 * Controls + agent live here for now; they migrate into the expandable bottom
 * bar as that lands.
 */
export const MobilePageTitle = ({
  title,
  titleContent,
  titleTooltip,
  help,
  itemType,
  actionButtonsLeft,
  actionButtonsRight,
  titleBadges,
  breadcrumbBadges,
  tabsProps,
  className,
}: MobilePageTitleProps) => {
  return (
    <div className={cn("bg-background border-b px-3 pt-2 pb-3", className)}>
      {/* Context line: org / project switcher (no page items — the title says
          the page). */}
      <div className="flex items-center gap-2">
        <BreadcrumbComponent />
        {breadcrumbBadges}
      </div>

      <div className="mt-1.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {itemType && <ItemBadge type={itemType} showLabel />}
          <h1 className="text-primary text-2xl leading-tight font-bold wrap-break-word">
            {titleContent ? (
              titleContent
            ) : titleTooltip ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">{title}</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    {titleTooltip}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span title={title}>{title}</span>
            )}
            {help && (
              <span className="align-middle whitespace-nowrap">
                &nbsp;
                <DocPopup
                  description={help.description}
                  href={help.href}
                  className={help.className}
                />
              </span>
            )}
          </h1>
          {titleBadges && (
            <div className="flex items-center gap-1">{titleBadges}</div>
          )}
        </div>
        {actionButtonsRight && (
          <div className="flex shrink-0 items-center gap-1">
            {actionButtonsRight}
          </div>
        )}
      </div>

      {actionButtonsLeft && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {actionButtonsLeft}
        </div>
      )}

      {/* Hoisted page controls (time range, auto-refresh) + agent launcher.
          Temporary home until the expandable bottom bar owns them. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PageHeaderControlsSlotTarget />
        <InAppAiAgentButton />
      </div>

      {tabsProps && <PageTabs {...tabsProps} scrollable className="mt-2" />}
    </div>
  );
};
