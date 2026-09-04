import { useLayoutEffect, useRef, useState } from "react";
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
import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  X,
} from "lucide-react";
import { useElementSize } from "@/src/hooks/useElementSize";
import {
  planPeekHeaderLayout,
  type PeekHeaderPlan,
} from "@/src/components/table/peek/peekHeaderOverflow";

type PeekHeaderProps = {
  itemType: LangfuseItemType;
  title: React.ReactNode;
  itemId: string;
  detailNavigationKey?: string;
  resolveDetailNavigationPath?: (entry: ListEntry) => string;
  /** Always-visible item action (share) rendered inline before the menu. */
  actions?: React.ReactNode;
  /** Item actions (delete …) as labeled rows for the "…" menu. */
  actionsMenu?: React.ReactNode;
  /** Expand-to-max-width toggle. Desktop only; hidden on mobile. */
  expand?: { isExpanded: boolean; onToggle: () => void };
  /** Open the standalone detail page in a new browser tab. Optional. */
  openInNewTab?: () => void;
  onClose: () => void;
};

// The title keeps at least this much width before anything else collapses; the
// type badge falls back to this width when icon-only; the "…" trigger is an
// icon-xs button. Tuned by eye — planner `safety` covers inter-control gaps.
const MIN_TITLE_PX = 240;
const BADGE_ICON_PX = 32;
const BADGE_LABEL_FALLBACK_PX = 72;
const NAV_FULL_FALLBACK_PX = 92;
const NAV_COMPACT_FALLBACK_PX = 52;

const samePlan = (a: PeekHeaderPlan, b: PeekHeaderPlan) =>
  a.foldActions === b.foldActions &&
  a.foldOpenInTab === b.foldOpenInTab &&
  a.badgeShowLabel === b.badgeShowLabel &&
  a.navCompact === b.navCompact;

const FULL: PeekHeaderPlan = {
  foldActions: false,
  foldOpenInTab: false,
  badgeShowLabel: true,
  navCompact: false,
};

// Header tooltips appear quickly and share one style (Radix Tooltip, not the
// slow/inconsistent native `title`).
const TOOLTIP_DELAY_MS = 300;

function HeaderIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Visible peek chrome shared by the desktop sheet and the mobile drawer. The
 * accessible dialog title is provided (visually hidden) by each shell, so this
 * stays a plain view component that works inside either primitive.
 *
 * The header adapts to the PEEK's own width (measured, not screen breakpoints):
 * it keeps the title readable and, as the peek narrows, folds the trace actions
 * into a labeled "…" menu, shrinks the type badge to icon-only, compacts the
 * prev/next nav, then folds open-in-tab — see {@link planPeekHeaderLayout}.
 */
