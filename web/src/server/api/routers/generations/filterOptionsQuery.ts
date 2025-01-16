import { z } from "zod";

import {
  timeFilter,
  tracesTableUiColumnDefinitions,
  type ObservationOptions,
} from "@langfuse/shared";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import {
  getObservationsGroupedByModel,
  getObservationsGroupedByModelId,
  getObservationsGroupedByName,
  getObservationsGroupedByPromptName,
  getScoresGroupedByName,
  getTracesGroupedByName,
  getTracesGroupedByTags,
} from "@langfuse/shared/src/server";

export const filterOptionsQuery = protectedProjectProcedure
  .input(
    z.object({
      projectId: z.string(),
      startTimeFilter: timeFilter.optional(),
      queryClickhouse: z.boolean().default(false),
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

    const [scores, model, name, promptNames, traceNames, tags, modelId] =
      await Promise.all([
        //scores
        getScoresGroupedByName(
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
      scores_avg: scores.map((score) => score.name),
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
    };

    return res;
  });
