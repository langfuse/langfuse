import { clickhouseClient } from "../clickhouse/client";
import {
  TraceRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  DatasetRunItemRecordInsertType,
  convertTraceToTraceNull,
} from "../repositories/definitions";
import { env } from "../../env";

export const createTracesCh = async (trace: TraceRecordInsertType[]) => {
  if (env.LANGFUSE_EXPERIMENT_INSERT_INTO_AGGREGATING_MERGE_TREES === "true") {
    await clickhouseClient().insert({
      table: "traces_null",
      format: "JSONEachRow",
      values: trace.map(convertTraceToTraceNull),
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

export const createDatasetRunItemsCh = async (
  datasetRunItems: DatasetRunItemRecordInsertType[],
) => {
  return await clickhouseClient().insert({
    table: "dataset_run_items_rmt",
    format: "JSONEachRow",
    values: datasetRunItems,
  });
};
