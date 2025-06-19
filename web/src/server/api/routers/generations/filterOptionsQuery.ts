import { z } from "zod/v4";

import {
  timeFilter,
  tracesTableUiColumnDefinitions,
  type ObservationOptions,
} from "@langfuse/shared";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import {
  getCategoricalScoresGroupedByName,
  getObservationsGroupedByModel,
  getObservationsGroupedByModelId,
  getObservationsGroupedByName,
  getObservationsGroupedByPromptName,
  getNumericScoresGroupedByName,
  getTracesGroupedByName,
  getTracesGroupedByTags,
} from "@langfuse/shared/src/server";

export const filterOptionsQuery = protectedProjectProcedure
  .input(
    z.object({
      projectId: z.string(),
      startTimeFilter: timeFilter.optional(),
    }),
  )
  .query(async ({ input }) => {
    const { startTimeFilter } = input;

    const getClickhouseTraceName = async (): Promise<
      Array<{ traceName: string }>
    > => {
      const traces = await getTracesGroupedByName(
        input.projectId,
        tracesTableUiColumnDefinitions,
        startTimeFilter
          ? [
              {
                column: "Timestamp",
                operator: startTimeFilter.operator,
                value: startTimeFilter.value,
                type: "datetime",
              },
            ]
          : [],
      );
      return traces.map((i) => ({ traceName: i.name }));
    };

    const getClickhouseTraceTags = async (): Promise<
      Array<{ tag: string }>
    > => {
      const traces = await getTracesGroupedByTags({
        projectId: input.projectId,
        filter: startTimeFilter
          ? [
              {
                column: "Timestamp",
                operator: startTimeFilter.operator,
                value: startTimeFilter.value,
                type: "datetime",
              },
            ]
          : [],
      });
      return traces.map((i) => ({ tag: i.value }));
    };

    const [
      numericScoreNames,
      categoricalScoreNames,
      model,
      name,
      promptNames,
      traceNames,
      tags,
      modelId,
    ] = await Promise.all([
      // numeric scores
      getNumericScoresGroupedByName(
        input.projectId,
        startTimeFilter
          ? [
              {
                column: "Timestamp",
                operator: startTimeFilter.operator,
                value: startTimeFilter.value,
                type: "datetime",
              },
            ]
          : [],
      ),
      // categorical scores
      getCategoricalScoresGroupedByName(
        input.projectId,
        startTimeFilter
          ? [
              {
                column: "Timestamp",
                operator: startTimeFilter.operator,
                value: startTimeFilter.value,
                type: "datetime",
              },
            ]
          : [],
      ),
      //model
      getObservationsGroupedByModel(
        input.projectId,
        startTimeFilter ? [startTimeFilter] : [],
      ),
      //name
      getObservationsGroupedByName(
        input.projectId,
        startTimeFilter ? [startTimeFilter] : [],
      ),
      //prompt name
      getObservationsGroupedByPromptName(
        input.projectId,
        startTimeFilter ? [startTimeFilter] : [],
      ),
      //trace name
      getClickhouseTraceName(),
      // trace tags
      getClickhouseTraceTags(),
      // modelId
      getObservationsGroupedByModelId(
        input.projectId,
        startTimeFilter ? [startTimeFilter] : [],
      ),
    ]);

    // typecheck filter options, needs to include all columns with options
    const res: ObservationOptions = {
      model: model
        .filter((i) => i.model !== null)
        .map((i) => ({ value: i.model as string })),
      modelId: modelId
        .filter((i) => i.modelId !== null)
        .map((i) => ({
          value: i.modelId as string,
        })),
      name: name
        .filter((i) => i.name !== null)
        .map((i) => ({ value: i.name as string })),
      traceName: traceNames
        .filter((i) => i.traceName !== null)
        .map((i) => ({
          value: i.traceName as string,
        })),
      scores_avg: numericScoreNames.map((score) => score.name),
      score_categories: categoricalScoreNames,
      promptName: promptNames
        .filter((i) => i.promptName !== null)
        .map((i) => ({
          value: i.promptName as string,
        })),
      tags: tags
        .filter((i) => i.tag !== null)
        .map((i) => ({
          value: i.tag as string,
        })),
      type: ["GENERATION", "SPAN", "EVENT"].map((i) => ({
        value: i,
      })),
    };

    return res;
  });
