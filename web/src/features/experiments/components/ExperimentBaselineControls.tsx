import { type ComponentProps, useMemo } from "react";
import { ExperimentBaselineSelect } from "./ExperimentBaselineSelect";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import { formatRunRecency } from "@/src/features/experiments/fns/formatRunRecency";
import {
  NO_DATASET_KEY,
  NO_DATASET_LABEL,
  UNNAMED_DATASET_LABEL,
} from "@/src/features/experiments/constants/comparison";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { baselineChangedProps } from "@/src/features/experiments/lib/analytics";

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

  // `baseline_changed` fires from the two paths through this control — picking a
  // run and clearing it. Arriving on the page with a baseline already set (a row
  // click on the list, a shared link) is navigation rather than use of this
  // control, and is deliberately not counted; the results pageview is that
  // denominator.

  // Grouped by dataset and dated, so two runs sharing a name are two readable
  // options rather than the same label twice.
  const baselineOptionGroups = useMemo(() => {
    const byDataset = new Map<
      string,
      Extract<
        ComponentProps<typeof ExperimentBaselineSelect>["options"][number],
        { type: "group" }
      >
    >();

    for (const experiment of experimentNames) {
      const datasetKey = experiment.datasetId ?? NO_DATASET_KEY;
      const group = byDataset.get(datasetKey) ?? {
        type: "group" as const,
        id: datasetKey,
        label:
          experiment.datasetId === null
            ? NO_DATASET_LABEL
            : (experiment.datasetName ?? UNNAMED_DATASET_LABEL),
        options: [],
      };
      group.options.push({
        value: experiment.experimentId,
        label: experiment.experimentName,
        secondaryLabel: formatRunRecency(experiment.startTime),
      });
      byDataset.set(datasetKey, group);
    }

    return [...byDataset.values()];
  }, [experimentNames]);

  return (
    <ExperimentBaselineSelect
      options={baselineOptionGroups}
      baselineId={baselineId}
      baselineName={baselineName}
      isLoading={isLoading}
      onBaselineChange={(id) => {
        if (id === baselineId) return;
        capture(
          "experiment:baseline_changed",
          baselineChangedProps({
            tableName: "experiment-items",
            source: "picker",
          }),
        );
        onBaselineChange(id);
      }}
      onBaselineClear={() => {
        capture(
          "experiment:baseline_changed",
          baselineChangedProps({
            tableName: "experiment-items",
            source: "clear",
          }),
        );
        onBaselineClear();
      }}
    />
  );
}
