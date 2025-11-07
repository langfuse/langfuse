import { type z } from "zod/v4";
import {
  getObservationsCountFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
  getCategoricalScoresGroupedByName,
  getEventsGroupedByModel,
  getEventsGroupedByModelId,
  getEventsGroupedByName,
  getEventsGroupedByPromptName,
  getEventsGroupedByType,
  getEventsGroupedByUserId,
  getEventsGroupedByVersion,
  getEventsGroupedBySessionId,
  getEventsGroupedByLevel,
  getEventsGroupedByEnvironment,
  getNumericScoresGroupedByName,
  getTracesGroupedByTags,
} from "@langfuse/shared/src/server";
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
    renderingProps: { truncated: true, shouldJsonParse: false },
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
) {
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
    traceTags,
    modelId,
    types,
    userIds,
    versions,
    sessionIds,
    levels,
    environments,
  ] = await Promise.all([
    getNumericScoresGroupedByName(projectId, traceTimestampFilters),
    getCategoricalScoresGroupedByName(projectId, traceTimestampFilters),
    getEventsGroupedByModel(projectId, startTimeFilter ?? []),
    getEventsGroupedByName(projectId, startTimeFilter ?? []),
    getEventsGroupedByPromptName(projectId, startTimeFilter ?? []),
    getClickhouseTraceTags(),
    getEventsGroupedByModelId(projectId, startTimeFilter ?? []),
    getEventsGroupedByType(projectId, startTimeFilter ?? []),
    getEventsGroupedByUserId(projectId, startTimeFilter ?? []),
    getEventsGroupedByVersion(projectId, startTimeFilter ?? []),
    getEventsGroupedBySessionId(projectId, startTimeFilter ?? []),
    getEventsGroupedByLevel(projectId, startTimeFilter ?? []),
    getEventsGroupedByEnvironment(projectId, startTimeFilter ?? []),
  ]);

  return {
    providedModelName: providedModelName
      .filter((i) => i.model !== null)
      .map((i) => ({ value: i.model as string, count: i.count })),
    modelId: modelId
      .filter((i) => i.modelId !== null)
      .map((i) => ({
        value: i.modelId as string,
        count: i.count,
      })),
    name: name
      .filter((i) => i.name !== null)
      .map((i) => ({ value: i.name as string, count: i.count })),
    scores_avg: numericScoreNames.map((score) => score.name),
    score_categories: categoricalScoreNames,
    promptName: promptNames
      .filter((i) => i.promptName !== null)
      .map((i) => ({
        value: i.promptName as string,
        count: i.count,
      })),
    traceTags: traceTags
      .filter((i) => i.tag !== null)
      .map((i) => ({
        value: i.tag as string,
      })),
    type: types
      .filter((i) => i.type !== null)
      .map((i) => ({
        value: i.type as string,
        count: i.count,
      })),
    userId: userIds
      .filter((i) => i.userId !== null)
      .map((i) => ({
        value: i.userId as string,
        count: i.count,
      })),
    version: versions
      .filter((i) => i.version !== null)
      .map((i) => ({
        value: i.version as string,
        count: i.count,
      })),
    sessionId: sessionIds
      .filter((i) => i.sessionId !== null)
      .map((i) => ({
        value: i.sessionId as string,
        count: i.count,
      })),
    level: levels
      .filter((i) => i.level !== null)
      .map((i) => ({
        value: i.level as string,
        count: i.count,
      })),
    environment: environments
      .filter((i) => i.environment !== null)
      .map((i) => ({
        value: i.environment as string,
        count: i.count,
      })),
  };
}
