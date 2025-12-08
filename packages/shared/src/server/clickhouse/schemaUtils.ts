import { LangfuseNotFoundError } from "../../errors";
import { eventTypes } from "../ingestion/types";
import { ClickhouseTableName, ClickhouseTableNames } from "./schema";

export const isValidTableName = (
  tableName: string,
): tableName is ClickhouseTableName =>
  Object.keys(ClickhouseTableNames).includes(tableName);

export type IngestionEntityTypes =
  | "trace"
  | "observation"
  | "score"
  | "sdk_log"
  | "dataset_run_item";

export const getClickhouseEntityType = (
  eventType: string,
): IngestionEntityTypes => {
  switch (eventType) {
    case eventTypes.TRACE_CREATE:
      return "trace";
    case eventTypes.OBSERVATION_CREATE:
    case eventTypes.OBSERVATION_UPDATE:
    case eventTypes.EVENT_CREATE:
    case eventTypes.SPAN_CREATE:
    case eventTypes.SPAN_UPDATE:
    case eventTypes.GENERATION_CREATE:
    case eventTypes.GENERATION_UPDATE:
    case eventTypes.AGENT_CREATE:
    case eventTypes.TOOL_CREATE:
    case eventTypes.CHAIN_CREATE:
    case eventTypes.RETRIEVER_CREATE:
    case eventTypes.EVALUATOR_CREATE:
    case eventTypes.EMBEDDING_CREATE:
    case eventTypes.GUARDRAIL_CREATE:
      return "observation";
    case eventTypes.SCORE_CREATE:
      return "score";
    case eventTypes.DATASET_RUN_ITEM_CREATE:
    // Replay compatibility: s3-ingestion-event-replay.ts reconstructs event types from S3 paths containing entity types
    // eslint-disable-next-line no-fallthrough
    case "dataset_run_item-create":
      return "dataset_run_item";
    case eventTypes.SDK_LOG:
      return "sdk_log";
    default:
      throw new LangfuseNotFoundError(`Unknown event type: ${eventType}`);
  }
};
