import { type FilterList } from "../queries";
import {
  generateDailyMetrics as generateDailyMetricsGreptime,
  getDailyMetricsCount as getDailyMetricsCountGreptime,
} from "./greptime/daily-metrics";

/**
 * Daily-metrics public-API reads. The implementation reads the GreptimeDB projections
 * (04-read-path.md, P4); these delegates keep the original signatures (caller:
 * `web/src/features/public-api/server/dailyMetrics.ts`).
 */

export const generateDailyMetrics = (params: {
  projectId: string;
  filter: FilterList;
  pagination?: { limit: number; page: number };
}) => generateDailyMetricsGreptime(params);

export const getDailyMetricsCount = (params: {
  projectId: string;
  filter: FilterList;
}) => getDailyMetricsCountGreptime(params);
