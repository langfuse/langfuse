import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { useExperimentPeekNavigation } from "../hooks/useExperimentPeekNavigation";
import { useExperimentNames } from "../hooks/useExperimentNames";
import { getExperimentColorStyles } from "./table/types";
import { cn } from "@/src/utils/tailwind";

export function ExperimentPeekFooter({ projectId }: { projectId: string }) {
  const {
    currentExperimentId,
    currentIndex,
    total,
    allExperimentIds,
    hasPrev,
    hasNext,
    goToPrev,
    goToNext,
  } = useExperimentPeekNavigation();

  const { experimentNames } = useExperimentNames({ projectId });
  const currentName =
    experimentNames.find((e) => e.experimentId === currentExperimentId)
      ?.experimentName ??
    currentExperimentId?.slice(0, 8) ??
    "Unknown";
  const colorStyles = currentExperimentId
    ? getExperimentColorStyles(currentExperimentId, allExperimentIds)
    : undefined;

  return (
    <div className="flex h-7 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn("truncate text-xs font-bold", colorStyles?.textClass)}
          title={currentName}
        >
          {currentName}
        </span>
        <Badge
          variant="outline"
          size="sm"
          className={cn("shrink-0 font-bold", colorStyles?.badgeClass)}
        >
          {currentIndex === 0 ? "Baseline" : "Comp"}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          className="gap-1.5 px-2"
          disabled={!hasPrev}
          onClick={goToPrev}
          title="Previous experiment"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-muted-foreground px-1 font-mono text-[10px] tabular-nums">
          {currentIndex + 1}/{total}
        </span>
        <Button
          variant="outline"
          className="gap-1.5 px-2"
          disabled={!hasNext}
          onClick={goToNext}
          title="Next experiment"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
