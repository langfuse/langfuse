import { createClient, type ClickHouseSettings } from "@clickhouse/client";
import { env } from "../../env";
import { VERSION } from "../../constants/VERSION";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";
import { getCurrentSpan } from "../instrumentation";
import { propagation, context } from "@opentelemetry/api";
import { ClickHouseLogger, mapLogLevel } from "./clickhouse-logger";
import { getClickHouseCompatibilitySettings } from "./compatibility";

export type ClickhouseClientType = ReturnType<typeof createClient>;

export type PreferredClickhouseService =
  | "ReadWrite"
  | "ReadOnly"
  | "EventsReadOnly";

type ServiceClickhouseSettings = ClickHouseSettings & {
  enable_full_text_index?: 1;
};

/**
 * Remove these once we remove corresponding variables
 */
const EVENTS_TABLE_READ_PATH_ENV_KEYS = [
  "LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS",
  "LANGFUSE_ENABLE_EVENTS_TABLE_UI",
  "LANGFUSE_ENABLE_EVENTS_TABLE_FLAGS",
  "LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS",
  "LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN",
] as const;

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
  private generateClientSettings(
    opts: NodeClickHouseClientConfigOptions,
    preferredClickhouseService: PreferredClickhouseService = "ReadWrite",
  ): {
    settings: NodeClickHouseClientConfigOptions;
    serviceClickhouseSettings: ServiceClickhouseSettings;
  } {
    const serviceClickhouseSettings = this.getServiceClickhouseSettings(
      preferredClickhouseService,
    );
    const keyParams = {
      url: this.getClickhouseUrl(preferredClickhouseService),
      username: env.CLICKHOUSE_USER,
      password: env.CLICKHOUSE_PASSWORD,
      database: env.CLICKHOUSE_DB,
      http_headers: opts?.http_headers ?? {},
      settings: {
        ...serviceClickhouseSettings,
        ...opts?.clickhouse_settings,
      },
      ...(opts.request_timeout
        ? { request_timeout: opts.request_timeout }
        : {}),

      // Include any other relevant config options
    };
    return {
      settings: keyParams,
      serviceClickhouseSettings,
    };
  }

  private getServiceClickhouseSettings(
    preferredClickhouseService: PreferredClickhouseService,
  ): ServiceClickhouseSettings {
    const eventROSettings: ServiceClickhouseSettings =
      preferredClickhouseService === "EventsReadOnly" &&
      this.isEventsTableReadPathEnabled()
        ? { enable_full_text_index: 1 }
        : {};

    return {
      ...getClickHouseCompatibilitySettings(),
      ...eventROSettings,
    };
  }

  private isEventsTableReadPathEnabled(): boolean {
    return EVENTS_TABLE_READ_PATH_ENV_KEYS.some(
      (key) => process.env[key] === "true",
    );
  }

  private generateClientSettingsKey(
    settings: NodeClickHouseClientConfigOptions,
  ): string {
    return JSON.stringify(settings);
  }

  private getClickhouseUrl = (
    preferredClickhouseService: PreferredClickhouseService,
  ) => {
    switch (preferredClickhouseService) {
      case "ReadWrite":
        return env.CLICKHOUSE_URL;
      case "EventsReadOnly":
        return (
          env.CLICKHOUSE_EVENTS_READ_ONLY_URL ||
          env.CLICKHOUSE_READ_ONLY_URL ||
          env.CLICKHOUSE_URL
        );
      case "ReadOnly":
      default:
        return env.CLICKHOUSE_READ_ONLY_URL || env.CLICKHOUSE_URL;
    }
  };

  /**
   * Get or create a client based on the provided parameters
   * @param opts Client configuration parameters
   * @returns ClickHouse client instance
   */
  public getClient(
    opts: NodeClickHouseClientConfigOptions,
    preferredClickhouseService: PreferredClickhouseService = "ReadWrite",
  ): ClickhouseClientType {
    const { settings, serviceClickhouseSettings } = this.generateClientSettings(
      opts,
      preferredClickhouseService,
    );
    const key = this.generateClientSettingsKey(settings);
    if (!this.clientMap.has(key)) {
      const activeSpan = getCurrentSpan();
      if (activeSpan) {
        propagation.inject(context.active(), settings.http_headers);
      }

      const cloudOptions: Record<string, unknown> = {};
      if (
        ["STAGING", "EU", "US", "HIPAA", "JP"].includes(
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? "",
        )
      ) {
        cloudOptions.input_format_json_throw_on_bad_escape_sequence = 0;
      }

      const client = createClient({
        ...opts,
        ...settings,
        application: `langfuse/${VERSION.replace("v", "")}`,
        keep_alive: {
          idle_socket_ttl: env.CLICKHOUSE_KEEP_ALIVE_IDLE_SOCKET_TTL,
        },
        max_open_connections: env.CLICKHOUSE_MAX_OPEN_CONNECTIONS,
        log: {
          LoggerClass: ClickHouseLogger,
          level: mapLogLevel(env.LANGFUSE_LOG_LEVEL ?? "info"),
        },
        clickhouse_settings: {
          // Overwrite async insert settings to tune throughput
          ...(env.CLICKHOUSE_ASYNC_INSERT_MAX_DATA_SIZE
            ? {
                async_insert_max_data_size:
                  env.CLICKHOUSE_ASYNC_INSERT_MAX_DATA_SIZE,
              }
            : {}),
          ...(env.CLICKHOUSE_ASYNC_INSERT_BUSY_TIMEOUT_MS
            ? {
                async_insert_busy_timeout_ms:
                  env.CLICKHOUSE_ASYNC_INSERT_BUSY_TIMEOUT_MS,
              }
            : {}),
          ...(env.CLICKHOUSE_ASYNC_INSERT_BUSY_TIMEOUT_MIN_MS
            ? {
                async_insert_busy_timeout_min_ms:
                  env.CLICKHOUSE_ASYNC_INSERT_BUSY_TIMEOUT_MIN_MS,
              }
            : {}),
          ...(env.CLICKHOUSE_LIGHTWEIGHT_DELETE_MODE !== "alter_update"
            ? {
                lightweight_delete_mode: env.CLICKHOUSE_LIGHTWEIGHT_DELETE_MODE,
                update_parallel_mode: env.CLICKHOUSE_UPDATE_PARALLEL_MODE,
              }
            : {}),
          ...cloudOptions,
          ...serviceClickhouseSettings,
          ...opts.clickhouse_settings,
          async_insert: 1,
          wait_for_async_insert: 1, // if disabled, we won't get errors from clickhouse
          ...(opts.request_timeout && opts.request_timeout > 30000
            ? {
                send_progress_in_http_headers: 1,
                http_headers_progress_interval_ms: "10000", // UInt64, should be passed as a string
              }
            : {}),
        },
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

export const clickhouseClient = (
  opts?: NodeClickHouseClientConfigOptions,
  preferredClickhouseService: PreferredClickhouseService = "ReadWrite",
) => {
  return ClickHouseClientManager.getInstance().getClient(
    opts ?? {},
    preferredClickhouseService,
  );
};

/**
 * Accepts a JavaScript date and returns the DateTime in format YYYY-MM-DD HH:MM:SS
 */
export const convertDateToClickhouseDateTime = (date: Date): string => {
  // 2024-11-06T20:37:00.123Z -> 2024-11-06 21:37:00.123
  return date.toISOString().replace("T", " ").replace("Z", "");
};
