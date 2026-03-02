import { ClickHouseSettings } from "@clickhouse/client";

/**
 * Database adapter interface for abstracting database operations
 * This allows switching between ClickHouse and OceanBase without changing business logic
 */
export interface IDatabaseAdapter {
  /**
   * Execute a query and return results
   */
  query<T = unknown>(opts: {
    query: string;
    query_id?: string;
    format?: string;
    abort_signal?: AbortSignal;
    query_params?: Record<string, unknown>;
    params?: Record<string, unknown> | unknown[];
    clickhouse_settings?: ClickHouseSettings;
  }): Promise<T>;

  /**
   * Execute a query and return a stream of results
   */
  queryStream<T = unknown>(
    sql: string,
    params?: Record<string, unknown> | unknown[],
    options?: unknown,
  ): AsyncGenerator<T>;

  /**
   * Insert data into a table
   */
  insert(opts: {
    table: string;
    values: unknown[];
    format?: string;
    tags?: Record<string, string>;
    clickhouse_settings?: ClickHouseSettings;
  }): Promise<any>;

  /**
   * Execute a command (DDL, DML without return values)
   */
  command<T = unknown>(opts: {
    query: string;
    query_id?: string;
    format?: string;
    abort_signal?: AbortSignal;
    params?: Record<string, unknown> | unknown[];
  }): Promise<T>;

  /**
   * Convert a JavaScript Date to database-specific datetime format
   */
  convertDateToDateTime(date: Date): string;

  /**
   * Get the database system name (e.g., "clickhouse", "mysql", "oceanbase")
   */
  getDatabaseSystem(): string;

  /**
   * Upsert records with S3 blob storage integration
   * Equivalent to upsertClickhouse/upsertOceanBase
   */
  upsert<T extends Record<string, unknown>>(opts: {
    table: "scores" | "traces" | "observations" | "traces_null";
    records: T[];
    eventBodyMapper: (body: T) => Record<string, unknown>;
    tags?: Record<string, string>;
  }): Promise<void>;

  /**
   * Query database with stream support
   * Equivalent to queryClickhouseStream/queryOceanBaseStream
   */
  queryStreamWithOptions<T>(opts: {
    query: string;
    params?: Record<string, unknown> | unknown[] | undefined;
    tags?: Record<string, string>;
    clickhouseConfigs?: unknown;
  }): AsyncGenerator<T>;

  /**
   * Query database with options
   * Equivalent to queryClickhouse/queryOceanBase
   */
  queryWithOptions<T>(opts: {
    query: string;
    params?: Record<string, unknown> | unknown[] | undefined;
    tags?: Record<string, string>;
    clickhouseConfigs?: unknown;
    clickhouseSettings?: ClickHouseSettings;
  }): Promise<T[]>;

  /**
   * Execute a command with options
   * Equivalent to commandClickhouse/commandOceanBase
   */
  commandWithOptions(opts: {
    query: string;
    params?: Record<string, unknown> | unknown[] | undefined;
    tags?: Record<string, string>;
    clickhouseConfigs?: unknown;
    clickhouseSettings?: ClickHouseSettings;
  }): Promise<void>;

  /**
   * Parse UTC datetime format to JavaScript Date
   * Equivalent to parseClickhouseUTCDateTimeFormat/parseOceanBaseUTCDateTimeFormat
   */
  parseUTCDateTimeFormat(dateStr: string): Date;

  /**
   * Generate random characters compliant with database requirements
   * Equivalent to clickhouseCompliantRandomCharacters/oceanBaseCompliantRandomCharacters
   */
  compliantRandomCharacters(): string;

  closeAllConnections(): void;
}
