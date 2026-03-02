import {
  queryClickhouse,
  queryClickhouseStream,
  commandClickhouse,
  parseClickhouseUTCDateTimeFormat,
  upsertClickhouse,
  clickhouseCompliantRandomCharacters,
} from "../../repositories/clickhouse";
import {
  convertDateToClickhouseDateTime,
  clickhouseClient,
  ClickHouseClientManager,
} from "../../clickhouse/client";
import type { IDatabaseAdapter } from "./IDatabaseAdapter";
import type { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";
import { ClickHouseSettings } from "@clickhouse/client";

export class ClickHouseAdapter implements IDatabaseAdapter {
  private clickhouseConfigs?: NodeClickHouseClientConfigOptions;

  constructor(clickhouseConfigs?: NodeClickHouseClientConfigOptions) {
    this.clickhouseConfigs = clickhouseConfigs;
  }

  async query<T = unknown>(opts: {
    query: string;
    query_id?: string;
    format?: string;
    abort_signal?: AbortSignal;
    params?: Record<string, unknown> | unknown[];
    query_params?: Record<string, unknown>;
    clickhouse_settings?: ClickHouseSettings;
  }): Promise<T | any> {
    return clickhouseClient().query({
      query: opts.query,
      format: opts.format as "JSONEachRow",
      query_id: opts.query_id,
      abort_signal: opts.abort_signal,
      query_params: opts.query_params,
      clickhouse_settings: opts.clickhouse_settings,
    });
  }

  async *queryStream<T = unknown>(
    sql: string,
    params?: Record<string, unknown> | unknown[],
    options?: { tags?: Record<string, string> },
  ): AsyncGenerator<T> {
    yield* queryClickhouseStream<T>({
      query: sql,
      params: params as Record<string, unknown> | undefined,
      clickhouseConfigs: this.clickhouseConfigs,
      tags: options?.tags,
    });
  }

  async insert(opts: {
    table: string;
    values: unknown[];
    format?: string;
    tags?: Record<string, string>;
    clickhouse_settings?: ClickHouseSettings;
  }): Promise<void> {
    // Use ClickHouse client for direct insert
    const client = clickhouseClient(this.clickhouseConfigs);
    await client.insert({
      table: opts.table,
      values: opts.values,
      format: (opts.format as "JSONEachRow") ?? "JSONEachRow",
      clickhouse_settings: {
        log_comment: JSON.stringify(opts.tags ?? {}),
        ...opts.clickhouse_settings,
      },
    });
  }

  async command<T = unknown>(opts: {
    query: string;
    query_id?: string;
    abort_signal?: AbortSignal;
  }): Promise<T | any> {
    return clickhouseClient().command({
      query: opts.query,
      query_id: opts.query_id,
      abort_signal: opts.abort_signal,
    });
  }

  convertDateToDateTime(date: Date): string {
    return convertDateToClickhouseDateTime(date);
  }

  getDatabaseSystem(): string {
    return "clickhouse";
  }

  async upsert<T extends Record<string, unknown>>(opts: {
    table: "scores" | "traces" | "observations" | "traces_null";
    records: T[];
    eventBodyMapper: (body: T) => Record<string, unknown>;
    tags?: Record<string, string>;
  }): Promise<void> {
    return upsertClickhouse(opts);
  }

  async *queryStreamWithOptions<T>(opts: {
    query: string;
    params?: Record<string, unknown> | undefined;
    tags?: Record<string, string>;
    clickhouseConfigs?: NodeClickHouseClientConfigOptions;
  }): AsyncGenerator<T> {
    yield* queryClickhouseStream<T>({
      query: opts.query,
      params: opts.params,
      clickhouseConfigs: (opts.clickhouseConfigs ??
        this.clickhouseConfigs) as NodeClickHouseClientConfigOptions,
      tags: opts.tags,
    });
  }

  async queryWithOptions<T>(opts: {
    query: string;
    params?: Record<string, unknown> | undefined;
    tags?: Record<string, string>;
    clickhouseConfigs?: NodeClickHouseClientConfigOptions;
    clickhouseSettings?: ClickHouseSettings;
  }): Promise<T[]> {
    return queryClickhouse<T>({
      query: opts.query,
      params: opts.params,
      clickhouseConfigs: (opts.clickhouseConfigs ??
        this.clickhouseConfigs) as NodeClickHouseClientConfigOptions,
      clickhouseSettings: opts.clickhouseSettings,
      tags: opts.tags,
    });
  }

  async commandWithOptions(opts: {
    query: string;
    params?: Record<string, unknown> | undefined;
    tags?: Record<string, string>;
    clickhouseConfigs?: NodeClickHouseClientConfigOptions;
    clickhouseSettings?: ClickHouseSettings;
  }): Promise<void> {
    return commandClickhouse({
      query: opts.query,
      params: opts.params,
      clickhouseConfigs: (opts.clickhouseConfigs ??
        this.clickhouseConfigs) as NodeClickHouseClientConfigOptions,
      tags: opts.tags,
      clickhouseSettings: opts.clickhouseSettings,
    });
  }

  parseUTCDateTimeFormat(dateStr: string): Date {
    return parseClickhouseUTCDateTimeFormat(dateStr);
  }

  compliantRandomCharacters(): string {
    return clickhouseCompliantRandomCharacters();
  }

  closeAllConnections(): void {
    ClickHouseClientManager.getInstance().closeAllConnections();
  }
}
