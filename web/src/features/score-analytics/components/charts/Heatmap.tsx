import { useMemo, useLayoutEffect, useState, useRef } from "react";
import { type HeatmapCell } from "@/src/features/score-analytics/lib/heatmap-utils";
import { HeatmapCellComponent } from "./HeatmapCell";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
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
  cellHeight?: number; // Dynamic cell height in pixels
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
  cellHeight: cellHeightProp,
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

  // Detect division point mode (numeric heatmaps with nBins+1 labels)
  const isDivisionPointMode =
    rowLabels &&
    rowLabels.length === rows + 1 &&
    colLabels &&
    colLabels.length === cols + 1;

  // Calculate adaptive thinning for division point labels
  // Show every nth label based on number of bins
  const labelStep = useMemo(() => {
    if (!isDivisionPointMode) return 1;

    // Adaptive thinning based on number of bins
    if (rows >= 20 || cols >= 20) return 4; // Show every 4th label for very dense grids
    if (rows >= 15 || cols >= 15) return 3; // Show every 3rd label
    if (rows >= 10 || cols >= 10) return 2; // Show every 2nd label
    return 1; // Show all labels for smaller grids
  }, [isDivisionPointMode, rows, cols]);

  // Calculate responsive cell size - width-biased for minimal vertical space
  const cellWidth = "minmax(32px, 1fr)"; // Can grow wide
  const cellHeight = cellHeightProp
    ? `${cellHeightProp}px`
    : "minmax(24px, 40px)";

  // Determine max label lengths based on grid dimensions
  const maxYLabelLength = 8; // Y-axis allows up to 8 characters
  const maxXLabelLength = useMemo(() => {
    if (cols < 4) return 12; // Fewer columns, more space per label
    if (cols < 8) return 10; // Medium number of columns
    return 6; // Many columns, less space per label
  }, [cols]);

  // Dynamic width calculation for y-axis labels
  const rowLabelsRef = useRef<HTMLDivElement>(null);
  const [rowLabelsWidth, setRowLabelsWidth] = useState(60);

  useLayoutEffect(() => {
    if (rowLabelsRef.current && rowLabels && rowLabels.length > 0) {
      const container = rowLabelsRef.current;

      // Find the widest label by measuring each label element
      const labelElements = container.querySelectorAll("span");
      let maxLabelWidth = 0;

      labelElements.forEach((element) => {
        const width = element.offsetWidth;
        maxLabelWidth = Math.max(maxLabelWidth, width);
      });

      // Add padding (pr-1 is 4px on small screens, pr-2 is 8px on larger)
      const totalWidth = maxLabelWidth + 8;

      const finalWidth = Math.max(36, Math.min(totalWidth, 120)); // Min 36px, max 120px

      setRowLabelsWidth(finalWidth);
    }
  }, [rowLabels, isDivisionPointMode]);

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn("flex w-full flex-1 flex-col gap-4", className)}
        style={{ width, height }}
        role="img"
        aria-label={ariaLabel}
      >
        <div className="flex flex-1 items-stretch justify-center gap-1 sm:gap-2">
          {/* Y-axis label (vertical) */}
          {yAxisLabel && (
            <div className="flex items-center justify-center">
              <span
                className="text-xs font-normal text-muted-foreground"
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                }}
              >
                {yAxisLabel}
              </span>
            </div>
          )}
          {/* Row labels */}
          {rowLabels && rowLabels.length > 0 && (
            <div
              ref={rowLabelsRef}
              className={cn(
                "pr-1 text-right text-[10px] text-muted-foreground sm:pr-2 sm:text-xs",
                isDivisionPointMode
                  ? "flex flex-col justify-between self-stretch"
                  : "grid gap-1",
              )}
              style={{
                width: `${rowLabelsWidth}px`,
                ...(isDivisionPointMode
                  ? {}
                  : { gridTemplateRows: `repeat(${rows}, ${cellHeight})` }),
              }}
            >
              {rowLabels.map((label, idx) => {
                // Apply adaptive thinning for division points
                const shouldShow =
                  !isDivisionPointMode || idx % labelStep === 0;
                if (!shouldShow) {
                  return <div key={idx} className="h-0" />;
                }

                // Y-axis: truncate if > 8 chars, show first 5 + "..."
                const shouldTruncate =
                  !isDivisionPointMode && label.length > maxYLabelLength;
                const truncated = shouldTruncate
                  ? label.slice(0, 5) + "..."
                  : label;

                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex justify-end",
                      isDivisionPointMode ? "items-start" : "items-center",
                    )}
                  >
                    {shouldTruncate ? (
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <span className="cursor-help text-right">
                            {truncated}
                          </span>
                        </HoverCardTrigger>
                        <HoverCardContent
                          side="left"
                          align="center"
                          className="w-auto"
                        >
                          <div className="space-y-1">
                            <p className="font-semibold">{label}</p>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    ) : (
                      <span>{label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Grid */}
          <div
            className="grid w-full flex-1 gap-0.5"
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
              <div style={{ width: `${rowLabelsWidth}px` }} />
            )}

            <div
              className={cn(
                "w-full flex-1 text-center text-[10px] text-muted-foreground sm:text-xs",
                isDivisionPointMode ? "flex justify-between" : "grid gap-1",
              )}
              style={
                isDivisionPointMode
                  ? undefined
                  : { gridTemplateColumns: `repeat(${cols}, ${cellWidth})` }
              }
            >
              {colLabels.map((label, idx) => {
                // Apply adaptive thinning for division points
                const shouldShow =
                  !isDivisionPointMode || idx % labelStep === 0;
                if (!shouldShow) {
                  return <div key={idx} className="w-0" />;
                }

                // X-axis: dynamic truncation based on number of columns
                const shouldTruncate =
                  !isDivisionPointMode && label.length > maxXLabelLength;
                const truncated = shouldTruncate
                  ? label.slice(0, maxXLabelLength - 3) + "..."
                  : label;

                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex justify-center",
                      isDivisionPointMode ? "items-start" : "items-center",
                    )}
                  >
                    {shouldTruncate ? (
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <span className="cursor-help">{truncated}</span>
                        </HoverCardTrigger>
                        <HoverCardContent
                          side="bottom"
                          align="center"
                          className="w-auto"
                        >
                          <div className="space-y-1">
                            <p className="text-xs">{label}</p>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    ) : (
                      <span>{label}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Spacer for alignment */}
            {rowLabels && rowLabels.length > 0 && (
              <div className="w-0 sm:w-2" />
            )}
          </div>
        )}

        {/* X-axis label */}
        {xAxisLabel && (
          <div className="text-center text-xs font-normal text-muted-foreground">
            {xAxisLabel}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
