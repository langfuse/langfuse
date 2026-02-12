import {
  convertApiProvidedFilterToClickhouseFilter,
  deriveFilters,
  convertClickhouseScoreToDomain,
  StringFilter,
  StringOptionsFilter,
  type ScoreRecordReadType,
  queryClickhouse,
  measureAndReturn,
  scoresTableUiColumnDefinitions,
} from "@langfuse/shared/src/server";
import {
  removeObjectKeys,
  ScoreDataTypeEnum,
  type ScoreDataTypeType,
  type ScoreDomain,
  type FilterState,
} from "@langfuse/shared";

/**
 * Converts a ScoreDomain object to API format.
 * For CORRECTION scores, moves longStringValue to stringValue for API compatibility.
 * For other score types, removes longStringValue.
 */
export const convertScoreToPublicApi = <T extends ScoreDomain>(
  score: T,
): Omit<T, "longStringValue"> & { stringValue?: string | null } => {
  if (score.dataType === ScoreDataTypeEnum.CORRECTION) {
    const { longStringValue, ...rest } = score;
    return {
      ...rest,
      stringValue: longStringValue,
    };
  }

  return removeObjectKeys(score, ["longStringValue"]);
};

export type ScoreQueryType = {
  page: number;
  limit: number;
  projectId: string;
  traceId?: string;
  userId?: string;
  name?: string;
  source?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  value?: number;
  scoreId?: string;
  configId?: string;
  sessionId?: string;
  datasetRunId?: string;
  queueId?: string;
  traceTags?: string | string[];
  operator?: string;
  scoreIds?: string[];
  observationId?: string[];
  dataType?: string;
  environment?: string | string[];
  fields?: string[] | null;
  advancedFilters?: FilterState;
};

/**
 * @internal
 * Internal utility function for getting scores by ID.
 * Do not use directly - use ScoresApiService or repository functions instead.
 */
export const _handleGenerateScoresForPublicApi = async ({
  props,
  scoreScope,
  scoreDataTypes,
}: {
  props: ScoreQueryType;
  scoreScope: "traces_only" | "all";
  scoreDataTypes?: readonly ScoreDataTypeType[];
}) => {
  const { scoresFilter, tracesFilter } = generateScoreFilter(
    props,
    scoreDataTypes,
  );
  const appliedScoresFilter = scoresFilter.apply();
  const appliedTracesFilter = tracesFilter.apply();

  // Determine if trace should be included based on fields parameter
  const { includeTrace, needsTraceJoin } = determineTraceJoinRequirement(
    props.fields,
    tracesFilter.length(),
  );

  const query = `
      SELECT
          ${needsTraceJoin ? "t.user_id as user_id, t.tags as tags, t.environment as trace_environment," : ""}
          s.id as id,
          s.project_id as project_id,
          s.timestamp as timestamp,
          s.environment as environment,
          s.name as name,
          s.value as value,
          s.string_value as string_value,
          s.long_string_value as long_string_value,
          s.author_user_id as author_user_id,
          s.created_at as created_at,
          s.updated_at as updated_at,
          s.source as source,
          s.comment as comment,
          s.metadata as metadata,
          s.data_type as data_type,
          s.config_id as config_id,
          s.queue_id as queue_id,
          s.trace_id as trace_id,
          s.observation_id as observation_id,
          s.session_id as session_id,
          s.dataset_run_id as dataset_run_id
      FROM
          scores s
          ${needsTraceJoin ? "LEFT JOIN __TRACE_TABLE__ t ON s.trace_id = t.id AND s.project_id = t.project_id" : ""}
      WHERE
          s.project_id = {projectId: String}
          AND (
            ${scoreScope === "traces_only" ? "" : "s.trace_id IS NULL OR "}
            (s.trace_id IS NOT NULL AND (${needsTraceJoin ? "t.id, t.project_id" : "s.trace_id, s.project_id"}) IN (
              SELECT
                ${needsTraceJoin ? "trace_id, project_id" : "s.trace_id, s.project_id"}
              FROM
                scores s
              WHERE
                s.project_id = {projectId: String}
                ${appliedScoresFilter.query ? `AND ${appliedScoresFilter.query}` : ""}
                ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
              ORDER BY
                s.timestamp desc
              LIMIT
                1 BY s.id, s.project_id
                ))
          )
          ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
          ${appliedScoresFilter.query ? `AND ${appliedScoresFilter.query}` : ""}
          ${tracesFilter.length() > 0 ? `AND ${appliedTracesFilter.query}` : ""}
      ORDER BY
          s.timestamp desc, s.event_ts desc
      LIMIT
          1 BY s.id, s.project_id
      ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
      `;

  return measureAndReturn({
    operationName: "_handleGenerateScoresForPublicApi",
    projectId: props.projectId,
    input: {
      params: {
        ...appliedScoresFilter.params,
        ...appliedTracesFilter.params,
        projectId: props.projectId,
        ...(props.limit !== undefined ? { limit: props.limit } : {}),
        ...(props.page !== undefined
          ? { offset: (props.page - 1) * props.limit }
          : {}),
      },
      tags: {
        feature: "scoring",
        type: "score",
        projectId: props.projectId,
        scoreScope,
        operation_name: "_handleGenerateScoresForPublicApi",
        includeTrace: includeTrace.toString(),
      },
    },
    fn: async (input) => {
      const records = await queryClickhouse<
        ScoreRecordReadType & {
          tags?: string[];
          user_id?: string;
          trace_environment?: string;
        }
      >({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });

      return records.map((record) => {
        const domainScore = convertClickhouseScoreToDomain(record);
        const apiScore = convertScoreToPublicApi(domainScore);
        return {
          ...apiScore,
          trace:
            includeTrace && record.trace_id !== null
              ? {
                  userId: record.user_id,
                  tags: record.tags,
                  environment: record.trace_environment,
                }
              : null,
        };
      });
    },
  });
};

