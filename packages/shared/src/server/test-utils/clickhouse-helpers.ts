import { clickhouseClient } from "../clickhouse/client";
import {
  TraceRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  DatasetRunItemRecordInsertType,
  EventRecordInsertType,
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

export const createEventsCh = async (events: EventRecordInsertType[]) => {
  return await clickhouseClient().insert({
    table: "events",
    format: "JSONEachRow",
    values: events,
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
