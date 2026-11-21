// This structure is maintained to relate the frontend table definitions with the clickhouse table definitions.
// The frontend only sends the column names to the backend. This needs to be changed in the future to send column IDs.
// Column SQL is rendered from the events predicate lowerings (`eventsFieldSql`), so filters, ordering and the
// predicate read one definition per field.

import { UiColumnMappings } from "../../tableDefinitions/types";
import { eventsFieldSql } from "../repositories/events-predicate-fields";
import { tokenCountFilterClickhouseType } from "./tokenCountFilterType";

export const eventsTableNativeUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Environment",
    uiTableId: "environment",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("environment"),
  },
  {
    uiTableName: "API Key",
    uiTableId: "ingestionApiKey",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("ingestionApiKey"),
  },
  {
    uiTableName: "SDK Name",
    uiTableId: "ingestionSdkName",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("ingestionSdkName"),
  },
  {
    uiTableName: "SDK Version",
    uiTableId: "ingestionSdkVersion",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("ingestionSdkVersion"),
  },
  {
    uiTableName: "Ingestion Source",
    uiTableId: "ingestionSource",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("ingestionSource"),
  },
  {
    uiTableName: "Type",
    uiTableId: "type",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("type"),
  },
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("id"),
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("name"),
  },
  {
    uiTableName: "Trace ID",
    uiTableId: "traceId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("traceId"),
  },

  {
    uiTableName: "Start Time",
    uiTableId: "startTime",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("startTime"),
  },
  {
    uiTableName: "End Time",
    uiTableId: "endTime",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("endTime"),
  },
  {
    uiTableName: "Time To First Token (s)",
    uiTableId: "timeToFirstToken",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("timeToFirstToken"),
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Latency (s)",
    uiTableId: "latency",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("latency"),
    // If we use the default of Decimal64(12), we cannot filter for more than ~40min due to an overflow
    clickhouseTypeOverwrite: "Decimal64(3)",
  },
  {
    uiTableName: "Tokens per second",
    uiTableId: "tokensPerSecond",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("tokensPerSecond"),
  },
  {
    uiTableName: "Input Cost ($)",
    uiTableId: "inputCost",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("inputCost"),
  },
  {
    uiTableName: "Cached Input Cost ($)",
    uiTableId: "cachedInputCost",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("cachedInputCost"),
  },
  {
    uiTableName: "Output Cost ($)",
    uiTableId: "outputCost",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("outputCost"),
  },
  {
    uiTableName: "Total Cost ($)",
    uiTableId: "totalCost",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("totalCost"),
  },
  {
    uiTableName: "Status",
    uiTableId: "level",
    aliases: ["Level"],
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("level"),
  },
  {
    uiTableName: "Status Message",
    uiTableId: "statusMessage",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("statusMessage"),
  },
  {
    uiTableName: "Model",
    uiTableId: "model",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("providedModelName"),
  },
  {
    uiTableName: "Provided Model Name",
    uiTableId: "providedModelName",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("providedModelName"),
  },
  {
    uiTableName: "Model ID",
    uiTableId: "modelId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("modelId"),
  },
  {
    uiTableName: "Input Tokens",
    uiTableId: "inputTokens",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("inputTokens"),
    clickhouseTypeOverwrite: tokenCountFilterClickhouseType,
  },
  {
    uiTableName: "Cached Input Tokens",
    uiTableId: "cachedInputTokens",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("cachedInputTokens"),
    clickhouseTypeOverwrite: tokenCountFilterClickhouseType,
  },
  {
    uiTableName: "Output Tokens",
    uiTableId: "outputTokens",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("outputTokens"),
    clickhouseTypeOverwrite: tokenCountFilterClickhouseType,
  },
  {
    uiTableName: "Total Tokens",
    uiTableId: "totalTokens",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("totalTokens"),
    clickhouseTypeOverwrite: tokenCountFilterClickhouseType,
  },
  {
    uiTableName: "Tokens",
    uiTableId: "tokens",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("totalTokens"),
    clickhouseTypeOverwrite: tokenCountFilterClickhouseType,
  },
  {
    uiTableName: "Metadata",
    uiTableId: "metadata",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "metadata",
    queryPrefix: "e",
  },
  {
    uiTableName: "Evaluator ID",
    uiTableId: "evaluatorId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("evaluatorId"),
  },
  {
    uiTableName: "Rule ID",
    uiTableId: "ruleId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("ruleId"),
  },
  {
    uiTableName: "Version",
    uiTableId: "version",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("version"),
  },
  {
    uiTableName: "Release",
    uiTableId: "release",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("release"),
    emptyEqualsNull: true,
  },
  {
    uiTableName: "Prompt Name",
    uiTableId: "promptName",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("promptName"),
  },
  {
    uiTableName: "Prompt Version",
    uiTableId: "promptVersion",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("promptVersion"),
  },
  {
    uiTableName: "Input",
    uiTableId: "input",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("input"),
  },
  {
    uiTableName: "Output",
    uiTableId: "output",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("output"),
  },
  {
    uiTableName: "Session ID",
    uiTableId: "sessionId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("sessionId"),
  },
  {
    uiTableName: "Trace Name",
    uiTableId: "traceName",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("traceName"),
  },
  {
    uiTableName: "User ID",
    uiTableId: "userId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("userId"),
  },
  {
    uiTableName: "Trace Tags",
    uiTableId: "traceTags",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("traceTags"),
  },
  {
    uiTableName: "Tags",
    uiTableId: "tags",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("traceTags"),
  },
  {
    uiTableName: "Trace Environment",
    uiTableId: "traceEnvironment",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("environment"),
  },
  {
    uiTableName: "Has Parent Observation",
    uiTableId: "hasParentObservation",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("hasParentObservation"),
  },
  {
    uiTableName: "Is Root Observation",
    uiTableId: "isRootObservation",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("isRootObservation"),
  },
  {
    uiTableName: "Has Input",
    uiTableId: "hasInput",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("hasInput"),
  },
  {
    uiTableName: "Has Output",
    uiTableId: "hasOutput",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("hasOutput"),
  },
  {
    uiTableName: "Parent Observation ID",
    uiTableId: "parentObservationId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("parentObservationId"),
    emptyEqualsNull: true,
  },
  {
    uiTableName: "Experiment Dataset ID",
    uiTableId: "experimentDatasetId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("experimentDatasetId"),
  },
  {
    uiTableName: "Experiment ID",
    uiTableId: "experimentId",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("experimentId"),
    emptyEqualsNull: true,
  },
  {
    uiTableName: "Experiment Name",
    uiTableId: "experimentName",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("experimentName"),
  },
  {
    uiTableName: "Is Experiment Item Root Span",
    uiTableId: "isExperimentItemRootSpan",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("isExperimentItemRootSpan"),
  },
  {
    uiTableName: "Available Tools",
    uiTableId: "toolDefinitions",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("toolDefinitions"),
  },
  {
    uiTableName: "Tool Calls",
    uiTableId: "toolCalls",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("toolCalls"),
  },
  {
    uiTableName: "Loaded Skill Names",
    uiTableId: "skillsNamesLoaded",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("skillsNamesLoaded"),
  },
  {
    uiTableName: "Loaded Skill Versions",
    uiTableId: "skillsVersionsLoaded",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("skillsVersionsLoaded"),
  },
  {
    uiTableName: "Loaded Skill Files",
    uiTableId: "skillFilesLoaded",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("skillFilesLoaded"),
  },
  {
    uiTableName: "Available Skill Names",
    uiTableId: "skillNamesAvailable",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("skillNamesAvailable"),
  },
  {
    uiTableName: "Available Skill Versions",
    uiTableId: "skillVersionsAvailable",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("skillVersionsAvailable"),
  },
  {
    uiTableName: "Skill Names",
    uiTableId: "skillNames",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("skillNames"),
  },
  {
    uiTableName: "Skill Versions",
    uiTableId: "skillVersions",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("skillVersions"),
  },
  {
    uiTableName: "Tool Names",
    uiTableId: "toolNames",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("toolNames"),
  },
  {
    uiTableName: "Called Tool Names",
    uiTableId: "calledToolNames",
    clickhouseTableName: "events_proto",
    clickhouseSelect: eventsFieldSql("calledToolNames"),
  },
];

