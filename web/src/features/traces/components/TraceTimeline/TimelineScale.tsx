/**
 * TimelineScale - Renders the time axis at the top of the timeline.
 *
 * Draws ticks, nothing more: which times get a tick, where they land and how
 * they are labelled all come from `layout()`, in the same coordinate space as
 * the bars and the playhead. That is what keeps a tick labelled "5.00s" exactly
 * above the bar that starts at 5.00s — the axis and the bars used to derive
 * their positions separately and disagree whenever the rounded step size did
 * not divide the trace duration evenly.
 *
 * Ticks whose label would not fit inside the measured lane are dropped by the
 * layout rather than clipped here, so the axis obeys the same
 * everything-inside-the-box rule as everything else.
 */

import { type TimelineScaleProps } from "./types";

export function TimelineScale({ ticks, laneWidth }: TimelineScaleProps) {
  return (
    <div className="mb-2">
      <div
        className="relative h-8 overflow-hidden"
        style={{ width: `${laneWidth}px` }}
      >
        {ticks.map((tick) => (
          <div
            key={tick.realMs}
            className="border-border-contrast absolute h-full border-l text-xs"
            style={{ left: `${tick.x}px` }}
          >
            {/* maxWidth is the structural guarantee: layout() already drops a
                tick whose label would not fit, but it predicts the width from
                measured glyphs, and a prediction must not be the only thing
                keeping the axis inside the box. */}
            <span
              className="text-muted-foreground absolute left-1 overflow-hidden text-xs whitespace-nowrap"
              style={{ maxWidth: `${Math.max(laneWidth - tick.x - 4, 0)}px` }}
              title={tick.label}
            >
              {tick.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
