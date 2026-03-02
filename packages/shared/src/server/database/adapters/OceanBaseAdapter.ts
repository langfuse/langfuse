import {
  queryOceanBase as queryOceanBaseRaw,
  queryOceanBaseStream as queryOceanBaseStreamRaw,
  convertDateToOceanBaseDateTime,
  oceanbaseClient,
  type OceanBaseClientType,
} from "../../oceanbase/client";
import {
  upsertOceanBase,
  queryOceanBase,
  queryOceanBaseStream,
  commandOceanBase,
  parseOceanBaseUTCDateTimeFormat,
  oceanBaseCompliantRandomCharacters,
} from "../../repositoriesOb/oceanbase";
import type { IDatabaseAdapter } from "./IDatabaseAdapter";
import type { OceanBaseClientConfigOptions } from "../../oceanbase/client";

export class OceanBaseAdapter implements IDatabaseAdapter {
  private pool?: OceanBaseClientType;
  private clientConfig?: OceanBaseClientConfigOptions;

  constructor(clientConfig?: OceanBaseClientConfigOptions) {
    this.clientConfig = clientConfig;
  }

  async query<T = unknown>(opts: {
    query: string;
    query_id?: string;
    format?: string;
    abort_signal?: AbortSignal;
    params?: Record<string, unknown> | unknown[];
  }): Promise<T | any> {
    const pool = this.pool ?? oceanbaseClient(this.clientConfig);
    if (!this.pool) {
      this.pool = pool;
    }
    // sql
    return queryOceanBaseRaw<T>(opts.query, opts.params, pool);
  }

  async *queryStream<T = unknown>(
    sql: string,
    params?: Record<string, unknown> | unknown[],

    _options?: { tags?: Record<string, string> },
  ): AsyncGenerator<T> {
    const pool = this.pool ?? oceanbaseClient(this.clientConfig);
    if (!this.pool) {
      this.pool = pool;
    }
    yield* queryOceanBaseStreamRaw<T>(sql, params, pool);
  }

  async insert(opts: {
    table: string;
    values: unknown[];
    format?: string;
    tags?: Record<string, string>;
  }): Promise<void> {
    const pool = this.pool ?? oceanbaseClient(this.clientConfig);
    if (!this.pool) {
      this.pool = pool;
    }

    // For MySQL/OceanBase, we need to build INSERT statement
    // This is a simplified version - you may need to extend based on your needs
    if (opts.values.length === 0) {
      return;
    }

    // Get column names from first value
    const firstValue = opts.values[0] as Record<string, unknown>;
    const columns = Object.keys(firstValue);
    const placeholders = columns.map(() => "?").join(", ");
    const columnNames = columns.map((col) => `\`${col}\``).join(", ");

    // Build INSERT statement
    const sql = `INSERT INTO \`${opts.table}\` (${columnNames}) VALUES (${placeholders})`;

    // Execute for each value (or batch insert)
    for (const value of opts.values) {
      const row = value as Record<string, unknown>;
      const params = columns.map((col) => row[col]);
      await pool.execute(sql, params);
    }
  }

  async command<T = unknown>(opts: {
    query: string;
    query_id?: string;
    abort_signal?: AbortSignal;
    params?: Record<string, unknown> | unknown[];
  }): Promise<T | any> {
    const pool = this.pool ?? oceanbaseClient(this.clientConfig);
    if (!this.pool) {
      this.pool = pool;
    }
    await pool.execute(opts.query, opts.params);
  }

  convertDateToDateTime(date: Date): string {
    return convertDateToOceanBaseDateTime(date);
  }

  getDatabaseSystem(): string {
    return "oceanbase";
  }

  async upsert<T extends Record<string, unknown>>(opts: {
    table: "scores" | "traces" | "observations" | "traces_null";
    records: T[];
    eventBodyMapper: (body: T) => Record<string, unknown>;
    tags?: Record<string, string>;
  }): Promise<void> {
    return upsertOceanBase(opts);
  }

  async *queryStreamWithOptions<T>(opts: {
    query: string;
    params?: Record<string, unknown> | unknown[] | undefined;
    tags?: Record<string, string>;

    clickhouseConfigs?: unknown;
  }): AsyncGenerator<T> {
    yield* queryOceanBaseStream<T>({
      query: opts.query,
      params: opts.params,
      tags: opts.tags,
    });
  }

  async queryWithOptions<T>(opts: {
    query: string;
    params?: Record<string, unknown> | unknown[] | undefined;
    tags?: Record<string, string>;

    clickhouseConfigs?: unknown;
  }): Promise<T[]> {
    return queryOceanBase<T>({
      query: opts.query,
      params: opts.params,
      tags: opts.tags,
    });
  }

  async commandWithOptions(opts: {
    query: string;
    params?: Record<string, unknown> | unknown[] | undefined;
    tags?: Record<string, string>;

    clickhouseConfigs?: unknown;
  }): Promise<void> {
    return commandOceanBase({
      query: opts.query,
      params: opts.params,
      tags: opts.tags,
    });
  }

  parseUTCDateTimeFormat(dateStr: string): Date {
    return parseOceanBaseUTCDateTimeFormat(dateStr);
  }

  compliantRandomCharacters(): string {
    return oceanBaseCompliantRandomCharacters();
  }

  closeAllConnections(): void {
    if (this.pool) {
      this.pool.end();
    }
  }
}