export function PeekHeader({
  itemType,
  title,
  itemId,
  detailNavigationKey,
  resolveDetailNavigationPath,
  actions,
  actionsMenu,
  expand,
  openInNewTab,
  onClose,
}: PeekHeaderProps) {
  const [headerRef, headerSize] = useElementSize<HTMLDivElement>();
  // The header width equals the peek width and so doesn't change when the
  // controls settle (or data loads) after the first measurement — observe the
  // control cluster too, whose width does change, to re-trigger the plan.
  const [clusterRef, clusterSize] = useElementSize<HTMLDivElement>();
  const badgeRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  // Cached widths survive a part being collapsed (it can't be re-measured
  // while hidden or in the other nav mode).
  const widthsRef = useRef<{
    badgeLabel?: number;
    navFull?: number;
    navCompact?: number;
    otherPinned?: number;
  }>({});
  const [plan, setPlan] = useState<PeekHeaderPlan>(FULL);

  // Actions and open-in-tab ALWAYS live in the "…" menu — the header shows
  // only nav / expand / close inline (usage data: nav dwarfs everything else).
  const hasMenu = Boolean(actionsMenu || openInNewTab);
  const hasNav = Boolean(detailNavigationKey && resolveDetailNavigationPath);

  // Measure + plan in a layout effect (before paint), reading width from the
  // ref directly — useElementSize's state lands post-paint, which would flash
  // the un-adapted header for a frame.
  useLayoutEffect(() => {
    const width =
      headerRef.current?.getBoundingClientRect().width ?? headerSize?.width;
    if (!width) return;

    if (plan.badgeShowLabel && badgeRef.current) {
      widthsRef.current.badgeLabel = badgeRef.current.offsetWidth;
    }
    if (pinnedRef.current) {
      const navW = hasNav && navRef.current ? navRef.current.offsetWidth : 0;
      if (hasNav) {
        if (plan.navCompact) widthsRef.current.navCompact = navW;
        else widthsRef.current.navFull = navW;
      }
      widthsRef.current.otherPinned = pinnedRef.current.offsetWidth - navW;
    }

    const next = planPeekHeaderLayout({
      headerWidth: width,
      minTitle: MIN_TITLE_PX,
      badgeLabelWidth: widthsRef.current.badgeLabel ?? BADGE_LABEL_FALLBACK_PX,
      badgeIconWidth: BADGE_ICON_PX,
      navFullWidth: hasNav
        ? (widthsRef.current.navFull ?? NAV_FULL_FALLBACK_PX)
        : 0,
      navCompactWidth: hasNav
        ? (widthsRef.current.navCompact ?? NAV_COMPACT_FALLBACK_PX)
        : 0,
      otherPinnedWidth: widthsRef.current.otherPinned ?? 0,
      // The "…" trigger sits inside the pinned cluster now (always shown), so
      // it is already counted in otherPinnedWidth.
      moreWidth: 0,
    });
    setPlan((prev) => (samePlan(prev, next) ? prev : next));
  }, [headerRef, headerSize?.width, clusterSize?.width, hasNav, plan]);

  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <div
        ref={headerRef}
        className="bg-muted flex min-h-11 shrink-0 flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden px-2 py-1"
      >
        <div className="flex min-w-0 flex-row items-center gap-2">
          {/* Label-only chip, matching the full-page header (the label names
              the type; short enough to keep on any width). */}
          <div ref={badgeRef} className="shrink-0">
            <ItemBadge type={itemType} showLabel hideIcon />
          </div>
          <span
            className="truncate text-sm font-bold focus:outline-hidden"
            tabIndex={0}
            title={typeof title === "string" ? title : undefined}
          >
            {title}
          </span>
        </div>
        <div
          ref={clusterRef}
          className="flex shrink-0 flex-row items-center gap-1"
        >
          {/* Pinned block, in order: "…" menu (delete / open-in-tab / expand),
              share, nav (keeps K/J live), close. */}
          <div
            ref={pinnedRef}
            className="flex h-full flex-row items-center gap-1"
          >
            {hasMenu && (
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>More</TooltipContent>
                </Tooltip>
                <PopoverContent
                  align="end"
                  // forceMount + hide-when-closed: the menu hosts controls with
                  // their own dialogs/popovers (share URL, delete confirm) that
                  // must survive the trigger closing.
                  forceMount
                  className="flex w-auto min-w-44 flex-col gap-0.5 p-1 data-[state=closed]:hidden"
                >
                  {actionsMenu}
                  {openInNewTab ? (
                    <button
                      type="button"
                      onClick={openInNewTab}
                      className="hover:bg-accent flex w-full items-center gap-2 rounded-sm py-1.5 pr-2 pl-1.5 text-sm"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open in new tab
                    </button>
                  ) : null}
                  {expand ? (
                    <button
                      type="button"
                      onClick={expand.onToggle}
                      className="hover:bg-accent flex w-full items-center gap-2 rounded-sm py-1.5 pr-2 pl-1.5 text-sm"
                    >
                      {expand.isExpanded ? (
                        <Minimize2 className="h-4 w-4" />
                      ) : (
                        <Maximize2 className="h-4 w-4" />
                      )}
                      {expand.isExpanded ? "Collapse panel" : "Expand panel"}
                    </button>
                  ) : null}
                </PopoverContent>
              </Popover>
            )}
            {actions}
            {hasNav && (
              <div ref={navRef} className="flex flex-row items-center">
                {/* Always compact so the arrows match the icon-xs neighbors. */}
                <DetailPageNav
                  currentId={itemId}
                  path={resolveDetailNavigationPath!}
                  listKey={detailNavigationKey!}
                  compact
                />
              </div>
            )}
            <HeaderIconButton label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </HeaderIconButton>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
