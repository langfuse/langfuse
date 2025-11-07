import { cn } from "@/src/utils/tailwind";

export interface HeatmapSkeletonProps {
  rows?: number;
  cols?: number;
  cellHeight?: number;
  showLabels?: boolean;
  showAxisLabels?: boolean;
  className?: string;
}

/**
 * HeatmapSkeleton - Loading placeholder for Heatmap component
 *
 * Matches the exact dimensions and layout of the real Heatmap component,
 * including the same cell height calculation logic (minmax(24px, 40px)).
 *
 * Features:
 * - 10x10 grid by default (configurable)
 * - Exact cell dimensions matching real heatmap
 * - Optional row/column labels
 * - Optional axis labels
 * - Subtle hover effect
 * - Automatic light/dark mode support via CSS variables
 */
export function HeatmapSkeleton({
  rows = 10,
  cols = 10,
  cellHeight: cellHeightProp,
  showLabels = true,
  showAxisLabels = true,
  className,
}: HeatmapSkeletonProps) {
  // Calculate cell dimensions - EXACT MATCH from Heatmap.tsx lines 99-102
  const cellWidth = "minmax(32px, 1fr)"; // Can grow wide
  const cellHeight = cellHeightProp
    ? `${cellHeightProp}px`
    : "minmax(24px, 40px)"; // Compact vertical space

  // Dynamic width for row labels (average of 36-120px range)
  const rowLabelsWidth = 60;

  return (
    <div
      className={cn("flex w-full flex-1 flex-col gap-4", className)}
      role="status"
      aria-label="Loading heatmap visualization"
    >
      <div className="flex flex-1 items-stretch justify-center gap-1 sm:gap-2">
        {/* Y-axis label placeholder */}
        {showAxisLabels && (
          <div className="flex items-center justify-center">
            <div
              className="h-16 w-3 animate-pulse rounded-sm bg-background"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            />
          </div>
        )}

        {/* Row labels placeholder */}
        {showLabels && (
          <div
            className="grid gap-1 pr-1 text-right sm:pr-2"
            style={{
              width: `${rowLabelsWidth}px`,
              gridTemplateRows: `repeat(${rows}, ${cellHeight})`,
            }}
          >
            {Array.from({ length: rows }).map((_, idx) => (
              <div key={idx} className="flex items-center justify-end">
                <div className="h-3 w-10 animate-pulse rounded-sm bg-background" />
              </div>
            ))}
          </div>
        )}

        {/* Grid of skeleton cells */}
        <div
          className="grid w-full flex-1 gap-0.5"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cellWidth})`,
            gridTemplateRows: `repeat(${rows}, ${cellHeight})`,
            height: "auto",
          }}
          role="grid"
        >
          {Array.from({ length: rows * cols }).map((_, idx) => (
            <div
              key={idx}
              className="animate-pulse rounded-sm border border-border/50 bg-background transition-all duration-150 hover:brightness-95"
            />
          ))}
        </div>

        {/* Spacer for alignment when row labels exist */}
        {showLabels && <div className="w-0 sm:w-2" />}
      </div>

      {/* Column labels placeholder */}
      {showLabels && (
        <div className="flex items-start gap-2 sm:gap-4">
          {/* Spacer for row labels */}
          {showLabels && <div style={{ width: `${rowLabelsWidth}px` }} />}

          <div
            className="grid w-full flex-1 gap-1 text-center"
            style={{
              gridTemplateColumns: `repeat(${cols}, ${cellWidth})`,
            }}
          >
            {Array.from({ length: cols }).map((_, idx) => (
              <div key={idx} className="flex items-center justify-center">
                <div className="h-2.5 w-8 animate-pulse rounded-sm bg-background" />
              </div>
            ))}
          </div>

          {/* Spacer for alignment */}
          {showLabels && <div className="w-0 sm:w-2" />}
        </div>
      )}

      {/* X-axis label placeholder */}
      {showAxisLabels && (
        <div className="flex justify-center text-center">
          <div className="h-3 w-16 animate-pulse rounded-sm bg-background" />
        </div>
      )}
    </div>
  );
}