/**
 * @internal
 * Internal utility function for getting scores by ID.
 * Do not use directly - use ScoresApiService or repository functions instead.
 */
export const _handleGetScoresCountForPublicApi = async ({
  props,
  scoreScope,
  scoreDataTypes,
}: {
  props: ScoreQueryType;
  scoreScope: "traces_only" | "all";
  scoreDataTypes?: readonly ScoreDataTypeType[];
}) => {
  const { scoresFilter, tracesFilter } = generateScoreFilter(
    props,
    scoreDataTypes,
  );
  const appliedScoresFilter = scoresFilter.apply();
  const appliedTracesFilter = tracesFilter.apply();

  // Determine if trace should be included based on fields parameter
  const { includeTrace, needsTraceJoin } = determineTraceJoinRequirement(
    props.fields,
    tracesFilter.length(),
  );

  const query = `
      SELECT
        count() as count
      FROM
        scores s
          ${needsTraceJoin ? "LEFT JOIN __TRACE_TABLE__ t ON s.trace_id = t.id AND s.project_id = t.project_id" : ""}
      WHERE
        s.project_id = {projectId: String}
      AND (
        ${scoreScope === "traces_only" ? "" : "s.trace_id IS NULL OR "}
        (s.trace_id IS NOT NULL AND (${needsTraceJoin ? "t.id, t.project_id" : "s.trace_id, s.project_id"}) IN (
          SELECT
            ${needsTraceJoin ? "trace_id, project_id" : "s.trace_id, s.project_id"}
          FROM
            scores s
          WHERE
            s.project_id = {projectId: String}
            ${appliedScoresFilter.query ? `AND ${appliedScoresFilter.query}` : ""}
            ${scoreScope === "traces_only" ? "AND s.session_id IS NULL" : ""}
          ORDER BY
            s.timestamp desc
          LIMIT
            1 BY s.id, s.project_id
        ))
      )
      ${appliedScoresFilter.query ? `AND ${appliedScoresFilter.query}` : ""}
      ${tracesFilter.length() > 0 ? `AND ${appliedTracesFilter.query}` : ""}
      `;

  return measureAndReturn({
    operationName: "_handleGetScoresCountForPublicApi",
    projectId: props.projectId,
    input: {
      params: {
        ...appliedScoresFilter.params,
        ...appliedTracesFilter.params,
        projectId: props.projectId,
      },
      tags: {
        feature: "scoring",
        type: "score",
        projectId: props.projectId,
        scoreScope,
        operation_name: "_handleGetScoresCountForPublicApi",
        includeTrace: includeTrace.toString(),
      },
    },
    fn: async (input) => {
      const records = await queryClickhouse<{ count: string }>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });
      return records.map((record) => Number(record.count)).shift();
    },
  });
};

