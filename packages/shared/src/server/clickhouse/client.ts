import { createClient } from "@clickhouse/client";
import { env } from "../../env";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";
import { getCurrentSpan } from "../instrumentation";
import { propagation, context } from "@opentelemetry/api";

export type ClickhouseClientType = ReturnType<typeof createClient>;

export const clickhouseClient = (
  params: {
    tags?: Record<string, string>;
    opts?: NodeClickHouseClientConfigOptions;
  } = {},
) => {
  const headers = params.opts?.http_headers ?? {};
  const activeSpan = getCurrentSpan();
  if (activeSpan) {
    propagation.inject(context.active(), headers);
  }

  let log_comment: string | null = null;
  if (params.tags && params.tags.length) {
    log_comment = JSON.stringify(params.tags);
  }

  return createClient({
    ...params.opts,
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
    database: env.CLICKHOUSE_DB,
    http_headers: headers,
    clickhouse_settings: {
      ...(log_comment ? { log_comment } : {}),
      async_insert: 1,
      wait_for_async_insert: 1, // if disabled, we won't get errors from clickhouse
    },
  });
};

/**
 * Accepts a JavaScript date and returns the DateTime in format YYYY-MM-DD HH:MM:SS
 */
export const convertDateToClickhouseDateTime = (date: Date): string => {
  // 2024-11-06T20:37:00.123Z -> 2024-11-06 21:37:00.123
  return date.toISOString().replace("T", " ").replace("Z", "");
};
