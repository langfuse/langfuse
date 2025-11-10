import { type HeatmapCell } from "@/src/features/scores/components/score-analytics/libs/heatmap-utils";
import { getContrastColor } from "@/src/features/scores/components/score-analytics/libs/color-scales";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";

interface HeatmapCellProps {
  cell?: HeatmapCell;
  color?: string; // Color for the cell (computed by parent)
  onHover?: (cell: HeatmapCell | null) => void;
  onClick?: (cell: HeatmapCell) => void;
  renderTooltip?: (cell: HeatmapCell) => React.ReactNode;
  cellClassName?: string;
  showValues?: boolean;
}

interface CellWithDataProps {
  cell: HeatmapCell;
  color?: string;
  onHover?: (cell: HeatmapCell | null) => void;
  onClick?: (cell: HeatmapCell) => void;
  renderTooltip?: (cell: HeatmapCell) => React.ReactNode;
  cellClassName?: string;
  showValues: boolean;
}

/**
 * Empty cell component (no data)
 */
function EmptyCell({ cellClassName }: { cellClassName?: string }) {
  return (
    <div
      className={cn(
        "h-full w-full rounded-sm border transition-all duration-150",
        "hover:brightness-95",
        cellClassName,
      )}
      style={{
        backgroundColor: "hsl(var(--background))",
        borderColor: "hsl(var(--border) / 0.5)",
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Cell with data component
 */
function CellWithData({
  cell,
  color,
  onHover,
  onClick,
  renderTooltip,
  cellClassName,
  showValues,
}: CellWithDataProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Determine if cell is empty (value = 0)
  const isEmpty = cell.value === 0;
  const hasInteraction = onClick !== undefined;

  // Use color from parent, fallback to transparent for empty cells
  const cellColor = color || "transparent";
  const textColor = isEmpty
    ? "hsl(var(--muted-foreground))"
    : getContrastColor(cellColor);

  const sharedClassName = cn(
    "h-full w-full rounded-sm border-[0.5px]",
    "flex items-center justify-center",
    "text-xs font-medium",
    "transition-all duration-150",
    "whitespace-pre-line text-center leading-tight",
    hasInteraction && "cursor-pointer",
    !hasInteraction && "cursor-default",
    // Apply CSS filters based on hover state and whether cell is empty
    isEmpty && isHovered && "brightness-95",
    !isEmpty && isHovered && "brightness-75 saturate-[3]",
    cellClassName,
  );

  const sharedStyle = {
    backgroundColor: isEmpty ? "hsl(var(--background))" : cellColor,
    borderColor: isEmpty
      ? "hsl(var(--border) / 0.34)" // Transparent border for empty cells
      : cellColor, // Border matches fill for filled cells
    color: textColor === "white" ? "white" : "black",
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover?.(cell);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHover?.(null);
  };

  const cellContent = hasInteraction ? (
    <button
      type="button"
      className={cn(
        sharedClassName,
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
      style={sharedStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onClick?.(cell)}
      aria-label={cell.displayValue || `Value: ${cell.value}`}
    >
      {showValues && (
        <span className="text-[10px] sm:text-xs">{cell.displayValue}</span>
      )}
    </button>
  ) : (
    <div
      className={sharedClassName}
      style={sharedStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={cell.displayValue || `Value: ${cell.value}`}
    >
      {showValues && (
        <span className="text-[10px] sm:text-xs">{cell.displayValue}</span>
      )}
    </div>
  );

  // Only wrap with tooltip if renderTooltip is provided
  if (renderTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cellContent}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {renderTooltip(cell)}
        </TooltipContent>
      </Tooltip>
    );
  }

  return cellContent;
}

/**
 * Public routing component that determines which cell type to render
 */
export function HeatmapCellComponent({
  cell,
  color,
  onHover,
  onClick,
  renderTooltip,
  cellClassName,
  showValues = true,
}: HeatmapCellProps) {
  // Route to appropriate component based on whether cell has data
  if (!cell) {
    return <EmptyCell cellClassName={cellClassName} />;
  }

  return (
    <CellWithData
      cell={cell}
      color={color}
      onHover={onHover}
      onClick={onClick}
      renderTooltip={renderTooltip}
      cellClassName={cellClassName}
      showValues={showValues}
    />
  );
}
