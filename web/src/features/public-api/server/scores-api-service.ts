import { randomUUID } from "crypto";

import {
  _handleGenerateScoresForPublicApi,
  _handleGetScoresCountForPublicApi,
  convertScoreToPublicApi,
  type ScoreQueryType,
} from "@/src/features/public-api/server/scores";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  InternalServerError,
  LISTABLE_SCORE_TYPES,
  type ScoreSourceType,
  type PostScoresBodyV1,
  scoresTableCols,
  type ScoreDataTypeType,
} from "@langfuse/shared";
import {
  _handleGetScoreById,
  eventTypes,
  processEventBatch,
  QueueJobs,
  ScoreDeleteQueue,
  type AuthHeaderValidVerificationResultIngestion,
  StringFilter,
  StringOptionsFilter,
  type FilterList,
  deriveFilters,
  convertApiProvidedFilterToClickhouseFilter,
  scoresTableUiColumnDefinitions,
} from "@langfuse/shared/src/server";
import type { z } from "zod";

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

function buildScoreFilters(
  props: ScoreQueryType,
  scoreDataTypes?: readonly ScoreDataTypeType[],
): { scoresFilter: FilterList; tracesFilter: FilterList } {
  const scoresFilter = deriveFilters(
    props,
    secureScoreFilterOptions,
    props.advancedFilters,
    scoresTableUiColumnDefinitions,
    scoresTableCols,
  );
  scoresFilter.push(
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: props.projectId,
    }),
  );

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
    props,
    secureTraceFilterOptions,
  );

  if (props.environment && tracesFilter.length() > 0) {
    const envValues = Array.isArray(props.environment)
      ? props.environment
      : [props.environment];
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
}

function determineTraceJoinRequirement(
  fields: string[] | null | undefined,
  tracesFilterLength: number,
) {
  const requestedFields = fields ?? ["score", "trace"];
  const includeTrace = requestedFields.includes("trace");
  const needsTraceJoin = includeTrace || tracesFilterLength > 0;
  return { includeTrace, needsTraceJoin };
}

export class ScoresApiService {
  constructor(private readonly apiVersion: "v1" | "v2") {}

  async createScore({
    body,
    auth,
    auditScope,
    scoreId = body.id ?? randomUUID(),
  }: {
    body: z.infer<typeof PostScoresBodyV1>;
    auth: AuthHeaderValidVerificationResultIngestion;
    auditScope?: { projectId: string; orgId: string; apiKeyId: string };
    scoreId?: string;
  }) {
    const existingScore = auditScope
      ? await _handleGetScoreById({
          projectId: auditScope.projectId,
          scoreId,
          scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
          scoreDataTypes:
            this.apiVersion === "v1" ? LISTABLE_SCORE_TYPES : undefined,
          preferredClickhouseService: "ReadOnly",
        })
      : undefined;

    const result = await processEventBatch(
      [
        {
          id: randomUUID(),
          type: eventTypes.SCORE_CREATE,
          timestamp: new Date().toISOString(),
          body: { ...body, id: scoreId },
        },
      ],
      auth,
    );

    if (
      auditScope &&
      result.errors.length === 0 &&
      result.successes.length === 1
    ) {
      await auditLog({
        action: existingScore ? "update" : "create",
        resourceType: "score",
        resourceId: scoreId,
        projectId: auditScope.projectId,
        orgId: auditScope.orgId,
        apiKeyId: auditScope.apiKeyId,
        before: existingScore
          ? convertScoreToPublicApi(existingScore)
          : undefined,
        after: { ...body, id: scoreId },
      });
    }

    return { id: scoreId, result };
  }

  async deleteScore({
    projectId,
    orgId,
    apiKeyId,
    scoreId,
  }: {
    projectId: string;
    orgId: string;
    apiKeyId: string;
    scoreId: string;
  }) {
    const scoreDeleteQueue = ScoreDeleteQueue.getInstance();
    if (!scoreDeleteQueue) {
      throw new InternalServerError("ScoreDeleteQueue not initialized");
    }

    await auditLog({
      action: "delete",
      resourceType: "score",
      resourceId: scoreId,
      projectId,
      orgId,
      apiKeyId,
    });

    await scoreDeleteQueue.add(QueueJobs.ScoreDelete, {
      timestamp: new Date(),
      id: randomUUID(),
      payload: {
        projectId,
        scoreIds: [scoreId],
      },
      name: QueueJobs.ScoreDelete,
    });

    return { message: "Score deletion queued successfully" };
  }

  /**
   * Get a specific score by ID
   * v1: Returns listable scores (NUMERIC, BOOLEAN, CATEGORICAL, TEXT) - excludes CORRECTION
   * v2: Returns all score types including CORRECTION and TEXT
   */
  async getScoreById({
    projectId,
    scoreId,
    source,
  }: {
    projectId: string;
    scoreId: string;
    source?: ScoreSourceType;
  }) {
    const score = await _handleGetScoreById({
      projectId,
      scoreId,
      source,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
      scoreDataTypes:
        this.apiVersion === "v1" ? LISTABLE_SCORE_TYPES : undefined,
      preferredClickhouseService: "ReadOnly",
    });

    if (!score) {
      return undefined;
    }

    return convertScoreToPublicApi(score);
  }

  /**
   * Get list of scores with version-aware filtering
   * v1: Returns listable scores (NUMERIC, BOOLEAN, CATEGORICAL, TEXT) - excludes CORRECTION
   * v2: Returns all score types including CORRECTION and TEXT
   */
  async generateScoresForPublicApi(props: ScoreQueryType) {
    const scoreDataTypes =
      this.apiVersion === "v1" ? LISTABLE_SCORE_TYPES : undefined;
    const { scoresFilter, tracesFilter } = buildScoreFilters(
      props,
      scoreDataTypes,
    );
    const { includeTrace, needsTraceJoin } = determineTraceJoinRequirement(
      props.fields,
      tracesFilter.length(),
    );
    const results = await _handleGenerateScoresForPublicApi({
      projectId: props.projectId,
      scoresFilter,
      tracesFilter,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
      includeTrace,
      needsTraceJoin,
      pagination: { limit: props.limit, page: props.page },
    });
    // Apply API-shape transformation (moves longStringValue→stringValue for
    // CORRECTION, strips longStringValue for others). Must happen here because
    // convertScoreToPublicApi is a web-layer concern that the shared repository
    // function deliberately does not call.
    return results.map(({ trace, ...rest }) => ({
      ...convertScoreToPublicApi(rest),
      trace,
    }));
  }

  /**
   * Get count of scores with version-aware filtering
   * v1: Only counts listable scores (NUMERIC, BOOLEAN, CATEGORICAL, TEXT) - excludes CORRECTION
   * v2: Counts all score types including CORRECTION and TEXT
   */
  async getScoresCountForPublicApi(props: ScoreQueryType) {
    const scoreDataTypes =
      this.apiVersion === "v1" ? LISTABLE_SCORE_TYPES : undefined;
    const { scoresFilter, tracesFilter } = buildScoreFilters(
      props,
      scoreDataTypes,
    );
    const { includeTrace, needsTraceJoin } = determineTraceJoinRequirement(
      props.fields,
      tracesFilter.length(),
    );
    return _handleGetScoresCountForPublicApi({
      projectId: props.projectId,
      scoresFilter,
      tracesFilter,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
      includeTrace,
      needsTraceJoin,
    });
  }
}
