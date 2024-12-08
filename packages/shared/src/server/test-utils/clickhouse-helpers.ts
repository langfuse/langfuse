import { clickhouseClient } from "../clickhouse/client";
import {
  TraceRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
} from "../repositories/definitions";

export const createTracesCh = async (trace: TraceRecordInsertType[]) => {
  return await clickhouseClient().insert({
    table: "traces",
    format: "JSONEachRow",
    values: trace,
  });
};

export const createObservationsCh = async (
  observations: ObservationRecordInsertType[],
) => {
  return await clickhouseClient().insert({
    table: "observations",
    format: "JSONEachRow",
    values: observations,
  });
};

export const createScoresCh = async (scores: ScoreRecordInsertType[]) => {
  return await clickhouseClient().insert({
    table: "scores",
    format: "JSONEachRow",
    values: scores,
  });
};
