import { useMemo } from "react";
import { type HeatmapCell } from "@/src/features/scores/lib/heatmap-utils";
import { HeatmapCellComponent } from "./HeatmapCell";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

export interface HeatmapProps {
  // Data
  data: HeatmapCell[];

  // Grid dimensions
  rows: number;
  cols: number;

  // Labels
  rowLabels?: string[];
  colLabels?: string[];
  xAxisLabel?: string;
  yAxisLabel?: string;

  // Styling
  cellClassName?: string;
  width?: number | string;
  height?: number | string;
  className?: string;

  // Colors
  getColor: (cell: HeatmapCell) => string; // Function to compute cell color

  // Display options
  showValues?: boolean; // Whether to show numbers in cells (default: true)

  // Tooltip
  renderTooltip?: (cell: HeatmapCell) => React.ReactNode;

  // Interaction (optional)
  onCellClick?: (cell: HeatmapCell) => void;
  onCellHover?: (cell: HeatmapCell | null) => void;

  // Accessibility
  ariaLabel?: string;
}

export function Heatmap({
  data,
  rows,
  cols,
  rowLabels,
  colLabels,
  xAxisLabel,
  yAxisLabel,
  cellClassName,
  width = "100%",
  height,
  className,
  getColor,
  showValues = true,
  renderTooltip,
  onCellClick,
  onCellHover,
  ariaLabel = "Score comparison heatmap",
}: HeatmapProps) {
  // Create a 2D lookup map for fast cell access
  const cellMap = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    data.forEach((cell) => {
      map.set(`${cell.row}-${cell.col}`, cell);
    });
    return map;
  }, [data]);

  // Calculate responsive cell size - width-biased for minimal vertical space
  const cellWidth = "minmax(32px, 1fr)"; // Can grow wide
  const cellHeight = "minmax(24px, 40px)"; // Capped at 40px tall

  return (
    <TooltipProvider>
      <div
        className={cn("flex w-full flex-col gap-4", className)}
        style={{ width }}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Y-axis label (vertical) */}
        {yAxisLabel && (
          <div className="flex justify-center">
            <span className="text-sm font-medium text-muted-foreground">
              {yAxisLabel}
            </span>
          </div>
        )}

        <div className="flex items-stretch justify-center gap-2 sm:gap-4">
          {/* Row labels */}
          {rowLabels && rowLabels.length > 0 && (
            <div
              className="grid gap-1 pr-1 text-right text-[10px] text-muted-foreground sm:pr-2 sm:text-xs"
              style={{
                gridTemplateRows: `repeat(${rows}, ${cellHeight})`,
              }}
            >
              {rowLabels.map((label, idx) => (
                <div key={idx} className="flex items-center justify-end">
                  <span className="max-w-[60px] truncate sm:max-w-[80px]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Grid */}
          <div
            className="grid w-full flex-1 gap-1"
            style={{
              gridTemplateColumns: `repeat(${cols}, ${cellWidth})`,
              gridTemplateRows: `repeat(${rows}, ${cellHeight})`,
              height: height || "auto",
            }}
            role="grid"
          >
            {Array.from({ length: rows * cols }).map((_, idx) => {
              const row = Math.floor(idx / cols);
              const col = idx % cols;
              const cell = cellMap.get(`${row}-${col}`);

              return (
                <HeatmapCellComponent
                  key={idx}
                  cell={cell}
                  color={cell ? getColor(cell) : undefined}
                  onHover={onCellHover}
                  onClick={onCellClick}
                  renderTooltip={renderTooltip}
                  cellClassName={cellClassName}
                  showValues={showValues}
                />
              );
            })}
          </div>

          {/* Spacer for alignment when row labels exist */}
          {rowLabels && rowLabels.length > 0 && <div className="w-0 sm:w-2" />}
        </div>

        {/* Column labels */}
        {colLabels && colLabels.length > 0 && (
          <div className="flex items-start gap-2 sm:gap-4">
            {/* Spacer for row labels */}
            {rowLabels && rowLabels.length > 0 && (
              <div className="w-[60px] sm:w-[80px]" />
            )}

            <div
              className="grid w-full flex-1 gap-1 text-center text-[10px] text-muted-foreground sm:text-xs"
              style={{
                gridTemplateColumns: `repeat(${cols}, ${cellWidth})`,
              }}
            >
              {colLabels.map((label, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-center truncate"
                  title={label}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Spacer for alignment */}
            {rowLabels && rowLabels.length > 0 && (
              <div className="w-0 sm:w-2" />
            )}
          </div>
        )}

        {/* X-axis label */}
        {xAxisLabel && (
          <div className="text-center text-sm font-medium text-muted-foreground">
            {xAxisLabel}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
