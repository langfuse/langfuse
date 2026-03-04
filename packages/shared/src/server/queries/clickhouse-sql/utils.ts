import { FilterState } from "../../../types";

/**
 * Helper to build experiment filter state.
 */
export const buildExperimentFilterState = (params: {
  experimentIds?: string[];
  startTimeFrom?: string | null;
}): FilterState => {
  return [
    // Always filter for events with experiment_id
    {
      column: "hasExperimentId" as const,
      type: "boolean" as const,
      operator: "=" as const,
      value: true,
    },
    // Conditionally filter by specific experiment IDs
    ...(params.experimentIds?.length
      ? [
          {
            column: "experimentId" as const,
            type: "stringOptions" as const,
            operator: "any of" as const,
            value: params.experimentIds,
          } as const,
        ]
      : []),
    // Conditionally filter by start time
    ...(params.startTimeFrom
      ? [
          {
            column: "startTime" as const,
            type: "datetime" as const,
            operator: ">=" as const,
            value: new Date(params.startTimeFrom),
          } as const,
        ]
      : []),
  ];
};