/** Alias of the trace score aggregate join in the events row selection. */
export const TRACE_SCORES_JOIN_ALIAS = "ts";

export const eventsTableUiColumnDefinitions: UiColumnMappings = [
  ...eventsTableNativeUiColumnDefinitions,
  // Scores column duplicated to allow renaming column name. Will be removed once session storage cache is outdated
  // Column names are cached in user sessions - changing them breaks existing filters
  {
    uiTableName: "Scores",
    uiTableId: "scores",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.scores_avg",
  },
  {
    uiTableName: "Scores (numeric)",
    uiTableId: "scores_avg",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.scores_avg",
  },
  {
    uiTableName: "Scores (categorical)",
    uiTableId: "score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.score_categories",
  },
  {
    uiTableName: "Scores (boolean)",
    uiTableId: "score_booleans",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.score_booleans",
  },
  {
    uiTableName: "Trace Scores (numeric)",
    uiTableId: "trace_scores_avg",
    clickhouseTableName: "scores",
    clickhouseSelect: `${TRACE_SCORES_JOIN_ALIAS}.scores_avg`,
  },
  {
    uiTableName: "Trace Scores (categorical)",
    uiTableId: "trace_score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: `${TRACE_SCORES_JOIN_ALIAS}.score_categories`,
  },
  {
    uiTableName: "Trace Scores (boolean)",
    uiTableId: "trace_score_booleans",
    clickhouseTableName: "scores",
    clickhouseSelect: `${TRACE_SCORES_JOIN_ALIAS}.score_booleans`,
  },
  {
    uiTableName: "Comment Count",
    uiTableId: "commentCount",
    clickhouseTableName: "comments",
    clickhouseSelect: "", // handled by comment filter helpers
  },
  {
    uiTableName: "Comment Content",
    uiTableId: "commentContent",
    clickhouseTableName: "comments",
    clickhouseSelect: "", // handled by comment filter helpers
  },
];
