import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
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
import { cn } from "@/src/utils/tailwind";
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
  /** Item-specific actions (star / publish / delete …), shared with the page. */
  actions?: React.ReactNode;
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
const MORE_BUTTON_PX = 32;
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

/**
 * Visible peek chrome shared by the desktop sheet and the mobile drawer. The
 * accessible dialog title is provided (visually hidden) by each shell, so this
 * stays a plain view component that works inside either primitive.
 *
 * The header adapts to the PEEK's own width (measured, not screen breakpoints):
 * it keeps the title readable and, as the peek narrows, folds the trace actions
 * into a "…" popover, shrinks the type badge to icon-only, then folds
 * open-in-tab — see {@link planPeekHeaderLayout}. `actions` are rendered once
 * and portaled into the inline slot or the popover, so folding moves their DOM
 * without remounting (an in-progress delete confirmation survives a resize).
 */
export function PeekHeader({
  itemType,
  title,
  itemId,
  detailNavigationKey,
  resolveDetailNavigationPath,
  actions,
  expand,
  openInNewTab,
  onClose,
}: PeekHeaderProps) {
  const [headerRef, headerSize] = useElementSize<HTMLDivElement>();
  const badgeRef = useRef<HTMLDivElement>(null);
  // Host elements as state (ref callbacks) so the actions portal re-targets
  // when a host mounts/unmounts (e.g. the popover opening).
  const [inlineActionsHost, setInlineActionsHost] =
    useState<HTMLDivElement | null>(null);
  const [popoverActionsHost, setPopoverActionsHost] =
    useState<HTMLDivElement | null>(null);
  const openInTabRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  // Cached widths survive a part being folded / collapsed (it can't be
  // re-measured while hidden, in the closed popover, or in the other nav mode).
  const widthsRef = useRef<{
    actions?: number;
    openInTab?: number;
    badgeLabel?: number;
    navFull?: number;
    navCompact?: number;
    otherPinned?: number;
  }>({});
  const [plan, setPlan] = useState<PeekHeaderPlan>(FULL);

  const hasActions = Boolean(actions);
  const hasOpenInTab = Boolean(openInNewTab);
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
    if (hasActions && !plan.foldActions && inlineActionsHost) {
      widthsRef.current.actions = inlineActionsHost.offsetWidth;
    }
    if (hasOpenInTab && !plan.foldOpenInTab && openInTabRef.current) {
      widthsRef.current.openInTab = openInTabRef.current.offsetWidth;
    }
    // Nav width depends on its mode (cache per mode); otherPinned (expand +
    // close + divider) is mode-independent = the pinned block minus the nav.
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
      moreWidth: MORE_BUTTON_PX,
      actionsWidth: hasActions ? (widthsRef.current.actions ?? 0) : undefined,
      openInTabWidth: hasOpenInTab
        ? (widthsRef.current.openInTab ?? 0)
        : undefined,
    });
    setPlan((prev) => (samePlan(prev, next) ? prev : next));
  }, [
    headerRef,
    headerSize?.width,
    hasActions,
    hasOpenInTab,
    hasNav,
    plan,
    inlineActionsHost,
  ]);

  const openInTabButton = openInNewTab ? (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Open in new tab"
      title="Open in new tab"
      onClick={openInNewTab}
    >
      <ExternalLink className="h-4 w-4" />
    </Button>
  ) : null;

  const anyFolded = plan.foldActions || plan.foldOpenInTab;
  // The single actions instance lives in the popover when folded-and-open,
  // otherwise the inline slot (kept mounted — hidden — when folded, so action
  // state is preserved until the popover takes over).
  const actionsHost =
    plan.foldActions && popoverActionsHost
      ? popoverActionsHost
      : inlineActionsHost;

  return (
    <div
      ref={headerRef}
      className="bg-header flex min-h-11 shrink-0 flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden px-2 py-1"
    >
      <div className="flex min-w-0 flex-row items-center gap-2">
        {/* Badge never truncates: it shows the full label or just the icon. */}
        <div ref={badgeRef} className="shrink-0">
          <ItemBadge type={itemType} showLabel={plan.badgeShowLabel} />
        </div>
        <span
          className="truncate text-sm font-medium focus:outline-hidden"
          tabIndex={0}
          title={typeof title === "string" ? title : undefined}
        >
          {title}
        </span>
      </div>
      <div className="flex shrink-0 flex-row items-center gap-1">
        {/* Overflow popover collects whatever folded away, in display order. */}
        {anyFolded && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="More actions"
                title="More"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="flex w-auto min-w-0 flex-row items-center gap-1 p-1"
            >
              {plan.foldActions && (
                <div
                  ref={setPopoverActionsHost}
                  className="flex flex-row items-center gap-1"
                />
              )}
              {plan.foldOpenInTab ? openInTabButton : null}
            </PopoverContent>
          </Popover>
        )}

        {/* Inline actions slot: always mounted when actions exist; hidden (not
            unmounted) when folded so the portaled actions keep their state. */}
        {hasActions && (
          <div
            ref={setInlineActionsHost}
            className={cn(
              "flex flex-row items-center gap-1",
              plan.foldActions && "hidden",
            )}
          />
        )}
        {hasActions &&
          actionsHost &&
          createPortal(actions, actionsHost, "peek-actions")}

        {hasOpenInTab && !plan.foldOpenInTab ? (
          <div ref={openInTabRef}>{openInTabButton}</div>
        ) : null}

        {/* Pinned block: nav (keeps K/J live), expand, close. */}
        <div
          ref={pinnedRef}
          className="flex h-full flex-row items-center gap-1 border-l pl-1"
        >
          {hasNav && (
            <div ref={navRef} className="flex flex-row items-center">
              <DetailPageNav
                currentId={itemId}
                path={resolveDetailNavigationPath!}
                listKey={detailNavigationKey!}
                compact={plan.navCompact}
              />
            </div>
          )}
          {expand && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={expand.isExpanded ? "Collapse peek" : "Expand peek"}
              title={expand.isExpanded ? "Collapse" : "Expand"}
              onClick={expand.onToggle}
            >
              {expand.isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
