import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon, CopyIcon, TableIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { formatAxisLabel } from "@/src/features/widgets/chart-library/utils";

/** Width/height of the interactive hit area, in the axis' own SVG units.
 * Matches the YAxis `width={120}` reserved on the horizontal bar chart, minus
 * a couple of pixels of gutter so the foreignObject never touches the plot. */
const TICK_AREA_WIDTH = 116;
const TICK_AREA_HEIGHT = 20;

/** Grace period between the pointer leaving the trigger (or the card) and
 * the card actually closing — long enough to travel diagonally from the
 * label into the card without it disappearing underneath the cursor. */
const CLOSE_GRACE_MS = 250;

/**
 * A breakdown horizontal-bar chart's Y-axis category label (e.g. a userId),
 * rendered as a real interactive element instead of plain SVG text.
 *
 * The tradeoff this solves: recharts' custom `tick` render prop is plain SVG
 * — a native `<title>` can show the full value on hover, but SVG has no
 * element that can host a focusable copy button or a link. This uses
 * `<foreignObject>` to embed one ordinary HTML button inside the axis tick's
 * SVG, visually identical to the plain-text label it replaces, but
 * keyboard-focusable and hover-to-open. Its card (a Radix `Popover`,
 * portaled to the app's `popover` overlay layer — see `components/ui/layer`)
 * renders completely outside the chart's SVG tree, so it is never clipped by
 * the chart's own bounds.
 *
 * Opens on pointer hover of the label (with a short close grace so crossing
 * the gap into the card doesn't dismiss it) AND on keyboard focus of the
 * label, so the copy button and "View filtered table" link are reachable by
 * Tab, not mouse-only. This is a controlled `Popover`, not a `HoverCard`:
 * `HoverCard`'s portaled content has no focus-trap/focus-guards, so Tab from
 * the trigger skips straight past it — a keyboard user could never reach the
 * copy button or link. Radix `Popover` inserts focus-guard sentinels around
 * its portaled content that redirect the natural Tab order into it, which is
 * exactly the reachability a HoverCard doesn't provide. Opening never steals
 * focus into the card on its own (`onOpenAutoFocus` is prevented) — a mouse
 * user just hovers, a keyboard user explicitly presses Tab to move into it;
 * Escape closes the card and returns focus to the label (Radix's default).
 * (LFE-10962)
 *
 * `href` (the "drill into this row" deep link) and the analytics callbacks
 * are decided upstream (DashboardWidget, via `buildTableFilterHref`) — this
 * component only renders what it is given, per chart-library/ARCHITECTURE.md:
 * the decide/visualise split. An absent `href` renders the copy affordance
 * without the "View filtered table" link (e.g. the widget isn't a
 * traces/observations view, or the value can't be expressed as a filter).
 */
export function BreakdownCategoryTick({
  x,
  y,
  label,
  href,
  onCopy,
  onViewAsTable,
}: {
  x: number | string;
  y: number | string;
  /** The full, untruncated dimension value — already extracted from
   *  recharts' tick `payload` by the caller, which needs the same value to
   *  key its `categoryHrefs` lookup. Kept as one source of truth instead of
   *  re-deriving it here from a raw payload. */
  label: string;
  href?: string;
  onCopy?: () => void;
  onViewAsTable?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== undefined) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  };
  const openNow = () => {
    clearCloseTimer();
    setOpen(true);
  };
  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  };

  // Clear any pending close timer on unmount — nothing to fire it into once
  // the trigger/card are gone.
  useEffect(() => clearCloseTimer, []);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(label);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Copy failed silently — matches the codebase's other copy affordances
      // (e.g. ValueCell, CopyIdsPopover).
    }
  };

  return (
    <g transform={`translate(${x},${y})`}>
      {/* Native fallback tooltip for a bare mouseover; the card below, opened
          by hovering/focusing the label, is the primary affordance. */}
      <title>{label}</title>
      <foreignObject
        x={-TICK_AREA_WIDTH}
        y={-TICK_AREA_HEIGHT / 2}
        width={TICK_AREA_WIDTH}
        height={TICK_AREA_HEIGHT}
      >
        {/* No xmlns needed: React resets to the HTML namespace for any
            element nested under foreignObject, regardless of the SVG
            ancestor above it. */}
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            overflow: "hidden",
          }}
        >
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={label}
                onMouseEnter={openNow}
                onMouseLeave={scheduleClose}
                onFocus={openNow}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring max-w-full truncate rounded-sm bg-transparent p-0 text-right text-xs leading-none hover:underline focus-visible:ring-1 focus-visible:outline-none"
              >
                {formatAxisLabel(label)}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="right"
              className="w-72 min-w-0"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={scheduleClose}
              onEscapeKeyDown={clearCloseTimer}
              onInteractOutside={clearCloseTimer}
              onFocusOutside={clearCloseTimer}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    readOnly
                    value={label}
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-mono text-xs"
                    aria-label="Full category value"
                  />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={handleCopy}
                    title="Copy value"
                    aria-label="Copy full value"
                    className="shrink-0"
                  >
                    {copied ? (
                      <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <CopyIcon className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                {href && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <Link href={href} onClick={() => onViewAsTable?.()}>
                      <TableIcon className="mr-2 h-3.5 w-3.5" />
                      View filtered table
                    </Link>
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </foreignObject>
    </g>
  );
}
