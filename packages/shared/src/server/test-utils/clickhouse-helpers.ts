import { randomUUID } from "node:crypto";
import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
} from "../clickhouse/client";
import {
  AuditLogRecordInsertType,
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
    table: "events_full",
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

/**
 * Inserts `audit_logs` rows. Unset columns get the values of a user's change
 * event at the current time; pass `project_id` for project-level events.
 */
export const createAuditLogsCh = async (
  records: (Partial<AuditLogRecordInsertType> &
    Pick<AuditLogRecordInsertType, "org_id">)[],
): Promise<AuditLogRecordInsertType[]> => {
  const rows = records.map(
    (record): AuditLogRecordInsertType => ({
      id: randomUUID(),
      timestamp: convertDateToClickhouseDateTime(new Date()),
      project_id: "",
      event_kind: "change",
      outcome: "success",
      outcome_reason: "",
      actor_type: "USER",
      user_id: randomUUID(),
      api_key_id: "",
      actor_name: "",
      actor_email: "",
      user_org_role: "",
      user_project_role: "",
      support_access: false,
      resource_type: "prompt",
      resource_id: randomUUID(),
      resource_refs: [],
      action: "create",
      surface: "",
      route: "",
      params: "",
      result_count: 0,
      before: "",
      after: "",
      ip: "",
      user_agent: "",
      request_id: "",
      ...record,
    }),
  );
  await clickhouseClient().insert({
    table: "audit_logs",
    format: "JSONEachRow",
    values: rows,
  });
  return rows;
};
