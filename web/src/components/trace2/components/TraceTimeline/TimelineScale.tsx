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
  // Calculate how many markers to show
  const numMarkers = Math.ceil(scaleWidth / STEP_SIZE) + 1;

  return (
    <div className="mb-2 ml-2">
      <div className="relative mr-2 h-8" style={{ width: `${scaleWidth}px` }}>
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
                className="absolute left-2 text-xs text-muted-foreground"
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
                className="absolute h-full border-l border-border/30"
                style={{ left: `${index * STEP_SIZE}px` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
