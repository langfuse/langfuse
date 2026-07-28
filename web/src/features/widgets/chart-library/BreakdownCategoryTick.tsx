import Link from "next/link";
import { TableIcon } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { formatAxisLabel } from "@/src/features/widgets/chart-library/utils";

/** Width/height of the interactive hit area, in the axis' own SVG units.
 * Matches the YAxis `width={120}` reserved on the horizontal bar chart, minus
 * a couple of pixels of gutter so the foreignObject never touches the plot. */
const TICK_AREA_WIDTH = 116;
const TICK_AREA_HEIGHT = 20;

/**
 * A breakdown horizontal-bar chart's Y-axis category label (e.g. a userId),
 * rendered as a real interactive element instead of plain SVG text.
 *
 * The tradeoff this solves: recharts' custom `tick` render prop is plain SVG
 * — SVG has no element that can host a hover-card trigger. This uses
 * `<foreignObject>` to embed one ordinary HTML button inside the axis tick's
 * SVG, visually identical to the plain-text label it replaces, but able to
 * host one. The card itself (a Radix `HoverCard`, portaled to the app's
 * `popover` overlay layer — see `components/ui/layer`) renders completely
 * outside the chart's SVG tree, so it is never clipped by the chart's own
 * bounds.
 *
 * Deliberately a plain hover tooltip, not an interactive popover — mirrors
 * `components/layouts/doc-popup.tsx` (the filter sidebar's "ⓘ" info card),
 * the codebase's existing hover-card pattern, per product direction
 * (LFE-10962). `openDelay` only opens a label the pointer actually dwells
 * on, so hovering fast across many bars doesn't pop them all open in a
 * domino. The full value is plain, selectable text — copying it is an
 * ordinary text-select + ⌘C, not a button — plus one optional link. No
 * native browser title tooltip either: the card is the only one. This has
 * no keyboard/focus-trap handling on purpose, unlike a Radix `Popover` —
 * that's the tradeoff of matching the doc-popup pattern, not an oversight to
 * "fix" back to a Popover.
 *
 * `href` (the "drill into this row" deep link) and the analytics callback
 * are decided upstream (DashboardWidget, via `buildTableFilterHref`) — this
 * component only renders what it is given, per chart-library/ARCHITECTURE.md:
 * the decide/visualise split. An absent `href` renders the value-only card
 * without the "View filtered table" link (e.g. the widget isn't a
 * traces/observations view, or the value can't be expressed as a filter).
 */
export function BreakdownCategoryTick({
  x,
  y,
  label,
  href,
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
  onViewAsTable?: () => void;
}) {
  return (
    <g transform={`translate(${x},${y})`}>
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
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                // Truncation via inline style, not the Tailwind `truncate`
                // utility: the hover card is this label's only "see the full
                // value" affordance by design (no native title tooltip, see
                // above) — same pattern as TruncatedString.tsx. Visually
                // identical to `truncate` (overflow/ellipsis/nowrap) plus
                // `max-w-full`.
                style={{
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm bg-transparent p-0 text-right text-xs leading-none hover:underline focus-visible:ring-1 focus-visible:outline-none"
              >
                {formatAxisLabel(label)}
              </button>
            </HoverCardTrigger>
            <HoverCardPortal>
              <HoverCardContent align="end" side="right" className="w-72">
                <div className="text-primary font-mono text-xs break-all whitespace-break-spaces">
                  {label}
                </div>
                {href && (
                  <Link
                    href={href}
                    onClick={() => onViewAsTable?.()}
                    className="text-muted-foreground hover:text-primary mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-2"
                  >
                    View filtered table
                    <TableIcon className="h-3 w-3" />
                  </Link>
                )}
              </HoverCardContent>
            </HoverCardPortal>
          </HoverCard>
        </div>
      </foreignObject>
    </g>
  );
}
