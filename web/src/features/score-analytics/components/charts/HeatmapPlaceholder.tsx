import { Skeleton } from "@/src/components/ui/skeleton";

/**
 * HeatmapPlaceholder component displays a skeleton grid placeholder
 * when only one score is selected, indicating that a heatmap will appear
 * when a second score is selected.
 */
export function HeatmapPlaceholder() {
  return (
    <div className="relative flex h-[300px] items-center justify-center">
      {/* Skeleton grid pattern (5x5) */}
      <div className="absolute inset-0 flex flex-col gap-2 p-4">
        {Array.from({ length: 5 }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex flex-1 gap-2">
            {Array.from({ length: 5 }).map((_, colIndex) => (
              <Skeleton key={colIndex} className="flex-1" />
            ))}
          </div>
        ))}
      </div>

      {/* Overlay message */}
      <div className="relative z-10 rounded-lg bg-background/90 px-6 py-4 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          Select a second score to view comparison heatmap
        </p>
      </div>
    </div>
  );
}
