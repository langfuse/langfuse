import { type z } from "zod/v4";
import {
  getCategoricalScoresForExperiments,
  getNumericScoresForExperiments,
} from "@langfuse/shared/src/server";
import { type timeFilter, type FilterState } from "@langfuse/shared";

type TimeFilter = z.infer<typeof timeFilter>;

interface GetExperimentFilterOptionsParams {
  projectId: string;
  startTimeFilter?: TimeFilter[];
}

/**
 * Get all available filter options for experiments table
 * Scoped to events where experiment_id is set
 */
export async function getExperimentFilterOptions(
  params: GetExperimentFilterOptionsParams,
) {
  const { projectId, startTimeFilter } = params;

  // Build timestamp filter for scoping results
  const timestampFilter: FilterState = startTimeFilter ?? [];

  // Fetch score filter options scoped to experiment events
  // These functions join with observations and filter by experiment_id
  const [numericScoreNames, categoricalScoreNames] = await Promise.all([
    getNumericScoresForExperiments(projectId, timestampFilter),
    getCategoricalScoresForExperiments(projectId, timestampFilter),
  ]);

  return {
    scores_avg: numericScoreNames.map((score) => score.name),
    score_categories: categoricalScoreNames,
  };
}
