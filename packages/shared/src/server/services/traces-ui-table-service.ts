import { OrderByState } from "../../interfaces/orderBy";
import { FilterState } from "../../types";
import { TraceRecordReadType } from "../repositories/definitions";
import Decimal from "decimal.js";
import { ScoreAggregate } from "../../features/scores";
import { TracingSearchType } from "../../interfaces/search";
import { ObservationLevelType, TraceDomain } from "../../domain";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import {
  getTracesTableCountGreptime,
  getTracesTableGreptime,
  getTracesTableMetricsGreptime,
  getTraceIdentifiersGreptime,
} from "../repositories/greptime/tracesUiTable";

/**
 * Traces UI table service (04-read-path.md, P2). The legacy ClickHouse rollup (FINAL +
 * `sumMap`/`countIf`/`multiIf` CTEs) is replaced by the GreptimeDB read path in
 * `repositories/greptime/tracesUiTable.ts`; these public functions delegate there. Signatures and
 * return shapes are unchanged so callers (web tRPC, worker export stream) are untouched. The
 * `clickhouseConfigs` parameter is retained for source compatibility and ignored.
 */

export type TracesTableReturnType = Pick<
  TraceRecordReadType,
  | "project_id"
  | "id"
  | "name"
  | "timestamp"
  | "bookmarked"
  | "release"
  | "version"
  | "user_id"
  | "session_id"
  | "environment"
  | "tags"
  | "public"
>;

export type TracesTableUiReturnType = Pick<
  TraceDomain,
  | "id"
  | "projectId"
  | "timestamp"
  | "tags"
  | "bookmarked"
  | "name"
  | "release"
  | "version"
  | "userId"
  | "environment"
  | "sessionId"
  | "public"
>;

export type TracesMetricsUiReturnType = {
  id: string;
  projectId: string;
  promptTokens: bigint;
  completionTokens: bigint;
  totalTokens: bigint;
  latency: number | null;
  level: ObservationLevelType;
  observationCount: bigint;
  calculatedTotalCost: Decimal | null;
  calculatedInputCost: Decimal | null;
  calculatedOutputCost: Decimal | null;
  scores: ScoreAggregate;
  usageDetails: Record<string, number>;
  costDetails: Record<string, number>;
  errorCount: bigint;
  warningCount: bigint;
  defaultCount: bigint;
  debugCount: bigint;
};

export const getTracesTableCount = async (props: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  searchType: TracingSearchType[];
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}): Promise<number> => {
  return getTracesTableCountGreptime(props);
};

export const getTracesTableMetrics = async (props: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}): Promise<Array<Omit<TracesMetricsUiReturnType, "scores">>> => {
  return getTracesTableMetricsGreptime(props);
};

export const getTracesTable = async (p: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}): Promise<TracesTableUiReturnType[]> => {
  return getTracesTableGreptime(p);
};

export const getTraceIdentifiers = async (props: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}): Promise<Array<{ id: string; projectId: string; timestamp: Date }>> => {
  return getTraceIdentifiersGreptime(props);
};
