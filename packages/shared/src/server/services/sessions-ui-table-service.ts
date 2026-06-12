import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { OrderByState } from "../../interfaces/orderBy";
import { FilterState } from "../../types";
import {
  getSessionsTableCountGreptime,
  getSessionsTableGreptime,
  getSessionsWithMetricsGreptime,
  type SessionDataReturnType,
  type SessionWithMetricsReturnType,
} from "../repositories/greptime/sessionsUiTable";

/**
 * Sessions UI table service (04-read-path.md, P2). The legacy ClickHouse 5-CTE rollup is replaced by
 * the GreptimeDB read path in `repositories/greptime/sessionsUiTable.ts`; these public functions
 * delegate there with unchanged signatures/return shapes. `clickhouseConfigs` is retained for source
 * compatibility and ignored.
 */

export type { SessionDataReturnType, SessionWithMetricsReturnType };

export const getSessionsTableCount = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}): Promise<number> => {
  return getSessionsTableCountGreptime(props);
};

export const getSessionsTable = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}): Promise<SessionDataReturnType[]> => {
  return getSessionsTableGreptime(props);
};

export const getSessionsWithMetrics = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}): Promise<SessionWithMetricsReturnType[]> => {
  return getSessionsWithMetricsGreptime(props);
};
