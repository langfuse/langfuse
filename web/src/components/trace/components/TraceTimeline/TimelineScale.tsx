/**
 * TimelineScale - Renders the time axis at the top of the timeline
 * Shows time markers with step intervals based on trace duration
 *
 * Ticks are positioned in BAR coordinates ((time / traceDuration) *
 * scaleWidth) — the same mapping the gantt bars, the playhead, and
 * click-to-seek use — so a tick labeled "5.00s" sits exactly where a seek
 * lands at 5.00s. Positioning ticks on a fixed pixel grid instead
 * (index * STEP_SIZE) silently diverges whenever the rounded-up stepSize
 * doesn't equal traceDuration / (scaleWidth / STEP_SIZE), which is almost
 * every real trace.
 */

import { type TimelineScaleProps } from "./types";
import { formatIntervalSeconds } from "@/src/utils/dates";

/**
 * Sub-minute ticks keep the precise "5.00s" form; minute-scale and larger
 * ticks read as durations ("25m 00s", "1h 30m 00s") — raw "1500.00s" labels
 * are unreadable on hour-scale traces (LFE-10959).
 */
const formatTickLabel = (timeValue: number): string =>
  timeValue >= 60
    ? formatIntervalSeconds(timeValue)
    : `${timeValue.toFixed(2)}s`;

export function TimelineScale({
  traceDuration,
  scaleWidth,
  stepSize,
}: TimelineScaleProps) {
  // Guard against non-finite / absurd inputs ever reaching here:
  // Array.from({ length }) throws "RangeError: Invalid array length" for
  // Infinity and OOMs for an enormous finite length, so clamp to a finite,
  // sane upper bound. calculateStepSize keeps the real count at ~10.
  const safeScaleWidth = Number.isFinite(scaleWidth)
    ? Math.max(0, scaleWidth)
    : 0;
  const numMarkers =
    traceDuration > 0 && stepSize > 0 && Number.isFinite(traceDuration)
      ? Math.min(Math.floor(traceDuration / stepSize) + 1, 10_000)
      : 1;

  const tickLeft = (timeValue: number) =>
    traceDuration > 0 ? (timeValue / traceDuration) * safeScaleWidth : 0;

  return (
    // No left margin: the 0s tick must sit exactly at the track origin so the
    // ticks line up with the bars (which start at startOffset = 0 there).
    <div className="mb-2">
      <div className="relative h-8" style={{ width: `${scaleWidth}px` }}>
        {Array.from({ length: numMarkers }).map((_, index) => {
          const timeValue = stepSize * index;

          return (
            <div
              key={index}
              className="border-border-contrast absolute h-full border-l text-xs"
              style={{ left: `${tickLeft(timeValue)}px` }}
            >
              <span
                className="text-muted-foreground absolute left-2 text-xs whitespace-nowrap"
                title={formatTickLabel(timeValue)}
              >
                {formatTickLabel(timeValue)}
              </span>
            </div>
          );
        })}

        {/* Grid lines for visual alignment */}
        <div className="pointer-events-none absolute inset-0">
          {Array.from({ length: numMarkers }).map((_, index) => {
            if (index === 0) {
              return null;
            }
            const timeValue = stepSize * index;

            return (
              <div
                key={`grid-${index}`}
                className="border-border/30 absolute h-full border-l"
                style={{ left: `${tickLeft(timeValue)}px` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
