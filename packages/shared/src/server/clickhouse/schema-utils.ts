import { LangfuseNotFoundError } from "../../errors";
import { eventTypes } from "../ingestion/types";
import {
  ClickhouseTableName,
  ClickhouseTableNames,
  TraceClickhouseRecord,
  ObservationClickhouseRecord,
  ScoreClickhouseRecord,
  TraceClickhouseColumns,
  ObservationClickhouseColumns,
  ScoreClickhouseColumns,
  ClickhouseEntityType,
} from "./schema";

export const isValidTableName = (
  tableName: string
): tableName is ClickhouseTableName =>
  Object.keys(ClickhouseTableNames).includes(tableName);

export function isKeyOfTraceClickhouseRecord(
  key: string
): key is keyof TraceClickhouseRecord {
  const validKeys = TraceClickhouseColumns.map((column) => column.name);
  return validKeys.includes(key as keyof TraceClickhouseRecord);
}

export function isKeyOfObservationClickhouseRecord(
  key: string
): key is keyof ObservationClickhouseRecord {
  const validKeys = ObservationClickhouseColumns.map((column) => column.name);
  return validKeys.includes(key as keyof ObservationClickhouseRecord);
}

export function isKeyOfScoreClickhouseRecord(
  key: string
): key is keyof ScoreClickhouseRecord {
  const validKeys = ScoreClickhouseColumns.map((column) => column.name);
  return validKeys.includes(key as keyof ScoreClickhouseRecord);
}

export function isKeyOfClickhouseRecord(
  tableName: ClickhouseTableName,
  key: string
): key is
  | keyof TraceClickhouseRecord
  | keyof ObservationClickhouseRecord
  | keyof ScoreClickhouseRecord {
  switch (tableName) {
    case "traces":
      return isKeyOfTraceClickhouseRecord(key);
    case "observations":
      return isKeyOfObservationClickhouseRecord(key);
    case "scores":
      return isKeyOfScoreClickhouseRecord(key);
    default:
      throw new Error(`Unhandled table case: ${tableName}`);
  }
}

export const getClickhouseEntityType = (
  eventType: string
): ClickhouseEntityType | "sdk_log" => {
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