const secureScoreFilterOptions = [
  {
    id: "traceId",
    clickhouseSelect: "trace_id",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "observationId",
    clickhouseSelect: "observation_id",
    clickhouseTable: "scores",
    filterType: "StringOptionsFilter",
    clickhousePrefix: "s",
  },
  {
    id: "name",
    clickhouseSelect: "name",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "source",
    clickhouseSelect: "source",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "fromTimestamp",
    clickhouseSelect: "timestamp",
    operator: ">=" as const,
    clickhouseTable: "scores",
    filterType: "DateTimeFilter",
    clickhousePrefix: "s",
  },
  {
    id: "toTimestamp",
    clickhouseSelect: "timestamp",
    operator: "<" as const,
    clickhouseTable: "scores",
    filterType: "DateTimeFilter",
    clickhousePrefix: "s",
  },
  {
    id: "value",
    clickhouseSelect: "value",
    clickhouseTable: "scores",
    filterType: "NumberFilter",
    clickhousePrefix: "s",
  },
  {
    id: "scoreIds",
    clickhouseSelect: "id",
    clickhouseTable: "scores",
    filterType: "StringOptionsFilter",
    clickhousePrefix: "s",
  },
  {
    id: "configId",
    clickhouseSelect: "config_id",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "sessionId",
    clickhouseSelect: "session_id",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "datasetRunId",
    clickhouseSelect: "dataset_run_id",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "queueId",
    clickhouseSelect: "queue_id",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
  {
    id: "environment",
    clickhouseSelect: "environment",
    clickhouseTable: "scores",
    filterType: "StringOptionsFilter",
    clickhousePrefix: "s",
  },
  {
    id: "dataType",
    clickhouseSelect: "data_type",
    clickhouseTable: "scores",
    filterType: "StringFilter",
    clickhousePrefix: "s",
  },
];

const secureTraceFilterOptions = [
  {
    id: "traceTags",
    clickhouseSelect: "tags",
    clickhouseTable: "traces",
    filterType: "ArrayOptionsFilter",
    clickhousePrefix: "t",
  },
  {
    id: "userId",
    clickhouseSelect: "user_id",
    clickhouseTable: "traces",
    filterType: "StringFilter",
    clickhousePrefix: "t",
  },
];

/**
 * Determines if trace join is needed based on fields parameter and trace filters
 */
const determineTraceJoinRequirement = (
  fields: string[] | null | undefined,
  tracesFilterLength: number,
) => {
  const requestedFields = fields ?? ["score", "trace"]; // Default includes both
  const includeTrace = requestedFields.includes("trace");
  const needsTraceJoin = includeTrace || tracesFilterLength > 0;

  return { includeTrace, needsTraceJoin };
};

const generateScoreFilter = (
  filter: ScoreQueryType,
  scoreDataTypes?: readonly ScoreDataTypeType[],
) => {
  const scoresFilter = deriveFilters(
    filter,
    secureScoreFilterOptions,
    filter.advancedFilters,
    scoresTableUiColumnDefinitions,
  );
  scoresFilter.push(
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: filter.projectId,
    }),
  );

  // Add version-based dataType restriction if provided
  // This will AND with any user-provided dataType filter for proper intersection
  if (scoreDataTypes) {
    scoresFilter.push(
      new StringOptionsFilter({
        clickhouseTable: "scores",
        field: "data_type",
        operator: "any of",
        values: [...scoreDataTypes],
        tablePrefix: "s",
      }),
    );
  }

  const tracesFilter = convertApiProvidedFilterToClickhouseFilter(
    filter,
    secureTraceFilterOptions,
  );

  // If environment is specified AND there are other trace filters (userId, traceTags),
  // also apply the environment filter to traces. This ensures that when filtering by
  // trace properties, the trace's environment matches the requested environment.
  // Without other trace filters, we only filter by the score's own environment,
  // which allows session scores (that have no trace) to be returned correctly.
  if (filter.environment && tracesFilter.length() > 0) {
    const envValues = Array.isArray(filter.environment)
      ? filter.environment
      : [filter.environment];
    tracesFilter.push(
      new StringOptionsFilter({
        clickhouseTable: "traces",
        field: "environment",
        operator: "any of",
        values: envValues,
        tablePrefix: "t",
      }),
    );
  }

  return { scoresFilter, tracesFilter };
};
