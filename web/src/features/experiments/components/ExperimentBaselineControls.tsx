import { useMemo } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { EXPERIMENT_ANALYTICS_DIMENSIONS } from "@/src/features/experiments/constants/analytics";
import { Button } from "@/src/components/ui/button";
import {
  Combobox,
  type ComboboxOptionGroup,
} from "@/src/components/ui/combobox";
import { X } from "lucide-react";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import { formatRunRecency } from "@/src/features/experiments/fns/formatRunRecency";
import {
  NO_DATASET_KEY,
  NO_DATASET_LABEL,
  UNNAMED_DATASET_LABEL,
} from "@/src/features/experiments/constants/comparison";
import { cn } from "@/src/utils/tailwind";

type ExperimentBaselineControlsProps = {
  projectId: string;
  baselineId?: string;
  baselineName?: string;
  onBaselineChange: (id: string) => void;
  onBaselineClear: () => void;
};

export function ExperimentBaselineControls({
  projectId,
  baselineId,
  baselineName,
  onBaselineChange,
  onBaselineClear,
}: ExperimentBaselineControlsProps) {
  const { experimentNames, isLoading } = useExperimentNames({
    projectId,
  });
  const capture = usePostHogClientCapture();

  // Is the baseline control used, or ignored? Two paths, both from the control
  // itself: picking a run and clearing it. Arriving on the page with a baseline
  // already set (a row click on the experiments list, a shared link) is
  // navigation rather than use of this control, and is deliberately not counted
  // here — the results pageview is that denominator. (LFE-15720)
  const captureBaselineChanged = (source: "picker" | "cleared") =>
    capture("experiment:baseline_changed", {
      source,
      ...EXPERIMENT_ANALYTICS_DIMENSIONS,
    });

  // Grouped by dataset and dated, so two runs sharing a name are two readable
  // options rather than the same label twice.
  const baselineOptionGroups = useMemo<ComboboxOptionGroup<string>[]>(() => {
    const byDataset = new Map<string, ComboboxOptionGroup<string>>();

    for (const experiment of experimentNames) {
      const datasetKey = experiment.datasetId ?? NO_DATASET_KEY;
      const group = byDataset.get(datasetKey) ?? {
        heading:
          experiment.datasetId === null
            ? NO_DATASET_LABEL
            : (experiment.datasetName ?? UNNAMED_DATASET_LABEL),
        options: [],
      };
      group.options.push({
        value: experiment.experimentId,
        label: experiment.experimentName,
        badge: formatRunRecency(experiment.startTime),
      });
      byDataset.set(datasetKey, group);
    }

    return [...byDataset.values()];
  }, [experimentNames]);

  return (
    <div className="flex min-w-0 items-center">
      <div className="min-w-0 flex-1">
        <Combobox
          options={baselineOptionGroups}
          value={baselineId}
          onValueChange={(value) => {
            // The combobox can re-announce the current value; only a different
            // run is a change.
            if (value !== baselineId) captureBaselineChanged("picker");
            onBaselineChange(value);
          }}
          placeholder={baselineName ?? baselineId ?? "Select baseline..."}
          emptyText="No experiments found"
          searchPlaceholder="Search experiments..."
          disabled={isLoading}
          className={cn(
            "rounded-l-none border-l-0",
            baselineId && "rounded-r-none",
          )}
        />
      </div>

      {baselineId && (
        <Button
          variant="outline"
          size="icon"
          className="-ml-px shrink-0 rounded-l-none"
          onClick={() => {
            captureBaselineChanged("cleared");
            onBaselineClear();
          }}
          disabled={isLoading}
          title="Clear baseline"
          aria-label="Clear baseline"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
