import { clickhouseClient } from "../clickhouse/client";
import { quoteDateTime64InsertRecords } from "../clickhouse/datetime";
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
    values: quoteDateTime64InsertRecords("traces", trace),
  });
};

export const createObservationsCh = async (
  observations: ObservationRecordInsertType[],
) => {
  return await clickhouseClient().insert({
    table: "observations",
    format: "JSONEachRow",
    values: quoteDateTime64InsertRecords("observations", observations),
  });
};

export const createEventsCh = async (events: EventRecordInsertType[]) => {
  return await clickhouseClient().insert({
    table: "events_full",
    format: "JSONEachRow",
    values: quoteDateTime64InsertRecords("events_full", events),
  });
};

export const createScoresCh = async (scores: ScoreRecordInsertType[]) => {
  return await clickhouseClient().insert({
    table: "scores",
    format: "JSONEachRow",
    values: quoteDateTime64InsertRecords("scores", scores),
  });
};

export const createDatasetRunItemsCh = async (
  datasetRunItems: DatasetRunItemRecordInsertType[],
) => {
  return await clickhouseClient().insert({
    table: "dataset_run_items_rmt",
    format: "JSONEachRow",
    values: quoteDateTime64InsertRecords(
      "dataset_run_items_rmt",
      datasetRunItems,
    ),
  });
};
