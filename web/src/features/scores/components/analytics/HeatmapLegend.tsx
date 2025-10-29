import {
  generateMonoColorScale,
  HEATMAP_BASE_COLORS,
  type HeatmapColorVariant,
} from "@/src/features/scores/lib/color-scales";
import { cn } from "@/src/utils/tailwind";

export interface HeatmapLegendProps {
  min: number;
  max: number;
  variant?: HeatmapColorVariant;
  title?: string;
  className?: string;
  orientation?: "horizontal" | "vertical";
  steps?: number;
}

export function HeatmapLegend({
  min,
  max,
  variant = "chart1",
  title = "Count",
  className,
  orientation = "horizontal",
  steps = 5,
}: HeatmapLegendProps) {
  const baseColor = HEATMAP_BASE_COLORS[variant];
  const colors = generateMonoColorScale(baseColor, steps);

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
    <div className={cn("flex flex-col gap-2", className)}>
      {title && (
        <div className="text-center text-xs font-medium text-muted-foreground">
          {title}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{labels[0]}</span>
        <div className="flex h-4 max-w-xs flex-1 gap-0.5">
          {colors.map((color, idx) => (
            <div
              key={idx}
              className="flex-1 rounded-sm border border-border first:rounded-l last:rounded-r"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {labels[steps - 1]}
        </span>
      </div>
    </div>
  );
}
