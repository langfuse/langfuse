import { cn } from "@/src/utils/tailwind";
import { useMemo } from "react";

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
 * Uses foreground color with opacity range (1%-15%)
 *
 * Three zones based on distance from diagonal:
 * - Zone 1 (Dark): 5-15% opacity (near diagonal)
 * - Zone 2 (Medium): 2-8% opacity (mid-distance)
 * - Zone 3 (Light): 1-4% opacity (far from diagonal)
 *
 * @param row - Row index (0-based)
 * @param col - Column index (0-based)
 * @param rows - Total number of rows
 * @param cols - Total number of columns
 * @param seed - Random seed for variation on each component mount
 * @returns Opacity value as number (0-1 range)
 */
function getCellOpacity(
  row: number,
  col: number,
  rows: number,
  cols: number,
  seed: number,
): number {
  // Normalize to 0-1 range
  const normalizedRow = row / (rows - 1);
  const normalizedCol = col / (cols - 1);

  // Calculate distance from diagonal (0 = on diagonal, 1 = far corner)
  const distanceFromDiagonal = Math.abs(normalizedRow - normalizedCol);

  // Random jitter based on cell position and seed (0-1 range)
  const jitter = ((row * 73 + col * 37 + seed * 41) % 100) / 100;

  // Determine zone and opacity range
  let minOpacity: number;
  let maxOpacity: number;

  if (distanceFromDiagonal < 0.33) {
    // Zone 1: Dark (near diagonal) - highest opacity
    minOpacity = 0.05;
    maxOpacity = 0.15;
  } else if (distanceFromDiagonal < 0.66) {
    // Zone 2: Medium (mid-distance)
    minOpacity = 0.02;
    maxOpacity = 0.08;
  } else {
    // Zone 3: Light (far from diagonal)
    minOpacity = 0.01;
    maxOpacity = 0.04;
  }

  // Calculate final opacity with jitter within zone range
  const opacity = minOpacity + jitter * (maxOpacity - minOpacity);

  // Return opacity value (will be used in inline style)
  return opacity;
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
  // Generate random seed once on component mount for pattern variation
  const randomSeed = useMemo(() => Math.random() * 1000, []);

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
            const opacity = getCellOpacity(row, col, rows, cols, randomSeed);

            return (
              <div
                key={idx}
                className="rounded-sm border border-border/50 transition-all duration-150 hover:brightness-95"
                style={{
                  backgroundColor: `hsl(var(--foreground) / ${opacity})`,
                }}
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
