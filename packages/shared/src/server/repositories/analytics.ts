import { env } from "../../env";
import { 
  queryClickhouse, 
  queryClickhouseStream, 
  commandClickhouse,
  parseClickhouseUTCDateTimeFormat
} from "./clickhouse";
import { 
  queryDoris, 
  queryDorisStream, 
  commandDoris,
  parseDorisUTCDateTimeFormat
} from "./doris";
import { logger } from "../logger";

/**
 * Analytics query interface - abstracts between ClickHouse and Doris
 */
export interface AnalyticsQueryOptions {
  query: string;
  params?: Record<string, unknown>;
  tags?: Record<string, string>;
}

/**
 * Query analytics backend (ClickHouse or Doris) based on configuration
 */
export async function queryAnalytics<T>(opts: AnalyticsQueryOptions): Promise<T[]> {
  const backend = env.LANGFUSE_ANALYTICS_BACKEND;
  
  switch (backend) {
    case "doris":
      return await queryDoris<T>(opts);
    case "clickhouse":
    default:
      return await queryClickhouse<T>(opts);
  }
}

/**
 * Stream query results from analytics backend
 */
export async function* queryAnalyticsStream<T>(opts: AnalyticsQueryOptions): AsyncGenerator<T> {
  const backend = env.LANGFUSE_ANALYTICS_BACKEND;
  
  switch (backend) {
    case "doris":
      yield* queryDorisStream<T>(opts);
      break;
    case "clickhouse":
    default:
      yield* queryClickhouseStream<T>(opts);
      break;
  }
}


/**
 * Parse date format from analytics backend
 */
export function parseAnalyticsDateTimeFormat(dateString: string): Date {
  const backend = env.LANGFUSE_ANALYTICS_BACKEND;
  
  switch (backend) {
    case "doris":
      return parseDorisUTCDateTimeFormat(dateString);
    case "clickhouse":
    default:
      return parseClickhouseUTCDateTimeFormat(dateString);
  }
}

/**
 * Convert Date to analytics backend DateTime format
 */
export function convertDateToAnalyticsDateTime(date: Date): string {
  const backend = env.LANGFUSE_ANALYTICS_BACKEND;
  
  switch (backend) {
    case "doris":
      // Doris stores data in Shanghai timezone (Asia/Shanghai)
      // Use proper timezone formatting instead of manual offset calculation
      return date.toLocaleString('sv-SE', { 
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      }).replace('T', ' ').replace(',', '.');
    case "clickhouse":
    default:
      // ClickHouse stores UTC time, use original UTC format
      return date.toISOString().replace('T', ' ').replace('Z', '');
  }
}


/**
 * Get the current analytics backend name
 */
export function getAnalyticsBackend(): string {
  return env.LANGFUSE_ANALYTICS_BACKEND || "clickhouse";
}

/**
 * Check if current backend is Doris
 */
export function isDorisBackend(): boolean {
  return getAnalyticsBackend() === "doris";
}

/**
 * Check if current backend is ClickHouse
 */ 
export function isClickHouseBackend(): boolean {
  return getAnalyticsBackend() === "clickhouse";
}