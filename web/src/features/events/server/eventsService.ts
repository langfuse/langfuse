import { type z } from "zod/v4";
import {
  getObservationsCountFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
  getCategoricalScoresGroupedByName,
  getEventsGroupedByModel,
  getEventsGroupedByModelId,
  getEventsGroupedByName,
  getEventsGroupedByTraceName,
  getEventsGroupedByPromptName,
  getEventsGroupedByType,
  getEventsGroupedByUserId,
  getEventsGroupedByVersion,
  getEventsGroupedBySessionId,
  getEventsGroupedByLevel,
  getEventsGroupedByEnvironment,
  getEventsGroupedByExperimentDatasetId,
  getEventsGroupedByExperimentId,
  getEventsGroupedByExperimentName,
  getEventsGroupedByHasParentObservation,
  getNumericScoresGroupedByName,
  getTracesGroupedByTags,
  getObservationsBatchIOFromEventsTable,
} from "@langfuse/shared/src/server";
import { type timeFilter, type FilterState } from "@langfuse/shared";
import { type EventBatchIOOutput } from "@/src/features/events/server/eventsRouter";

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
  hasParentObservation?: boolean;
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
    offset: (params.page - 1) * params.limit, // Page is 1-indexed (page 1 = offset 0)
    selectIOAndMetadata: false, // Exclude I/O for performance - fetched separately via batchIO endpoint
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
  const { projectId, startTimeFilter, hasParentObservation } = params;

  // Build filter with optional hasParentObservation for scoping filter options
  const eventsFilter: FilterState = [
    ...(startTimeFilter ?? []),
    ...(hasParentObservation !== undefined
      ? [
          {
            column: "hasParentObservation" as const,
            type: "boolean" as const,
            operator: "=" as const,
            value: hasParentObservation,
          },
        ]
      : []),
  ];

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
    traceNames,
    modelId,
    types,
    userIds,
    versions,
    sessionIds,
    levels,
    environments,
    experimentDatasetIds,
    experimentIds,
    experimentNames,
    hasParentObservationResults,
  ] = await Promise.all([
    getNumericScoresGroupedByName(projectId, traceTimestampFilters),
    getCategoricalScoresGroupedByName(projectId, traceTimestampFilters),
    getEventsGroupedByModel(projectId, eventsFilter),
    getEventsGroupedByName(projectId, eventsFilter),
    getEventsGroupedByPromptName(projectId, eventsFilter),
    getClickhouseTraceTags(),
    getEventsGroupedByTraceName(projectId, eventsFilter),
    getEventsGroupedByModelId(projectId, eventsFilter),
    getEventsGroupedByType(projectId, eventsFilter),
    getEventsGroupedByUserId(projectId, eventsFilter),
    getEventsGroupedByVersion(projectId, eventsFilter),
    getEventsGroupedBySessionId(projectId, eventsFilter),
    getEventsGroupedByLevel(projectId, eventsFilter),
    getEventsGroupedByEnvironment(projectId, eventsFilter),
    getEventsGroupedByExperimentDatasetId(projectId, eventsFilter),
    getEventsGroupedByExperimentId(projectId, eventsFilter),
    getEventsGroupedByExperimentName(projectId, eventsFilter),
    getEventsGroupedByHasParentObservation(projectId, eventsFilter),
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
    traceName: traceNames
      .filter((i) => i.traceName !== null)
      .map((i) => ({
        value: i.traceName as string,
        count: i.count,
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
    experimentDatasetId: experimentDatasetIds
      .filter((i) => i.experimentDatasetId !== null)
      .map((i) => ({
        value: i.experimentDatasetId as string,
        count: i.count,
      })),
    experimentId: experimentIds
      .filter((i) => i.experimentId !== null)
      .map((i) => ({
        value: i.experimentId as string,
        count: i.count,
      })),
    experimentName: experimentNames
      .filter((i) => i.experimentName !== null)
      .map((i) => ({
        value: i.experimentName as string,
        count: i.count,
      })),
    hasParentObservation: hasParentObservationResults.map((i) => ({
      // ClickHouse returns UInt8 (0/1) for computed boolean; normalize to "true"/"false"
      value: i.hasParentObservation ? "true" : "false",
      count: i.count,
    })),
  };
}

interface GetEventBatchIOParams {
  projectId: string;
  observations: Array<{
    id: string;
    traceId: string;
  }>;
  minStartTime: Date;
  maxStartTime: Date;
  truncated?: boolean;
}

/**
 * Batch fetch input/output and metadata for multiple observations
 */
export async function getEventBatchIO(
  params: GetEventBatchIOParams,
): Promise<Array<EventBatchIOOutput>> {
  return getObservationsBatchIOFromEventsTable({
    projectId: params.projectId,
    observations: params.observations,
    minStartTime: params.minStartTime,
    maxStartTime: params.maxStartTime,
    truncated: params.truncated,
  });
}
