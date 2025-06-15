import { createClient } from "@clickhouse/client";
import { env } from "../../env";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";
import { getCurrentSpan } from "../instrumentation";
import { propagation, context } from "@opentelemetry/api";

export type ClickhouseClientType = ReturnType<typeof createClient>;

/**
 * ClickHouseClientManager provides a singleton pattern for managing ClickHouse clients.
 * It creates and reuses clients based on their configuration to avoid creating
 * a new connection for each query.
 */
export class ClickHouseClientManager {
  private static instance: ClickHouseClientManager;
  private clientMap: Map<string, ClickhouseClientType> = new Map();

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance of the ClickHouseClientManager
   */
  public static getInstance(): ClickHouseClientManager {
    if (!ClickHouseClientManager.instance) {
      ClickHouseClientManager.instance = new ClickHouseClientManager();
    }
    return ClickHouseClientManager.instance;
  }

  /**
   * Generate a consistent hash key for client configurations
   * @param opts Client parameters
   * @returns String hash key
   */
  private generateClientSettingsKey(
    opts: NodeClickHouseClientConfigOptions,
  ): string {
    const keyParams = {
      url: env.CLICKHOUSE_URL,
      username: env.CLICKHOUSE_USER,
      password: env.CLICKHOUSE_PASSWORD,
      database: env.CLICKHOUSE_DB,
      http_headers: opts?.http_headers,
      settings: opts?.clickhouse_settings,
      request_timeout: opts?.request_timeout ?? 30000,
      // Include any other relevant config options
    };
    return JSON.stringify(keyParams);
  }

  /**
   * Get or create a client based on the provided parameters
   * @param opts Client configuration parameters
   * @returns ClickHouse client instance
   */
  public getClient(
    opts: NodeClickHouseClientConfigOptions,
  ): ClickhouseClientType {
    const key = this.generateClientSettingsKey(opts);
    if (!this.clientMap.has(key)) {
      const headers = opts?.http_headers ?? {};
      const activeSpan = getCurrentSpan();
      if (activeSpan) {
        propagation.inject(context.active(), headers);
      }

      const cloudOptions: Record<string, unknown> = {};
      if (
        ["STAGING", "EU", "US", "HIPAA"].includes(
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? "",
        )
      ) {
        cloudOptions.input_format_json_throw_on_bad_escape_sequence = 0;
      }

      const client = createClient({
        ...opts,
        url: env.CLICKHOUSE_URL,
        username: env.CLICKHOUSE_USER,
        password: env.CLICKHOUSE_PASSWORD,
        database: env.CLICKHOUSE_DB,
        http_headers: headers,
        keep_alive: {
          idle_socket_ttl: env.CLICKHOUSE_KEEP_ALIVE_IDLE_SOCKET_TTL,
        },
        max_open_connections: env.CLICKHOUSE_MAX_OPEN_CONNECTIONS,
        clickhouse_settings: {
          ...cloudOptions,
          ...opts.clickhouse_settings,
          async_insert: 1,
          wait_for_async_insert: 1, // if disabled, we won't get errors from clickhouse
          ...(opts.request_timeout && opts.request_timeout > 30000
            ? {
                send_progress_in_http_headers: 1,
                http_headers_progress_interval_ms: "25000", // UInt64, should be passed as a string
              }
            : {}),
        },
        ...(opts.request_timeout
          ? { request_timeout: opts.request_timeout }
          : {}),
      });

      this.clientMap.set(key, client);
    }

    return this.clientMap.get(key)!;
  }

  /**
   * Close all client connections - useful for application shutdown
   */
  public closeAllConnections(): Promise<void[]> {
    const closePromises = Array.from(this.clientMap.values()).map((client) =>
      client.close(),
    );
    this.clientMap.clear();
    return Promise.all(closePromises);
  }
}

export const clickhouseClient = (opts?: NodeClickHouseClientConfigOptions) => {
  return ClickHouseClientManager.getInstance().getClient(opts ?? {});
};

/**
 * Accepts a JavaScript date and returns the DateTime in format YYYY-MM-DD HH:MM:SS
 */
export const convertDateToClickhouseDateTime = (date: Date): string => {
  // 2024-11-06T20:37:00.123Z -> 2024-11-06 21:37:00.123
  return date.toISOString().replace("T", " ").replace("Z", "");
};
