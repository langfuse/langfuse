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

  // Calculate responsive cell size
  const cellMinSize = "minmax(24px, 1fr)";

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
            <span
              className="text-sm font-medium text-muted-foreground"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              {yAxisLabel}
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 sm:gap-4">
          {/* Row labels */}
          {rowLabels && rowLabels.length > 0 && (
            <div
              className="flex flex-col justify-around gap-0.5 pr-1 text-right text-[10px] text-muted-foreground sm:pr-2 sm:text-xs"
              style={{
                height: height || "auto",
                minHeight: `calc(${rows} * 24px + ${rows - 1} * 2px)`,
              }}
            >
              {rowLabels.map((label, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-end"
                  style={{
                    height: `calc((100% - ${(rows - 1) * 2}px) / ${rows})`,
                  }}
                >
                  <span className="max-w-[60px] truncate sm:max-w-[80px]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Grid */}
          <div
            className="grid max-w-full flex-1 gap-0.5 overflow-x-auto"
            style={{
              gridTemplateColumns: `repeat(${cols}, ${cellMinSize})`,
              gridTemplateRows: `repeat(${rows}, ${cellMinSize})`,
              maxWidth: "600px",
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
                  onHover={onCellHover}
                  onClick={onCellClick}
                  renderTooltip={renderTooltip}
                  cellClassName={cellClassName}
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
              className="flex flex-1 justify-around text-center text-[10px] text-muted-foreground sm:text-xs"
              style={{ maxWidth: "600px" }}
            >
              {colLabels.map((label, idx) => (
                <div
                  key={idx}
                  className="truncate"
                  style={{
                    width: `calc((100% - ${(cols - 1) * 2}px) / ${cols})`,
                  }}
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
