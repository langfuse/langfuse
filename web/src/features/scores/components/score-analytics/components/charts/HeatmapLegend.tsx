import { getHeatmapCellColor } from "@/src/features/scores/components/score-analytics/libs/color-scales";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import chroma from "chroma-js";

export interface HeatmapLegendProps {
  min: number;
  max: number;
  scoreNumber?: 1 | 2;
  title?: string;
  className?: string;
  orientation?: "horizontal" | "vertical";
  steps?: number;
}

/**
 * Check if a color is light/white (similar to empty cells)
 * @param color - Hex color string
 * @returns true if color is light (lightness > 85%)
 */
function isLightColor(color: string): boolean {
  try {
    const lightness = chroma(color).get("hsl.l");
    return lightness > 0.85; // 85% threshold
  } catch {
    return false;
  }
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
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

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
              const isHovered = hoveredIdx === idx;
              const isLight = isLightColor(color);
              return (
                <div key={idx} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-3.5 w-3.5 rounded border border-border transition-all duration-150",
                      isHovered && isLight && "brightness-95",
                      isHovered && !isLight && "brightness-75 saturate-[3]",
                    )}
                    style={{ backgroundColor: color }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
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
        {colors.map((color, idx) => {
          const isHovered = hoveredIdx === idx;
          const isLight = isLightColor(color);
          return (
            <div
              key={idx}
              className={cn(
                "h-3.5 w-3.5 rounded-sm border-[0.5px] border-border/30 transition-all duration-150",
                isHovered && isLight && "brightness-95",
                isHovered && !isLight && "brightness-75 saturate-[3]",
              )}
              style={{ backgroundColor: color }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">{max}</span>
    </div>
  );
}
