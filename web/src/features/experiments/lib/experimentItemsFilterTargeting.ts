import {
  type FieldRef,
  type FilterTargeting,
} from "@/src/features/search-bar/lib/fields";
import { getExperimentColorStyles } from "@/src/features/experiments/components/table/types";

export function supportsExperimentItemFilterTarget(field: FieldRef): boolean {
  return (
    field.type === "scores" ||
    (field.type === "field" && field.field.id === "level")
  );
}

export function experimentItemsFilterTargeting({
  baselineId,
  experiments,
  colorExperimentIds,
}: {
  baselineId?: string;
  experiments: readonly { experimentId: string; experimentName: string }[];
  colorExperimentIds: string[];
}): FilterTargeting {
  return {
    defaultTarget: "baseline",
    targets: [
      ...(baselineId
        ? [
            {
              id: "baseline",
              label: "baseline",
              keyword: true,
              textClassName: getExperimentColorStyles(
                baselineId,
                colorExperimentIds,
              ).textClass,
            },
          ]
        : []),
      ...experiments.map((experiment) => ({
        id: experiment.experimentId,
        label: experiment.experimentName,
        textClassName: getExperimentColorStyles(
          experiment.experimentId,
          colorExperimentIds,
        ).textClass,
      })),
    ],
    supports: supportsExperimentItemFilterTarget,
  };
}
