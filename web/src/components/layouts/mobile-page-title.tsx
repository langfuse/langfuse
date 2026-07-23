import { ItemBadge } from "@/src/components/ItemBadge";
import BreadcrumbComponent from "@/src/components/layouts/breadcrumb";
import DocPopup from "@/src/components/layouts/doc-popup";
import { PageHeaderControlsSlotTarget } from "@/src/components/layouts/page-header-controls-slot";
import { InAppAiAgentButton } from "@/src/components/nav/in-app-ai-agent-button";
import { PageTabs } from "@/src/components/layouts/page-tabs";
import { type PageHeaderProps } from "@/src/components/layouts/page-header";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

/**
 * The page-specific block for the minimal-chrome mobile shell. Rendered between
 * the slim sticky chrome and the page content (not inside the sticky bar), so
 * the title reads as part of the page and scrolls with it. Holds the
 * org/project context switcher, the large page title, page actions, the hoisted
 * controls slot (time range / refresh), the agent launcher, and the section
 * tabs.
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

      {/* Title on its own full-width line. On desktop the PageHeader packs the
          title and its action clusters onto one justified row, but at phone
          width there is no room: a `shrink-0` action cluster sharing the row
          crushes the `min-w-0` title (a fixed-width search input, or a
          dashboard selector + edit + setup, would overlap the heading). So the
          mobile title owns its line and every action cluster wraps onto its
          own row below — matching how the controls/agent row already behaves. */}
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
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
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {actionButtonsRight}
        </div>
      )}

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
