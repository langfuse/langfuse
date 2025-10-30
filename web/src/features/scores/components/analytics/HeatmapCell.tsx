import { type HeatmapCell } from "@/src/features/scores/lib/heatmap-utils";
import {
  getContrastColor,
  getHoverColor,
} from "@/src/features/scores/lib/color-scales";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";

interface HeatmapCellProps {
  cell?: HeatmapCell;
  onHover?: (cell: HeatmapCell | null) => void;
  onClick?: (cell: HeatmapCell) => void;
  renderTooltip?: (cell: HeatmapCell) => React.ReactNode;
  cellClassName?: string;
  showValues?: boolean;
  emptyColor?: string; // Color to use for empty cells (defaults to lightest color in scale)
}

export function HeatmapCellComponent({
  cell,
  onHover,
  onClick,
  renderTooltip,
  cellClassName,
  showValues = true,
  emptyColor = "oklch(95% 0.02 240)", // Lightest color by default
}: HeatmapCellProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Empty cell (no data)
  if (!cell) {
    return (
      <div
        className={cn(
          "aspect-square rounded border-[0.5px] border-border/30",
          cellClassName,
        )}
        style={{ backgroundColor: emptyColor }}
        aria-hidden="true"
      />
    );
  }

  const textColor = getContrastColor(cell.color);
  const hasInteraction = onClick !== undefined;
  const displayColor = isHovered ? getHoverColor(cell.color) : cell.color;

  const sharedClassName = cn(
    "aspect-square w-full rounded border-[0.5px] border-border/30",
    "flex items-center justify-center",
    "text-xs font-medium",
    "transition-all duration-150",
    "whitespace-pre-line text-center leading-tight",
    hasInteraction && "cursor-pointer",
    !hasInteraction && "cursor-default",
    cellClassName,
  );

  const sharedStyle = {
    backgroundColor: displayColor,
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
