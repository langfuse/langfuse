import { z } from "zod/v4";

import {
  ObservationType,
  timeFilter,
  type ObservationOptions,
} from "@langfuse/shared";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import {
  getCategoricalScoresGroupedByName,
  getObservationsGroupedByModel,
  getObservationsGroupedByModelId,
  getObservationsGroupedByName,
  getObservationsGroupedByPromptName,
  getObservationsGroupedByToolName,
  getObservationsGroupedByCalledToolName,
  getNumericScoresGroupedByName,
  getTracesGroupedByName,
  getTracesGroupedByTags,
  tracesTableUiColumnDefinitions,
} from "@langfuse/shared/src/server";

export const filterOptionsQuery = protectedProjectProcedure
  .input(
    z.object({
      projectId: z.string(),
      startTimeFilter: z.array(timeFilter).optional(),
      observationType: z
        .union([z.enum(ObservationType), z.literal("ALL")])
        .default("GENERATION"),
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
      model,
      name,
      promptNames,
      traceNames,
      tags,
      modelId,
      toolNames,
      calledToolNames,
    ] = await Promise.all([
      // numeric scores
      getNumericScoresGroupedByName(input.projectId, traceTimestampFilters),
      // categorical scores
      getCategoricalScoresGroupedByName(input.projectId, traceTimestampFilters),
      //model
      getObservationsGroupedByModel(input.projectId, startTimeFilter ?? []),
      //name
      getObservationsGroupedByName(
        input.projectId,
        startTimeFilter ?? [],
        input.observationType === "ALL" ? null : input.observationType,
      ),
      //prompt name
      getObservationsGroupedByPromptName(
        input.projectId,
        startTimeFilter ?? [],
      ),
      //trace name
      getClickhouseTraceName(),
      // trace tags
      getClickhouseTraceTags(),
      // modelId
      getObservationsGroupedByModelId(input.projectId, startTimeFilter ?? []),
      // available tool names (from tool_definitions)
      getObservationsGroupedByToolName(input.projectId, startTimeFilter ?? []),
      // called tool names (from tool_call_names)
      getObservationsGroupedByCalledToolName(
        input.projectId,
        startTimeFilter ?? [],
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
      toolNames: toolNames
        .filter((i) => i.toolName !== null)
        .map((i) => ({
          value: i.toolName as string,
        })),
      calledToolNames: calledToolNames
        .filter((i) => i.calledToolName !== null)
        .map((i) => ({
          value: i.calledToolName as string,
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
