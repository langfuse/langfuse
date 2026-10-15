import {
  type FieldRef,
  type FilterTargeting,
} from "@/src/features/search-bar/lib/fields";
import { getExperimentColorStyles } from "@/src/features/experiments/components/table/types";

export function experimentItemsFilterTargeting({
  baselineId,
  experimentIds,
  experiments,
  colorExperimentIds,
  scoreTypesForTarget,
  scoreTypesError,
  observedForTarget,
}: {
  baselineId?: string;
  experimentIds: readonly string[];
  experiments: readonly {
    experimentId: string;
    experimentName: string;
    datasetName?: string | null;
  }[];
  colorExperimentIds: string[];
  scoreTypesForTarget?: FilterTargeting["scoreTypesForTarget"];
  scoreTypesError?: string;
  observedForTarget?: FilterTargeting["observedForTarget"];
}): FilterTargeting {
  const experimentsById = new Map(
    experiments.map((experiment) => [experiment.experimentId, experiment]),
  );
  const selectedExperiments = experimentIds.map(
    (experimentId) =>
      experimentsById.get(experimentId) ?? {
        experimentId,
        experimentName: experimentId,
        datasetName: null,
      },
  );
  const names = selectedExperiments.map(
    (experiment) => experiment.experimentName,
  );
  const labels = selectedExperiments.map((experiment) =>
    names.filter((name) => name === experiment.experimentName).length > 1
      ? `${experiment.experimentName} (${experiment.datasetName ?? "Dataset"})`
      : experiment.experimentName,
  );
  return {
    defaultTarget: "all",
    legacyDefaultTarget: baselineId ? "baseline" : experimentIds[0],
    scoreTypesForTarget,
    scoreTypesError,
    observedForTarget,
    targets: [
      {
        id: "all",
        label: "all",
        displayLabel: "All selected experiments",
        keyword: true,
      },
      ...(baselineId
        ? [
            {
              id: "baseline",
              label: "baseline",
              displayLabel: "Baseline",
              keyword: true,
              textClassName: getExperimentColorStyles(
                baselineId,
                colorExperimentIds,
              ).textClass,
            },
          ]
        : []),
      ...selectedExperiments.map((experiment, index) => ({
        id: experiment.experimentId,
        label:
          labels.filter((label) => label === labels[index]).length > 1
            ? `${labels[index]} [${experiment.experimentId}]`
            : labels[index],
        textClassName: getExperimentColorStyles(
          experiment.experimentId,
          colorExperimentIds,
        ).textClass,
      })),
    ],
    supports: supportsExperimentItemFilterTarget,
  };
}

export function supportsExperimentItemFilterTarget(field: FieldRef): boolean {
  return (
    field.type === "scores" ||
    field.type === "metadata" ||
    (field.type === "field" && field.field.id === "level")
  );
}
