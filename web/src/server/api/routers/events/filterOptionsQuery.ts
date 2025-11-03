import { z } from "zod/v4";
import { timeFilter } from "@langfuse/shared";
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
  tracesTableUiColumnDefinitions,
} from "@langfuse/shared/src/server";
import { type EventsTableOptions } from "@langfuse/shared";

export const filterOptionsQuery = protectedProjectProcedure
  .input(
    z.object({
      projectId: z.string(),
      startTimeFilter: z.array(timeFilter).optional(),
    }),
  )
  .query(async ({ input }) => {
    const { startTimeFilter } = input;

    // map startTimeFilter to Timestamp column for trace queries
    const traceTimestampFilters =
      startTimeFilter && startTimeFilter.length > 0
        ? startTimeFilter.map((f) => ({
            column: "Timestamp" as const,
            operator: f.operator,
            value: f.value,
            type: "datetime" as const,
          }))
        : [];

    const getClickhouseTraceName = async (): Promise<
      Array<{ traceName: string }>
    > => {
      const traces = await getTracesGroupedByName(
        input.projectId,
        tracesTableUiColumnDefinitions,
        traceTimestampFilters,
      );
      return traces.map((i) => ({ traceName: i.name }));
    };

    const getClickhouseTraceTags = async (): Promise<
      Array<{ tag: string }>
    > => {
      const traces = await getTracesGroupedByTags({
        projectId: input.projectId,
        filter: traceTimestampFilters,
      });
      return traces.map((i) => ({ tag: i.value }));
    };

    const [
      numericScoreNames,
      categoricalScoreNames,
      providedModelName,
      name,
      promptNames,
      traceNames,
      traceTags,
      modelId,
    ] = await Promise.all([
      // numeric scores
      getNumericScoresGroupedByName(input.projectId, traceTimestampFilters),
      // categorical scores
      getCategoricalScoresGroupedByName(input.projectId, traceTimestampFilters),
      // provided model name (maps to "model" in observations)
      getObservationsGroupedByModel(input.projectId, startTimeFilter ?? []),
      // observation name
      getObservationsGroupedByName(input.projectId, startTimeFilter ?? []),
      // prompt name
      getObservationsGroupedByPromptName(
        input.projectId,
        startTimeFilter ?? [],
      ),
      // trace name
      getClickhouseTraceName(),
      // trace tags
      getClickhouseTraceTags(),
      // modelId
      getObservationsGroupedByModelId(input.projectId, startTimeFilter ?? []),
    ]);

    // Return EventsTableOptions compatible response
    const res: EventsTableOptions = {
      providedModelName: providedModelName
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
      traceTags: traceTags
        .filter((i) => i.tag !== null)
        .map((i) => ({
          value: i.tag as string,
        })),
      type: [
        "GENERATION",
        "SPAN",
        "EVENT",
        "AGENT",
        "TOOL",
        "CHAIN",
        "RETRIEVER",
        "EVALUATOR",
        "EMBEDDING",
        "GUARDRAIL",
      ].map((i) => ({
        value: i,
      })),
      environment: [], // Environment is fetched separately via api.projects.environmentFilterOptions
    };

    return res;
  });
