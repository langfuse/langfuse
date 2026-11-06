import { createClient, type ClickHouseSettings } from "@clickhouse/client";
import { env } from "../../env";
import { VERSION } from "../../constants/VERSION";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";
import { getCurrentSpan } from "../instrumentation";
import { propagation, context } from "@opentelemetry/api";
import { ClickHouseLogger, mapLogLevel } from "./clickhouse-logger";
import {
  getClickHouseCompatibilitySettings,
  getClickHouseJsonBadUnicodeEscapeMode,
} from "./compatibility";
import { stringifyJsonWithSanitizedSurrogates } from "./json";
import { getClickhouseAuth } from "./auth";
import { logger } from "../logger";

export { EXCEPTION_TAG_HEADER_NAME } from "@clickhouse/client";

export type ClickhouseClientType = ReturnType<typeof createClient>;

export type PreferredClickhouseService =
  | "ReadWrite"
  | "ReadOnly"
  | "EventsReadOnly";

/** Node a query actually lands on once unset replica URLs fall back. */
export type ClickhouseService = "main" | "read_replica" | "events_read_replica";

export function resolveClickhouseService(
  preferredClickhouseService: PreferredClickhouseService = "ReadWrite",
): ClickhouseService {
  switch (preferredClickhouseService) {
    case "ReadWrite":
      return "main";
    case "EventsReadOnly":
      if (env.CLICKHOUSE_EVENTS_READ_ONLY_URL) return "events_read_replica";
      return env.CLICKHOUSE_READ_ONLY_URL ? "read_replica" : "main";
    case "ReadOnly":
    default:
      return env.CLICKHOUSE_READ_ONLY_URL ? "read_replica" : "main";
  }
}

type ServiceClickhouseSettings = ClickHouseSettings & {
  enable_full_text_index?: 1;
};

type RequestTimeoutClickHouseSettings = ClickHouseSettings & {
  max_execution_time?: number;
  timeout_before_checking_execution_speed?: number;
};

const CLICKHOUSE_CLIENT_DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const CLICKHOUSE_SERVER_TIMEOUT_GRACE_SECONDS = 5;
/**
 * A client replaced after a credential change stays open this long past its
 * request timeout, so requests already running on it can finish.
 */
const REPLACED_CLIENT_CLOSE_MARGIN_MS = 5 * 60_000;

type CachedClient = {
  client: ClickhouseClientType;
  authFingerprint: string;
  requestTimeoutMs: number;
};

/**
 * ClickHouseClientManager provides a singleton pattern for managing ClickHouse clients.
 * It creates and reuses clients based on their configuration to avoid creating
 * a new connection for each query.
 */
export class ClickHouseClientManager {
  private static instance: ClickHouseClientManager;
  private clientMap: Map<string, CachedClient> = new Map();
  /** Clients replaced after a credential change, waiting to be closed. */
  private replacedClients: Set<ClickhouseClientType> = new Set();

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
    const jsonBadUnicodeEscapeMode = getClickHouseJsonBadUnicodeEscapeMode();
    const jsonBadUnicodeEscapeClickhouseSettings: ServiceClickhouseSettings =
      jsonBadUnicodeEscapeMode === "no_throw"
        ? { input_format_json_throw_on_bad_escape_sequence: 0 }
        : {};
    const jsonBadUnicodeEscapeClientSettings =
      jsonBadUnicodeEscapeMode === "sanitize"
        ? {
            json: {
              ...opts.json,
              stringify: stringifyJsonWithSanitizedSurrogates,
            },
          }
        : {};
    const serviceClickhouseSettings: ServiceClickhouseSettings = {
      ...this.getServiceClickhouseSettings(preferredClickhouseService),
      ...jsonBadUnicodeEscapeClickhouseSettings,
    };
    // Credentials are not part of these settings: they would end up in the
    // client cache key. getClient adds them when it creates the client.
    const keyParams = {
      url: this.getClickhouseUrl(preferredClickhouseService),
      database: env.CLICKHOUSE_DB,
      http_headers: opts?.http_headers ?? {},
      ...jsonBadUnicodeEscapeClientSettings,
      settings: {
        ...serviceClickhouseSettings,
        ...opts?.clickhouse_settings,
      },
      ...(opts.request_timeout
        ? { request_timeout: opts.request_timeout }
        : {}),
      ...(opts.compression ? { compression: opts.compression } : {}),

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
      preferredClickhouseService === "EventsReadOnly"
        ? {
            enable_full_text_index: 1,
            // Text index caches, all default off on ClickHouse 25.12 (the
            // Langfuse v4 minimum). use_text_index_header_cache defaults on
            // from 26.7, and use_text_index_dictionary_cache is accepted but
            // ignored from 26.3.
            use_text_index_dictionary_cache: 1,
            use_text_index_header_cache: 1,
            use_text_index_postings_cache: 1,
          }
        : {};

    return {
      ...getClickHouseCompatibilitySettings(),
      ...eventROSettings,
    };
  }

