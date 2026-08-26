/**
 * Physical ClickHouse relations the Kysely spike compiles against.
 * Column sets are the ones the catalog / environments queries actually
 * reference — not a full schema dump.
 */
export type ClickHouseDatabase = {
  traces: {
    environment: string;
    project_id: string;
    timestamp: Date;
    id: string;
  };
  observations: {
    environment: string;
    project_id: string;
    start_time: Date;
    trace_id: string;
    cost_details: Record<string, number>;
    usage_details: Record<string, number>;
  };
  events_core: {
    environment: string;
    project_id: string;
    start_time: Date;
    span_id: string;
    trace_id: string;
    event_ts: Date;
    type: string;
  };
  scores: {
    environment: string;
    project_id: string;
    timestamp: Date;
    data_type: string;
  };
};

export const TENANTED_TABLES = new Set<string>([
  "traces",
  "observations",
  "events_core",
  "events",
  "events_full",
  "scores",
]);
