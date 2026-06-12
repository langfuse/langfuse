import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { OrderByState } from "../../interfaces/orderBy";
import { FilterState } from "../../types";
import { type SessionEventsMetricsRow } from "../queries";
import {
  getSessionsTableCountGreptime,
  getSessionsTableGreptime,
  getSessionsWithMetricsGreptime,
} from "../repositories/greptime/sessionsUiTable";
import { getTracesIdentifierForSessionFromTracesTable } from "../repositories/greptime/traces";

/**
 * Events (v4) sessions read path (04-read-path.md, P3). The `events_core`/`events_full` tables do
 * not exist on GreptimeDB; per the P0a inventory every events consumer reads merged current state,
 * so these `*FromEvents` variants collapse onto the same GreptimeDB projection read used by the
 * legacy path (`repositories/greptime/sessionsUiTable.ts`, P2). Signatures/return shapes are
 * preserved; the only adaptation is the session-row `environment` field, which the GreptimeDB read
 * exposes as `trace_environment`. `clickhouseConfigs` is retained for source compatibility and
 * ignored.
 */

type SessionEventsBaseReturnType = {
  session_id: string;
  max_timestamp: string;
  min_timestamp: string;
  trace_ids: string[];
  user_ids: string[];
  trace_count: number;
  trace_tags: string[];
  environment?: string;
};

type SessionScoreFields = {
  scores_avg?: Array<Array<[string, number]>>;
  score_categories?: Array<Array<string>>;
};

export type SessionEventsDataReturnType = SessionEventsBaseReturnType &
  SessionScoreFields;

export type SessionTraceFromEvents = {
  id: string;
  name: string | null;
  timestamp: Date;
  environment: string | null;
  userId: string | null;
};

export const getSessionTracesFromEvents = async (props: {
  projectId: string;
  sessionId: string;
}): Promise<SessionTraceFromEvents[]> => {
  const traces = await getTracesIdentifierForSessionFromTracesTable(
    props.projectId,
    props.sessionId,
  );
  return traces.map((t) => ({
    id: t.id,
    name: t.name,
    timestamp: t.timestamp,
    environment: t.environment,
    userId: t.userId,
  }));
};

export const getSessionsTableCountFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}): Promise<number> => {
  return getSessionsTableCountGreptime(props);
};

export const getSessionsTableFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}): Promise<SessionEventsDataReturnType[]> => {
  const rows = await getSessionsTableGreptime(props);
  return rows.map((row) => ({
    ...row,
    environment: row.trace_environment,
  }));
};

// Single-query equivalent of getSessionsTableFromEvents + getSessionMetricsFromEvents, mirroring the
// legacy getSessionsWithMetrics. Used by batch export so the metrics aggregation inherits the same
// filter (incl. the createdAt cutoff) as the row query in a single round-trip.
export const getSessionsWithMetricsFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}): Promise<SessionEventsMetricsRow[]> => {
  const rows = await getSessionsWithMetricsGreptime(props);
  return rows.map((row) => ({
    ...row,
    environment: row.trace_environment,
  }));
};
