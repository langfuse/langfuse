import { clickhouseClient } from "../clickhouse/client";
import {
  TraceRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  convertTraceToTraceMt,
} from "../repositories/definitions";
import { env } from "../../env";

export const createTracesCh = async (trace: TraceRecordInsertType[]) => {
  if (
    env.LANGFUSE_EXPERIMENT_COMPARE_READ_FROM_AGGREGATING_MERGE_TREES === "true"
  ) {
    await clickhouseClient().insert({
      table: "traces_mt",
      format: "JSONEachRow",
      values: trace.map(convertTraceToTraceMt),
    });
  }
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
