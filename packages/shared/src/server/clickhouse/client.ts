import { createClient, DataFormat } from "@clickhouse/client";
import { env } from "../../env";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";
import { getCurrentSpan } from "../instrumentation";
import { propagation, context } from "@opentelemetry/api";
import { logger } from "../logger";

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

  const cloudOptions: Record<string, unknown> = {};
  if (
    ["STAGING", "EU", "US"].includes(
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? "",
    )
  ) {
    cloudOptions.input_format_json_throw_on_bad_escape_sequence = 0;
  }

  return createClient({
    ...params.opts,
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
    database: env.CLICKHOUSE_DB,
    http_headers: headers,
    clickhouse_settings: {
      ...cloudOptions,
      ...(params.opts?.clickhouse_settings ?? {}),
      log_comment: JSON.stringify(params.tags ?? {}),
      async_insert: 1,
      wait_for_async_insert: 1, // if disabled, we won't get errors from clickhouse
    },
  });
};

/**
 * Creates a ClickHouse client for the secondary instance if configured
 */
export const clickhouseSecondaryClient = (
  params: {
    tags?: Record<string, string>;
    opts?: NodeClickHouseClientConfigOptions;
  } = {},
) => {
  // Only create if secondary is enabled and URL is configured
  if (
    env.CLICKHOUSE_SECONDARY_ENABLED !== "true" ||
    !env.CLICKHOUSE_SECONDARY_URL
  ) {
    return null;
  }

  const headers = params.opts?.http_headers ?? {};
  const activeSpan = getCurrentSpan();
  if (activeSpan) {
    propagation.inject(context.active(), headers);
  }

  const cloudOptions: Record<string, unknown> = {};
  if (
    ["STAGING", "EU", "US"].includes(
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? "",
    )
  ) {
    cloudOptions.input_format_json_throw_on_bad_escape_sequence = 0;
  }

  return createClient({
    ...params.opts,
    url: env.CLICKHOUSE_SECONDARY_URL,
    username: env.CLICKHOUSE_SECONDARY_USER || env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_SECONDARY_PASSWORD || env.CLICKHOUSE_PASSWORD,
    database: env.CLICKHOUSE_SECONDARY_DB || env.CLICKHOUSE_DB,
    http_headers: headers,
    clickhouse_settings: {
      ...cloudOptions,
      ...(params.opts?.clickhouse_settings ?? {}),
      log_comment: JSON.stringify({ ...params.tags, secondary: true } ?? {}),
      async_insert: 1,
      wait_for_async_insert: 1,
    },
  });
};

/**
 * Performs dual write to both primary and secondary ClickHouse instances
 * Always writes to primary instance, optionally writes to secondary if configured
 */
export const dualClickhouseWrite = async <T>(params: {
  table: string;
  values: unknown[];
  format: DataFormat | undefined;
  tags?: Record<string, string>;
  opts?: NodeClickHouseClientConfigOptions;
}) => {
  // Primary write (always performed)
  const primaryClient = clickhouseClient({
    tags: params.tags,
    opts: params.opts,
  });

  const primaryResult = await primaryClient.insert({
    table: params.table,
    values: params.values,
    format: params.format,
  });

  // Secondary write (only if enabled)
  const secondaryClient = clickhouseSecondaryClient({
    tags: params.tags,
    opts: params.opts,
  });

  if (secondaryClient) {
    try {
      await secondaryClient.insert({
        table: params.table,
        values: params.values,
        format: params.format,
      });
      logger.debug(
        `Secondary ClickHouse write completed for table ${params.table}`,
      );
    } catch (err) {
      // Log error but don't propagate
      logger.error(
        `Secondary ClickHouse write failed for table ${params.table}: ${err}`,
      );
    }
  }

  return primaryResult;
};

/**
 * Accepts a JavaScript date and returns the DateTime in format YYYY-MM-DD HH:MM:SS
 */
export const convertDateToClickhouseDateTime = (date: Date): string => {
  // 2024-11-06T20:37:00.123Z -> 2024-11-06 21:37:00.123
  return date.toISOString().replace("T", " ").replace("Z", "");
};
