import { forwardRef, type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";

/**
 * The band chrome shared by every table strip ("Pulse"): the ruled band, the
 * measured-width gate, and the loading / empty treatments. Extracted from
 * `EventsOutlierStrip` (LFE-14451) so the events, scores and experiments
 * strips are one band with one set of states instead of three lookalikes.
 *
 * What draws INSIDE the band stays with the caller — time-bucketed bars on the
 * events and scores tables, one point per run on the experiments table — but
 * every strip is the same height, ruled the same way, and says the same thing
 * when it has nothing to show. (LFE-15711)
 */

/**
 * Plot height inside a band: `OutlierBarStrip`'s 50px bar canvas plus its 13px
 * tick labels. A strip that draws something other than bars uses it too, so
 * the bands line up.
 */
export const METRIC_STRIP_PLOT_HEIGHT_CLASS = "h-[63px]";

/**
 * Loading / empty height: they replace the header AND the plot, so they cover
 * the band's whole content box.
 */
const CONTENT_HEIGHT_CLASS = "h-[76px]";

export type MetricStripStatus = "loading" | "empty" | "ready";

/**
 * A band-height message. Thin by construction: a strip's "nothing to show"
 * must never be a box taller than the band, which clips its own text.
 */
export function MetricStripMessage({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-[11px]">
      {message}
    </div>
  );
}

/** The controls row above the plot: metric dropdown, then its annotations. */
export function MetricStripHeaderRow({ children }: { children: ReactNode }) {
  return <div className="flex items-baseline gap-1.5">{children}</div>;
}

export const MetricStripBand = forwardRef<
  HTMLDivElement,
  {
    /**
     * False until the wrapper has been measured. First paint renders nothing
     * inside the band: strips that pick a bucket size from the measured width
     * would otherwise flash a skeleton sized for nothing. Pass `true` when the
     * plot needs no measurement.
     */
    measured?: boolean;
    status: MetricStripStatus;
    /** Shown at `status: "empty"`. */
    emptyMessage?: string;
    /** Dim held-over data during a refetch: stale must not read as current. */
    stale?: boolean;
    /** Rendered above the plot at `status: "ready"` only. */
    header?: ReactNode;
    children?: ReactNode;
  }
>(
  (
    {
      measured = true,
      status,
      emptyMessage = "No Data",
      stale = false,
      header,
      children,
    },
    ref,
  ) => (
    // Ruled top and bottom (LFE-14829): the strip reads as its own band
    // instead of floating between the toolbar and the table header.
    <div ref={ref} className="shrink-0 border-y">
      {!measured ? null : (
        // pt-2.5 keeps the metric switcher off the top rule; the label then
        // sits closer to its chart than to the band's edge.
        <div className="relative px-2 pt-2.5 pb-1">
          {status === "loading" ? (
            <div
              className={cn(
                "bg-muted animate-pulse rounded",
                CONTENT_HEIGHT_CLASS,
              )}
            />
          ) : status === "empty" ? (
            <div className={CONTENT_HEIGHT_CLASS}>
              <MetricStripMessage message={emptyMessage} />
            </div>
          ) : (
            <div
              className={cn(
                "min-w-0 transition-opacity",
                stale && "opacity-60",
              )}
            >
              {header}
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  ),
);
MetricStripBand.displayName = "MetricStripBand";
