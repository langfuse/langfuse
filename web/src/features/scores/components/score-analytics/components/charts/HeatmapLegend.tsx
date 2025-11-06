import { getHeatmapCellColor } from "@/src/features/scores/lib/color-scales";
import { cn } from "@/src/utils/tailwind";

export interface HeatmapLegendProps {
  min: number;
  max: number;
  scoreNumber?: 1 | 2;
  title?: string;
  className?: string;
  orientation?: "horizontal" | "vertical";
  steps?: number;
}

export function HeatmapLegend({
  min,
  max,
  scoreNumber = 1,
  title,
  className,
  orientation = "horizontal",
  steps = 5,
}: HeatmapLegendProps) {
  // Generate colors using the same function as the heatmap cells
  const colors = Array.from({ length: steps }, (_, i) => {
    const value = min + ((max - min) * i) / (steps - 1);
    return getHeatmapCellColor(scoreNumber, value, min, max);
  });

  // Generate labels
  const labels = Array.from({ length: steps }, (_, i) => {
    const value = min + ((max - min) * i) / (steps - 1);
    return value.toFixed(0);
  });

  if (orientation === "vertical") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {title && (
          <div className="text-xs font-medium text-muted-foreground">
            {title}
          </div>
        )}
        <div className="flex flex-col gap-1">
          {colors
            .slice()
            .reverse()
            .map((color, idx) => {
              const labelIdx = steps - 1 - idx;
              return (
                <div key={idx} className="flex items-center gap-2">
                  <div
                    className="h-4 w-6 rounded border border-border"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {labels[labelIdx]}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  // Horizontal orientation
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs text-muted-foreground">{min}</span>
      <div className="flex items-center gap-0.5">
        {colors.map((color, idx) => (
          <div
            key={idx}
            className="h-4 w-4 rounded-sm border-[0.5px] border-border/30"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{max}</span>
    </div>
  );
}
