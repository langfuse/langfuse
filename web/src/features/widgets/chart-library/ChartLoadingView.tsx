import React from "react";
import { cn } from "@/src/utils/tailwind";

export function ChartLoadingView({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[9rem] w-full flex-1 flex-col items-center justify-center gap-3 rounded-lg p-6",
        className,
      )}
    >
      <p className="text-sm font-medium text-muted-foreground">
        Loading chart data…
      </p>
      <div className="relative h-2 w-full max-w-sm overflow-hidden rounded-full bg-primary/20">
        <div
          className="h-full w-1/3 animate-chart-loading-slide rounded-full bg-primary"
          style={{ willChange: "transform" }}
        />
      </div>
    </div>
  );
}
