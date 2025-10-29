import { type HeatmapCell } from "@/src/features/scores/lib/heatmap-utils";
import { getContrastColor } from "@/src/features/scores/lib/color-scales";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/utils/tailwind";

interface HeatmapCellProps {
  cell?: HeatmapCell;
  onHover?: (cell: HeatmapCell | null) => void;
  onClick?: (cell: HeatmapCell) => void;
  renderTooltip?: (cell: HeatmapCell) => React.ReactNode;
  cellClassName?: string;
}

export function HeatmapCellComponent({
  cell,
  onHover,
  onClick,
  renderTooltip,
  cellClassName,
}: HeatmapCellProps) {
  // Empty cell (no data)
  if (!cell) {
    return (
      <div
        className={cn("aspect-square bg-muted/30", cellClassName)}
        aria-hidden="true"
      />
    );
  }

  const textColor = getContrastColor(cell.color);
  const hasInteraction = onClick !== undefined;

  const cellContent = (
    <button
      type="button"
      disabled={!hasInteraction}
      className={cn(
        "aspect-square w-full",
        "flex items-center justify-center",
        "text-xs font-medium",
        "transition-all",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "whitespace-pre-line text-center leading-tight",
        hasInteraction && "cursor-pointer hover:scale-105 hover:shadow-md",
        !hasInteraction && "cursor-default",
        cellClassName,
      )}
      style={{
        backgroundColor: cell.color,
        color: textColor === "white" ? "white" : "black",
      }}
      onMouseEnter={() => onHover?.(cell)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => onClick?.(cell)}
      aria-label={cell.displayValue || `Value: ${cell.value}`}
    >
      <span className="text-[10px] sm:text-xs">{cell.displayValue}</span>
    </button>
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
