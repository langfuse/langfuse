/**
 * TimelineScale - Renders the time axis at the top of the timeline
 * Shows time markers with step intervals based on trace duration
 */

import { type TimelineScaleProps } from "./types";
import { STEP_SIZE } from "./timeline-calculations";

export function TimelineScale({
  traceDuration,
  scaleWidth,
  stepSize,
}: TimelineScaleProps) {
  // Calculate how many markers to show. scaleWidth is expected to be the finite
  // SCALE_WIDTH constant, but guard against a non-finite / absurd value ever
  // reaching here: Array.from({ length }) throws "RangeError: Invalid array
  // length" for Infinity and OOMs for an enormous finite length, so clamp to a
  // finite, sane upper bound.
  const safeScaleWidth = Number.isFinite(scaleWidth)
    ? Math.max(0, scaleWidth)
    : 0;
  const numMarkers = Math.min(
    Math.ceil(safeScaleWidth / STEP_SIZE) + 1,
    10_000,
  );

  return (
    // No left margin: the 0s tick must sit exactly at the track origin so the
    // ticks line up with the bars (which start at startOffset = 0 there).
    <div className="mb-2">
      <div className="relative h-8" style={{ width: `${scaleWidth}px` }}>
        {Array.from({ length: numMarkers }).map((_, index) => {
          const timeValue = stepSize * index;

          // Only show markers that are within the trace duration
          if (timeValue > traceDuration) {
            return null;
          }

          return (
            <div
              key={index}
              className="absolute h-full border-l text-xs"
              style={{ left: `${index * STEP_SIZE}px` }}
            >
              <span
                className="text-muted-foreground absolute left-2 text-xs"
                title={`${timeValue.toFixed(2)}s`}
              >
                {timeValue.toFixed(2)}s
              </span>
            </div>
          );
        })}

        {/* Grid lines for visual alignment */}
        <div className="pointer-events-none absolute inset-0">
          {Array.from({ length: numMarkers }).map((_, index) => {
            const timeValue = stepSize * index;
            if (timeValue > traceDuration || index === 0) {
              return null;
            }

            return (
              <div
                key={`grid-${index}`}
                className="border-border/30 absolute h-full border-l"
                style={{ left: `${index * STEP_SIZE}px` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
