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
    actionButtonsMenu,
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
      <div className="mt-2 flex min-w-0 items-center gap-2">
        {/* Icon keeps its size — without shrink-0 a long title (e.g. a full
            session id, the common case) squeezes it. */}
        {itemType && (
          <span className="flex shrink-0 items-center">
            <ItemBadge type={itemType} />
          </span>
        )}
        {/* min-w-0 + truncate: long titles ellipsize on one line instead of
            pushing the ⋯ flush against the edge or crushing the icon. Full value
            stays in the title attribute (and the ⋯ menu's Copy row). */}
        <h1
          title={title}
          className="text-primary min-w-0 truncate text-base leading-tight font-bold"
        >
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
        </h1>
        {/* Help lives OUTSIDE the truncating h1 (like titleBadges): kept inside,
            a title long enough to fill the row clips the `?` past the overflow
            boundary, making it invisible/untappable. As a shrink-0 sibling it
            stays put. */}
        {help && (
          <span className="shrink-0 align-middle whitespace-nowrap">
            <DocPopup
              description={help.description}
              href={help.href}
              className={help.className}
            />
          </span>
        )}
        {titleBadges && (
          <div className="flex shrink-0 items-center gap-1">{titleBadges}</div>
        )}
        {/* Actions collapse into a single right-aligned overflow popover of
            full-width labeled rows (icon + label) — the same pattern the table
            peek uses. Pages pass `actionButtonsMenu` (a `layout="menu"` variant
            of their actions) for proper menu rows; when they don't, we fall
            back to folding the inline `actionButtonsRight`/`actionButtonsLeft`
            nodes as-is. Either way the actions' own dialogs/drawers portal
            through the layer system, so they keep working from the popover. */}
        {(actionButtonsMenu || actionButtonsRight || actionButtonsLeft) && (
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
              <div className="flex flex-col items-stretch gap-0.5">
                {actionButtonsMenu ?? (
                  <>
                    {actionButtonsRight}
                    {actionButtonsLeft}
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Hoisted page controls (time range, auto-refresh). The assistant
          launcher lives in the sticky MobileTopBar now (prominent + always
          reachable), not here where it wrapped onto its own line and shrank to
          an easily-missed icon. The slot target is `display:contents`, so on
          pages that hoist nothing (traces, session/trace detail) this wrapper is
          empty — gate its top margin on actually having portaled controls
          (`:has(>*>*)` = the contents target has children), so an empty slot
          adds no phantom gap below the title. */}
      <div className="flex flex-wrap items-center gap-2 [&:has(>*>*)]:mt-2">
        <PageHeaderControlsSlotTarget />
      </div>

      {tabsProps && <PageTabs {...tabsProps} scrollable className="mt-2" />}
    </div>
  );
};
