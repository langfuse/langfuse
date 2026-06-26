import { useEffect, useRef, useState } from "react";
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
import { useElementSize } from "@/src/hooks/useElementSize";
import {
  planToolbarOverflow,
  type PlanToolbarOverflowArgs,
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

// Units (right→left clutter) that fold into the "…" popover when the header is
// cramped, in collapse order: trace actions go first, then open-in-tab. Nav,
// expand and close are pinned — nav especially, so its K/J shortcuts keep
// working even when its buttons would be hidden.
type OverflowUnit = "actions" | "openInTab";
const DROP_ORDER: readonly OverflowUnit[] = ["actions", "openInTab"];

// Space (px) the title + badge keep before controls start folding away, and the
// width budgeted for the "…" trigger (an icon-xs button). Tuned by eye; the
// planner's `safety` slack covers inter-control gaps.
const RESERVED_TITLE_PX = 144;
const MORE_BUTTON_PX = 32;

const sameSet = (a: Set<OverflowUnit>, b: Set<OverflowUnit>) =>
  a.size === b.size && [...a].every((u) => b.has(u));

/**
 * Visible peek chrome shared by the desktop sheet and the mobile drawer. The
 * accessible dialog title is provided (visually hidden) by each shell, so this
 * stays a plain view component that works inside either primitive.
 *
 * The right control cluster is a priority-plus toolbar: it measures the header
 * and folds its lowest-priority controls into a "…" popover when space runs
 * out, so a narrow peek stays uncluttered and a wide one shows everything.
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
  const actionsRef = useRef<HTMLDivElement>(null);
  const openInTabRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  // Cached widths survive a unit being folded away (it is unmounted from the
  // bar then, so it can't be re-measured until it returns inline).
  const widthsRef = useRef<Partial<Record<OverflowUnit, number>>>({});
  const pinnedWidthRef = useRef(0);
  const [overflow, setOverflow] = useState<Set<OverflowUnit>>(new Set());

  const hasActions = Boolean(actions);
  const hasOpenInTab = Boolean(openInNewTab);
  const hasNav = Boolean(detailNavigationKey && resolveDetailNavigationPath);

  useEffect(() => {
    const width = headerSize?.width;
    if (!width) return;

    // Measure the units currently inline (folded ones keep their cached width)
    // and the pinned block, then plan which units must fold.
    if (hasActions && !overflow.has("actions") && actionsRef.current) {
      widthsRef.current.actions = actionsRef.current.offsetWidth;
    }
    if (hasOpenInTab && !overflow.has("openInTab") && openInTabRef.current) {
      widthsRef.current.openInTab = openInTabRef.current.offsetWidth;
    }
    if (pinnedRef.current)
      pinnedWidthRef.current = pinnedRef.current.offsetWidth;

    const unitWidths: PlanToolbarOverflowArgs<OverflowUnit>["unitWidths"] = {};
    if (hasActions && widthsRef.current.actions != null)
      unitWidths.actions = widthsRef.current.actions;
    if (hasOpenInTab && widthsRef.current.openInTab != null)
      unitWidths.openInTab = widthsRef.current.openInTab;

    const next = planToolbarOverflow<OverflowUnit>({
      clusterWidth: width - RESERVED_TITLE_PX,
      unitWidths,
      dropOrder: DROP_ORDER,
      pinnedWidth: pinnedWidthRef.current,
      moreWidth: MORE_BUTTON_PX,
    });
    setOverflow((prev) => (sameSet(prev, next) ? prev : next));
  }, [headerSize?.width, hasActions, hasOpenInTab, hasNav, overflow]);

  const actionsInline = hasActions && !overflow.has("actions");
  const openInTabInline = hasOpenInTab && !overflow.has("openInTab");

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

  return (
    <div
      ref={headerRef}
      className="bg-header flex min-h-11 shrink-0 flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden px-2 py-1"
    >
      <div className="flex min-w-0 flex-row items-center gap-2">
        <ItemBadge type={itemType} showLabel />
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
        {overflow.size > 0 && (
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
              {overflow.has("actions") ? actions : null}
              {overflow.has("openInTab") ? openInTabButton : null}
            </PopoverContent>
          </Popover>
        )}

        {/* Overflowable units (rendered inline only when they fit). */}
        {actionsInline ? (
          <div ref={actionsRef} className="flex flex-row items-center gap-1">
            {actions}
          </div>
        ) : null}
        {openInTabInline ? (
          <div ref={openInTabRef}>{openInTabButton}</div>
        ) : null}

        {/* Pinned block: nav (keeps K/J live), expand, close. */}
        <div
          ref={pinnedRef}
          className="flex h-full flex-row items-center gap-1 border-l pl-1"
        >
          {hasNav && (
            <DetailPageNav
              currentId={itemId}
              path={resolveDetailNavigationPath!}
              listKey={detailNavigationKey!}
            />
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
