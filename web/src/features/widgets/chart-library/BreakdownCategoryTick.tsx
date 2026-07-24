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
 * Two, deliberately different, ways in: hovering the label opens it as a
 * passive tooltip (mouse only — Tab landing on the label does NOT open it,
 * or a keyboard user tabbing PAST the label through a long list of bars
 * would get trapped/derailed by every one of them popping open); explicitly
 * ACTIVATING the label (click, or Enter/Space — same as any button) opens it
 * and moves focus straight into the content, so the copy button and "View
 * filtered table" link are keyboard-reachable via Tab from there. Those two
 * paths need different focus behavior on open, which is why this is a
 * controlled `Popover`, not a `HoverCard`: `HoverCard`'s portaled content has
 * no focus-trap/focus-guards at all, so Tab could never reach it regardless.
 * Radix `Popover` inserts focus-guard sentinels around its portaled content
 * that redirect Tab into it — but only ON the auto-focus-on-open behavior
 * that hover must NOT trigger (stealing focus on a passive hover would be
 * its own, worse, keyboard trap). `openReason` (a ref, not state — it's read
 * once per open, not rendered) tracks which path is in flight so
 * `onOpenAutoFocus` can allow the default (focus moves in) for an explicit
 * activation and suppress it (focus stays put) for a hover. Escape closes
 * the card and returns focus to the label either way (Radix's default).
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
  // Which of the two open paths is in flight — read once by
  // PopoverContent's onOpenAutoFocus (below) to decide whether opening may
  // move focus into the content. A ref, not state: it's a same-tick signal
  // for that one callback, never rendered. "keyboard" doubles as "explicit
  // activation" — a mouse click sets it too (a real button click is
  // expected to focus what it opens, same as any menu/select trigger); only
  // a passive hover (no activation) is the "pointer" case that must not
  // steal focus.
  const openReasonRef = useRef<"pointer" | "keyboard">("keyboard");

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== undefined) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  };
  const openOnHover = () => {
    openReasonRef.current = "pointer";
    clearCloseTimer();
    setOpen(true);
  };
  const markActivation = () => {
    openReasonRef.current = "keyboard";
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
      {/* Native fallback tooltip for a bare mouseover; the card below —
          opened by hovering, or by activating the label (click/Enter/Space)
          — is the primary affordance. */}
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
                onMouseEnter={openOnHover}
                onMouseLeave={scheduleClose}
                onClick={(e) => {
                  markActivation();
                  // Radix's PopoverTrigger composes its own onClick
                  // (toggling open) after ours, but skips that toggle if we
                  // called preventDefault. Without this, clicking a label
                  // already open via hover would immediately re-close it
                  // (open -> toggle -> closed) instead of staying open.
                  if (open) e.preventDefault();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") markActivation();
                }}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring max-w-full truncate rounded-sm bg-transparent p-0 text-right text-xs leading-none hover:underline focus-visible:ring-1 focus-visible:outline-none"
              >
                {formatAxisLabel(label)}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="right"
              className="w-72 min-w-0"
              onOpenAutoFocus={(e) => {
                // Hover must never steal focus; an explicit activation
                // (click, Enter, Space) should — that's the ONLY path that
                // moves focus into the content, making the copy button and
                // link keyboard-reachable. See openReasonRef above.
                if (openReasonRef.current === "pointer") e.preventDefault();
              }}
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
