import {
  clickhouseClient,
  type ObservationRecordInsertType,
  type TraceRecordInsertType,
} from "@langfuse/shared/src/server";

export const createTraces = async (trace: TraceRecordInsertType[]) => {
  return await clickhouseClient.insert({
    table: "traces",
    format: "JSONEachRow",
    values: trace,
  });
};

export const createObservation = async (
  observation: ObservationRecordInsertType,
) => {
  return await clickhouseClient.insert({
    table: "observations",
    format: "JSONEachRow",
    values: [observation],
  });
};

export const createObservations = async (
  observations: ObservationRecordInsertType[],
) => {
  return await clickhouseClient.insert({
    table: "observations",
    format: "JSONEachRow",
    values: observations,
  });
};
