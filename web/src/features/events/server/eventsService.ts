import { type z } from "zod/v4";
import {
  getObservationsCountFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
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
import { type timeFilter } from "@langfuse/shared";

type TimeFilter = z.infer<typeof timeFilter>;

interface GetObservationsListParams {
  projectId: string;
  filter: any[];
  searchQuery?: string;
  searchType: any[];
  orderBy: any;
  page: number;
  limit: number;
}

interface GetObservationsCountParams {
  projectId: string;
  filter: any[];
  searchQuery?: string;
  searchType: any[];
  orderBy: any;
}

interface GetObservationsFilterOptionsParams {
  projectId: string;
  startTimeFilter?: TimeFilter[];
}

/**
 * Get paginated list of events
 */
export async function getEventList(params: GetObservationsListParams) {
  const queryOpts = {
    projectId: params.projectId,
    filter: params.filter,
    searchQuery: params.searchQuery,
    searchType: params.searchType,
    orderBy: params.orderBy,
    limit: params.limit,
    offset: params.page * params.limit,
    selectIOAndMetadata: true, // Include input/output truncated fields
  };

  const observations =
    await getObservationsWithModelDataFromEventsTable(queryOpts);

  return { observations };
}

/**
 * Get total count of events matching filters
 */
export async function getEventCount(params: GetObservationsCountParams) {
  const queryOpts = {
    projectId: params.projectId,
    filter: params.filter,
    searchQuery: params.searchQuery,
    searchType: params.searchType,
    orderBy: params.orderBy,
    limit: 1,
    offset: 0,
  };

  const totalCount = await getObservationsCountFromEventsTable(queryOpts);

  return { totalCount };
}

/**
 * Get all available filter options for events table
 */
export async function getEventFilterOptions(
  params: GetObservationsFilterOptionsParams,
): Promise<EventsTableOptions> {
  const { projectId, startTimeFilter } = params;

  // Map startTimeFilter to Timestamp column for trace queries
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
      projectId,
      tracesTableUiColumnDefinitions,
      traceTimestampFilters,
    );
    return traces.map((i) => ({ traceName: i.name }));
  };

  const getClickhouseTraceTags = async (): Promise<Array<{ tag: string }>> => {
    const traces = await getTracesGroupedByTags({
      projectId,
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
    getNumericScoresGroupedByName(projectId, traceTimestampFilters),
    // categorical scores
    getCategoricalScoresGroupedByName(projectId, traceTimestampFilters),
    // provided model name (maps to "model" in observations)
    getObservationsGroupedByModel(projectId, startTimeFilter ?? []),
    // observation name
    getObservationsGroupedByName(projectId, startTimeFilter ?? []),
    // prompt name
    getObservationsGroupedByPromptName(projectId, startTimeFilter ?? []),
    // trace name
    getClickhouseTraceName(),
    // trace tags
    getClickhouseTraceTags(),
    // modelId
    getObservationsGroupedByModelId(projectId, startTimeFilter ?? []),
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
}
