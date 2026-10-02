import { type getTimelineRowMetrics } from "./fns/getTimelineRowMetrics";

/**
 * Formatted by the trace-data owner, not the renderer. Deliberately only cost:
 * scores and comment counts fit inconsistently as bars move and zoom, and belong
 * in a fixed column or the detail panel rather than beside the bar.
 */
export type RowMetrics = {
  /** Already formatted, e.g. `$0.02`. */
  costText?: string | null;
};

export function TimelineRowMetrics({
  offsetPx,
  maxWidthPx,
  fontSizePx,
  placement,
  title,
  durationText,
  costText,
  toneClass,
}: NonNullable<ReturnType<typeof getTimelineRowMetrics>>) {
  return (
    // Clip rather than overflow the lane if canvas measurement underestimates
    // the width rendered by the DOM.
    <div
      className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2 overflow-hidden whitespace-nowrap"
      style={{
        left: placement === "before" ? undefined : `${offsetPx}px`,
        right: placement === "before" ? `${offsetPx}px` : undefined,
        maxWidth: `${maxWidthPx}px`,
        fontSize: `${fontSizePx}px`,
      }}
      title={title}
      data-testid="timeline-dense-metrics"
      data-placement={placement}
    >
      {durationText && (
        <span
          className={
            placement === "inside" ? toneClass : "text-muted-foreground"
          }
          data-testid="timeline-dense-duration"
          data-placement={placement}
        >
          {durationText}
        </span>
      )}
      {costText && (
        <span
          className={
            placement === "inside" ? toneClass : "text-muted-foreground"
          }
        >
          {costText}
        </span>
      )}
    </div>
  );
}
