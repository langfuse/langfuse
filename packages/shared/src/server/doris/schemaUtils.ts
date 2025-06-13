import { LangfuseNotFoundError } from "../../errors";
import { eventTypes } from "../ingestion/types";
import { DorisTableName, DorisTableNames } from "./schema";

export const isValidTableName = (
  tableName: string,
): tableName is DorisTableName =>
  Object.keys(DorisTableNames).includes(tableName);

export type IngestionEntityTypes =
  | "trace"
  | "observation"
  | "score"
  | "sdk_log";

export const getDorisEntityType = (
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
      return "observation";
    case eventTypes.SCORE_CREATE:
      return "score";
    case eventTypes.SDK_LOG:
      return "sdk_log";
    default:
      throw new LangfuseNotFoundError(`Unknown event type: ${eventType}`);
  }
};
