"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { useElementSize } from "@/src/hooks/useElementSize";
import { cn } from "@/src/utils/tailwind";

export type OverflowAction = {
  /** Stable identity across renders. */
  key: string;
  /** Inline rendering when the action fits on the row (a button/control). */
  content: React.ReactNode;
  /** Representation inside the overflow "⋯" menu when the action doesn't fit. */
  overflowLabel: React.ReactNode;
  /** Invoked when the action is chosen from the overflow menu. Omit for actions
   *  that can't sensibly live in a menu (keep those `pinned`). */
  onSelect?: () => void;
  /** Never overflows — always rendered inline (e.g. the primary "Ask AI"). */
  pinned?: boolean;
};

const GAP_PX = 8; // matches gap-2
const TRIGGER_WIDTH_PX = 52; // the "⋯ n" trigger + its gap budget

/**
 * A single-line action bar that stays exactly one line: it measures itself and
 * spills whatever doesn't fit into a badge-counted "⋯" overflow menu, pulling
 * items back inline as space grows. Pinned actions never overflow.
 *
 * Measurement is container-relative (ResizeObserver via {@link useElementSize}),
 * so the bar reacts to its actual available width — e.g. when a filter sidebar
 * opens — not just the viewport size.
 */
export const OverflowActionBar = ({
  actions,
  className,
  "aria-label": ariaLabel = "Page actions",
}: {
  actions: OverflowAction[];
  className?: string;
  "aria-label"?: string;
}) => {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const containerWidth = size?.width ?? 0;

  // Hidden measurement row keeps every item's natural width on hand so overflow
  // is computed from real geometry, not guesses.
  const measureRefs = React.useRef<Map<string, HTMLSpanElement>>(new Map());
  const [visibleCount, setVisibleCount] = React.useState<number | null>(null);

  const pinned = React.useMemo(
    () => actions.filter((a) => a.pinned),
    [actions],
  );
  const flexible = React.useMemo(
    () => actions.filter((a) => !a.pinned),
    [actions],
  );

  // Serialized key list so the layout effect recomputes when the set changes.
  const actionKeys = actions.map((a) => a.key).join("|");

  React.useLayoutEffect(() => {
    if (!containerWidth) return;
    const widthOf = (key: string) =>
      measureRefs.current.get(key)?.getBoundingClientRect().width ?? 0;

    const pinnedWidth = pinned.reduce(
      (sum, a) => sum + widthOf(a.key) + GAP_PX,
      0,
    );
    const flexibleWidth = flexible.reduce(
      (sum, a) => sum + widthOf(a.key) + GAP_PX,
      0,
    );

    // Everything fits with room to spare → no trigger, show all.
    if (flexibleWidth <= containerWidth - pinnedWidth) {
      setVisibleCount(flexible.length);
      return;
    }

    // Reserve space for the "⋯" trigger and fill the prefix that fits.
    const budget = containerWidth - pinnedWidth - TRIGGER_WIDTH_PX;
    let used = 0;
    let count = 0;
    for (const a of flexible) {
      used += widthOf(a.key) + GAP_PX;
      if (used > budget) break;
      count += 1;
    }
    setVisibleCount(count);
  }, [containerWidth, actionKeys, pinned, flexible]);

  const resolvedVisible = visibleCount ?? flexible.length;
  const visibleItems = flexible.slice(0, resolvedVisible);
  const overflowItems = flexible.slice(resolvedVisible);

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label={ariaLabel}
      className={cn(
        "flex min-w-0 items-center gap-2",
        // Hide the row until the first measurement lands so users never see a
        // flash of the un-trimmed set.
        visibleCount === null && "invisible",
        className,
      )}
    >
      {visibleItems.map((a) => (
        <div key={a.key} className="flex shrink-0 items-center">
          {a.content}
        </div>
      ))}

      {overflowItems.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1"
              aria-label={`${overflowItems.length} more action${overflowItems.length === 1 ? "" : "s"}`}
            >
              <MoreHorizontal className="size-4" />
              {overflowItems.length}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflowItems.map((a) => (
              <DropdownMenuItem
                key={a.key}
                onSelect={() => a.onSelect?.()}
                className="gap-2"
              >
                {a.overflowLabel}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {pinned.map((a) => (
        <div key={a.key} className="flex shrink-0 items-center">
          {a.content}
        </div>
      ))}

      {/* Hidden measurement row: renders every item once to capture natural
          widths. Absolutely positioned + aria-hidden so it never affects
          layout, hit-testing, or the accessibility tree. */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute flex flex-nowrap gap-2"
      >
        {actions.map((a) => (
          <span
            key={a.key}
            ref={(el) => {
              if (el) measureRefs.current.set(a.key, el);
              else measureRefs.current.delete(a.key);
            }}
            className="flex shrink-0 items-center"
          >
            {a.content}
          </span>
        ))}
      </div>
    </div>
  );
};
