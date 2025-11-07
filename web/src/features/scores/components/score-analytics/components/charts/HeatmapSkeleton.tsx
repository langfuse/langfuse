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
 * Calculate cell opacity based on distance from diagonal with jitter
 * Cells near diagonal (row ≈ col) are darker, with random variation
 *
 * @param row - Row index (0-based)
 * @param col - Column index (0-based)
 * @param rows - Total number of rows
 * @param cols - Total number of columns
 * @returns Opacity class string (e.g., "bg-muted/50")
 */
function getCellOpacity(
  row: number,
  col: number,
  rows: number,
  cols: number,
): string {
  // Normalize to 0-1 range
  const normalizedRow = row / (rows - 1);
  const normalizedCol = col / (cols - 1);

  // Calculate distance from diagonal
  const distanceFromDiagonal = Math.abs(normalizedRow - normalizedCol);

  // Add deterministic "random" jitter based on cell position
  // Using a simple hash-like function for consistency
  const jitter = ((row * 73 + col * 37) % 100) / 100 / 5; // ±0.2 variation

  // Base opacity: 0 at diagonal, 1 at corners
  let opacity = distanceFromDiagonal + jitter;

  // Clamp to reasonable range and map to opacity levels
  opacity = Math.max(0, Math.min(1, opacity));

  // Map to opacity classes: darker near diagonal, lighter away
  if (opacity < 0.25) return "bg-muted/50"; // Darkest (near diagonal)
  if (opacity < 0.5) return "bg-muted/40";
  if (opacity < 0.75) return "bg-muted/30";
  return "bg-muted/20"; // Lightest (far from diagonal)
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
 * - Diagonal pattern: darker cells near diagonal, lighter away
 * - Random jitter for natural appearance
 * - Optional row/column labels with skeleton placeholders
 * - Optional axis labels with skeleton placeholders
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
              className="h-16 w-3 animate-pulse rounded-sm bg-muted/40"
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
                <div className="h-3 w-10 animate-pulse rounded-sm bg-muted/40" />
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
          {Array.from({ length: rows * cols }).map((_, idx) => {
            const row = Math.floor(idx / cols);
            const col = idx % cols;
            const opacityClass = getCellOpacity(row, col, rows, cols);

            return (
              <div
                key={idx}
                className={cn(
                  "animate-pulse rounded-sm border border-border/50 transition-all duration-150 hover:brightness-95",
                  opacityClass,
                )}
              />
            );
          })}
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
                <div className="h-2.5 w-8 animate-pulse rounded-sm bg-muted/40" />
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
          <div className="h-3 w-16 animate-pulse rounded-sm bg-muted/40" />
        </div>
      )}
    </div>
  );
}
