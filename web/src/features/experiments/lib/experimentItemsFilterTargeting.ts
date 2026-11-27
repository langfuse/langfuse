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
  scoreTypesError,
}: {
  baselineId?: string;
  experimentIds: readonly string[];
  experiments: readonly {
    experimentId: string;
    experimentName: string;
    datasetName?: string | null;
  }[];
  colorExperimentIds: string[];
  scoreTypesError?: string;
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
    names.filter((name) => name === experiment.experimentName).length > 1 ||
    experiment.experimentName === "All experiments"
      ? `${experiment.experimentName} (${experiment.datasetName ?? "Dataset"})`
      : experiment.experimentName,
  );
  return {
    defaultTarget: "all",
    scoreTypesError,
    legacyDefaultTarget: baselineId ? "baseline" : experimentIds[0],
    targets: [
      {
        id: "all",
        label: "All experiments",
        displayLabel: "All experiments",
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

function supportsExperimentItemFilterTarget(field: FieldRef): boolean {
  return (
    field.type === "scores" ||
    field.type === "metadata" ||
    (field.type === "field" && field.field.id === "level")
  );
}
