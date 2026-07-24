import { ItemBadge } from "@/src/components/ItemBadge";
import BreadcrumbComponent from "@/src/components/layouts/breadcrumb";
import DocPopup from "@/src/components/layouts/doc-popup";
import { PageHeaderControlsSlotTarget } from "@/src/components/layouts/page-header-controls-slot";
import { PageTabs } from "@/src/components/layouts/page-tabs";
import { type PageHeaderProps } from "@/src/components/layouts/page-header";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { MoreHorizontal } from "lucide-react";

/**
 * The page-specific block for the minimal-chrome mobile shell. Rendered between
 * the slim sticky chrome and the page content (not inside the sticky bar), so
 * the title reads as part of the page and scrolls with it. Holds the
 * org/project context switcher, the compact page title (type icon + heading)
 * with its page actions collapsed into a single `⋯` overflow popover, the
 * hoisted controls slot (time range / refresh), and the section tabs.
 *
 * Takes the same `headerProps` the desktop PageHeader gets, so any Page-style
 * wrapper renders it consistently. Controls + agent live here for now; they
 * migrate into the expandable bottom bar as that lands.
 */
export const MobilePageTitle = ({
  headerProps,
}: {
  headerProps: Omit<PageHeaderProps, "container">;
}) => {
  const {
    title,
    titleContent,
    titleTooltip,
    help,
    itemType,
    actionButtonsLeft,
    actionButtonsRight,
    titleBadges,
    breadcrumb,
    breadcrumbBadges,
    tabsProps,
  } = headerProps;

  return (
    <div className="bg-background border-b px-3 pt-2 pb-3">
      {/* Context line: org / project switcher plus any page-supplied
          breadcrumb items (detail pages rely on these for back-navigation). */}
      <div className="flex items-center gap-2">
        <BreadcrumbComponent items={breadcrumb} />
        {breadcrumbBadges}
      </div>

      {/* Title row. On desktop the PageHeader packs the title and its action
          clusters onto one justified row; at phone width the compact mobile
          header keeps the type icon + title on the left and collapses every
          action cluster into a single `⋯` overflow popover pinned to the right,
          so the header top block stays ~2 rows instead of the 4–5 it used to
          take (a big labelled type chip, a text-2xl title, then each action
          cluster wrapping onto its own row). */}
      <div className="mt-1 flex min-w-0 items-center gap-2">
        {itemType && <ItemBadge type={itemType} />}
        <h1 className="text-primary text-base leading-tight font-bold wrap-break-word">
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
        {/* Actions collapse into a single right-aligned overflow popover. The
            caller-supplied nodes (buttons, dropdowns, drawer openers) render
            as-is; their own dialogs/drawers portal through the layer system, so
            they keep working from inside the popover. */}
        {(actionButtonsRight || actionButtonsLeft) && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="More actions"
                className="ml-auto shrink-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto min-w-44 p-1">
              <div className="flex flex-col items-stretch gap-1">
                {actionButtonsRight}
                {actionButtonsLeft}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Hoisted page controls (time range, auto-refresh). The assistant
          launcher lives in the sticky MobileTopBar now (prominent + always
          reachable), not here where it wrapped onto its own line and shrank to
          an easily-missed icon. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PageHeaderControlsSlotTarget />
      </div>

      {tabsProps && <PageTabs {...tabsProps} scrollable className="mt-2" />}
    </div>
  );
};