  private getRequestTimeoutClickHouseSettings(
    requestTimeout?: number,
  ): RequestTimeoutClickHouseSettings {
    if (!requestTimeout) return {};

    return {
      timeout_before_checking_execution_speed: 0,
      max_execution_time:
        Math.ceil(requestTimeout / 1000) +
        CLICKHOUSE_SERVER_TIMEOUT_GRACE_SECONDS,
    };
  }

  private getClickhouseUrl = (
    preferredClickhouseService: PreferredClickhouseService,
  ) => {
    switch (resolveClickhouseService(preferredClickhouseService)) {
      case "events_read_replica":
        return env.CLICKHOUSE_EVENTS_READ_ONLY_URL;
      case "read_replica":
        return env.CLICKHOUSE_READ_ONLY_URL;
      case "main":
        return env.CLICKHOUSE_URL;
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
    const key = JSON.stringify(settings);
    const auth = getClickhouseAuth();
    const cached = this.clientMap.get(key);
    if (cached && cached.authFingerprint !== auth.fingerprint) {
      this.clientMap.delete(key);
      this.closeReplacedClient(cached);
    }
    if (!this.clientMap.has(key)) {
      const activeSpan = getCurrentSpan();
      if (activeSpan) {
        propagation.inject(context.active(), settings.http_headers);
      }

      const clickHouseRequestTimeout =
        opts.request_timeout ?? CLICKHOUSE_CLIENT_DEFAULT_REQUEST_TIMEOUT_MS;
      const shouldSendProgressInHttpHeaders =
        opts.request_timeout !== undefined &&
        opts.request_timeout > CLICKHOUSE_CLIENT_DEFAULT_REQUEST_TIMEOUT_MS;

      const client = createClient({
        ...opts,
        ...settings,
        ...auth.config,
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
          ...serviceClickhouseSettings,
          ...this.getRequestTimeoutClickHouseSettings(clickHouseRequestTimeout),
          ...opts.clickhouse_settings,
          async_insert: 1,
          wait_for_async_insert: 1, // if disabled, we won't get errors from clickhouse
          ...(shouldSendProgressInHttpHeaders
            ? {
                send_progress_in_http_headers: 1,
                http_headers_progress_interval_ms: "10000", // UInt64, should be passed as a string
              }
            : {}),
        },
      });

      this.clientMap.set(key, {
        client,
        authFingerprint: auth.fingerprint,
        requestTimeoutMs: clickHouseRequestTimeout,
      });
    }

    return this.clientMap.get(key)!.client;
  }

  private closeReplacedClient(replaced: CachedClient): void {
    this.replacedClients.add(replaced.client);
    const timer = setTimeout(() => {
      // closeAllConnections may already have closed it.
      if (!this.replacedClients.delete(replaced.client)) return;
      replaced.client.close().catch((error: unknown) => {
        logger.warn("Failed to close replaced ClickHouse client", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, replaced.requestTimeoutMs + REPLACED_CLIENT_CLOSE_MARGIN_MS);
    timer.unref();
  }

  /**
   * Close all client connections - useful for application shutdown
   */
  public closeAllConnections(): Promise<void[]> {
    const clients = [
      ...Array.from(this.clientMap.values(), (cached) => cached.client),
      ...this.replacedClients,
    ];
    this.clientMap.clear();
    this.replacedClients.clear();
    return Promise.all(clients.map((client) => client.close()));
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
 * Accepts a JavaScript date and returns its UTC calendar time in ClickHouse's
 * YYYY-MM-DD HH:MM:SS.sss format.
 */
export const convertDateToClickhouseDateTime = (date: Date): string => {
  // 2024-11-06T20:37:00.123Z -> 2024-11-06 20:37:00.123
  return date.toISOString().replace("T", " ").replace("Z", "");
};

const CLICKHOUSE_DATETIME_STRING = /^\d{4}-\d{2}-\d{2} /;

/**
 * Convert a Date, unix-millisecond timestamp, ISO string, or already-quoted
 * ClickHouse datetime string to YYYY-MM-DD HH:MM:SS.sss for JSONEachRow inserts.
 */
export const toClickhouseDateTime = (
  value?: Date | number | string | null,
): string => {
  if (value == null) {
    return convertDateToClickhouseDateTime(new Date());
  }
  if (value instanceof Date) {
    return convertDateToClickhouseDateTime(value);
  }
  if (typeof value === "number") {
    return convertDateToClickhouseDateTime(new Date(value));
  }
  if (CLICKHOUSE_DATETIME_STRING.test(value)) {
    return value;
  }
  return convertDateToClickhouseDateTime(new Date(value));
};
