import {
  ClickhouseTableName,
  ClickhouseTableNames,
  TraceClickhouseRecord,
  ObservationClickhouseRecord,
  ScoreClickhouseRecord,
  TraceClickhouseColumns,
  ObservationClickhouseColumns,
  ScoreClickhouseColumns,
} from "./schema";

export const isValidTableName = (
  tableName: string
): tableName is ClickhouseTableName =>
  Object.keys(ClickhouseTableNames).includes(tableName);

export type ClickhouseTables = {
  traces: keyof TraceClickhouseRecord;
  observations: keyof ObservationClickhouseRecord;
  scores: keyof ScoreClickhouseRecord;
};

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
