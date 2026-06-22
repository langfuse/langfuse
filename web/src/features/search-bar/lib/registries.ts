import type { ColumnDefinition } from "@langfuse/shared";

import {
  createFieldRegistryFromColumns,
  type FieldRegistry,
  type ScorePathDef,
} from "./fields";

const FILTER_ONLY = { enabled: false } as const;

const sessionScorePaths: ScorePathDef[] = [
  {
    prefixes: ["scores.", "score."],
    canonicalPrefix: "scores.",
    level: "observation",
    columns: { numeric: "scores_avg", categorical: "score_categories" },
    description:
      "score by name, e.g. scores.accuracy:>0.8 or scores.feedback:positive",
  },
];

const experimentScorePaths: ScorePathDef[] = [
  {
    prefixes: ["scores.", "score."],
    canonicalPrefix: "scores.",
    level: "observation",
    columns: { numeric: "obs_scores_avg", categorical: "obs_score_categories" },
    description:
      "observation score by name, e.g. scores.accuracy:>0.8 or scores.feedback:positive",
  },
  {
    prefixes: ["tracescores.", "trace_scores.", "tracescore."],
    canonicalPrefix: "traceScores.",
    level: "trace",
    columns: {
      numeric: "trace_scores_avg",
      categorical: "trace_score_categories",
    },
    description: "trace-level score by name, e.g. traceScores.nps:>8",
  },
];

export function createSessionsSearchBarRegistry(
  columns: readonly ColumnDefinition[],
): FieldRegistry {
  return createFieldRegistryFromColumns("sessions", columns, {
    aliases: {
      id: ["session", "sessionid", "session_id"],
      userIds: ["user", "userid", "user_id", "users"],
      environment: ["env"],
      sessionDuration: ["duration"],
      countTraces: ["traces", "trace_count"],
      tags: ["tag", "traceTags", "trace_tags"],
      inputTokens: ["input_tokens"],
      outputTokens: ["output_tokens"],
      totalTokens: ["tokens", "total_tokens"],
      inputCost: ["input_cost"],
      outputCost: ["output_cost"],
      totalCost: ["cost", "total_cost"],
      commentCount: ["comment_count"],
      commentContent: ["comment", "comment_content"],
    },
    scorePaths: sessionScorePaths,
    suggestionFieldIds: ["environment", "id", "userIds", "tags"],
    freeText: FILTER_ONLY,
  });
}

export function createScoresSearchBarRegistry(
  columns: readonly ColumnDefinition[],
): FieldRegistry {
  return createFieldRegistryFromColumns("scores", columns, {
    aliases: {
      traceId: ["trace", "traceid", "trace_id"],
      sessionId: ["session", "sessionid", "session_id"],
      observationId: ["observation", "observationid", "observation_id"],
      environment: ["env"],
      dataType: ["type", "data_type"],
      stringValue: ["category", "categorical_value", "string_value"],
      userId: ["user", "userid", "user_id"],
      tags: ["tag", "traceTags", "trace_tags"],
    },
    suggestionFieldIds: ["environment", "name", "source", "dataType"],
    freeText: FILTER_ONLY,
  });
}

export function createExperimentsSearchBarRegistry(
  columns: readonly ColumnDefinition[],
): FieldRegistry {
  return createFieldRegistryFromColumns("experiments", columns, {
    aliases: {
      id: ["experiment", "experimentid", "experiment_id"],
      experimentDatasetId: ["dataset", "datasetid", "dataset_id"],
      startTime: ["start", "starttime", "start_time"],
      itemCount: ["items", "item_count"],
      totalCost: ["cost", "total_cost"],
      latencyAvg: ["latency", "latency_avg"],
      errorCount: ["errors", "error_count"],
    },
    scorePaths: experimentScorePaths,
    suggestionFieldIds: ["name", "experimentDatasetId"],
    freeText: FILTER_ONLY,
  });
}

export function createEvaluatorsSearchBarRegistry(
  columns: readonly ColumnDefinition[],
): FieldRegistry {
  return createFieldRegistryFromColumns("evaluators", columns, {
    aliases: {
      updatedAt: ["updated", "updated_at"],
      createdAt: ["created", "created_at"],
    },
    suggestionFieldIds: ["status", "target"],
    freeText: FILTER_ONLY,
  });
}

export function createEvalLogsSearchBarRegistry(
  columns: readonly ColumnDefinition[],
): FieldRegistry {
  return createFieldRegistryFromColumns("evalLogs", columns, {
    aliases: {
      traceId: ["trace", "traceid", "trace_id"],
      executionTraceId: ["execution_trace_id", "executiontraceid"],
    },
    suggestionFieldIds: ["status", "traceId", "executionTraceId"],
    freeText: FILTER_ONLY,
  });
}

export function createMonitorsSearchBarRegistry(
  columns: readonly ColumnDefinition[],
): FieldRegistry {
  return createFieldRegistryFromColumns("monitors", columns, {
    aliases: {
      tags: ["tag"],
    },
    suggestionFieldIds: ["severity", "status", "tags"],
    freeText: FILTER_ONLY,
  });
}
