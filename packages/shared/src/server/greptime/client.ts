import { Client } from "@greptime/ingester";
import mysql from "mysql2/promise";
import type { Connection as CoreConnection } from "mysql2";

import { env } from "../../env";
import { logger } from "../logger";
import { quoteIdent } from "./schemaUtils";

/**
 * GreptimeDB connection layer (02-write-path.md, step 1).
 *
 * Two transports, mirroring how ClickHouse was split into an insert client and a query client:
 *   - writes go through the official `@greptime/ingester` gRPC `Client` (singleton, conservative
 *     retry — the worker is the only writer and we do not want aggressive retries to amplify
 *     duplicate raw_events under partial failure);
 *   - reads (full-history replay for the worker, and the read path in 04) go through a `mysql2`
 *     pool over GreptimeDB's MySQL wire protocol.
 *
 * The ClickHouse client stays in place during the dual-write rollout; this module is additive.
 */

let ingestClient: Client | null = null;
let sqlPool: mysql.Pool | null = null;
let readOnlySqlPool: mysql.Pool | null = null;

/** Singleton gRPC ingester client used for all writes (raw_events + projections + EAV). */
export const getGreptimeIngestClient = (): Client => {
  if (!ingestClient) {
    let builder = Client.create(env.GREPTIME_GRPC_URL)
      .withDatabase(env.GREPTIME_DB)
      // Conservative: only retry transient transport/server codes. The worker rebuilds full
      // snapshots from history, so a failed write is re-driven by the queue, not by aggressive
      // in-call retries that could double-append.
      .withRetry({ mode: "conservative" });

    if (env.GREPTIME_USER) {
      builder = builder.withBasicAuth(env.GREPTIME_USER, env.GREPTIME_PASSWORD);
    }

    ingestClient = new Client(builder.build());
    logger.info(
      `Initialized GreptimeDB ingester client at ${env.GREPTIME_GRPC_URL} (db=${env.GREPTIME_DB})`,
    );
  }
  return ingestClient;
};

const buildSqlPool = (host: string): mysql.Pool =>
  mysql.createPool({
    host,
    port: env.GREPTIME_SQL_PORT,
    user: env.GREPTIME_USER || "root",
    password: env.GREPTIME_PASSWORD || undefined,
    database: env.GREPTIME_DB,
    connectionLimit: env.GREPTIME_SQL_MAX_OPEN_CONNECTIONS,
    // DECIMAL columns must stay strings to preserve full precision (cost is DECIMAL(38,12));
    // never coerce them to JS doubles. BIGINT stays a string for the same reason.
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    namedPlaceholders: true,
    // GreptimeDB sends TIMESTAMP over the MySQL wire as a naive UTC string. Without pinning the
    // session timezone, mysql2 parses it in the host's local zone, skewing every Date by the local
    // offset (e.g. UTC+8 turned 14:00 into a 06:00Z Date) — which corrupts DateTime filters and
    // keyset cursors that round-trip a Date back into SQL. Pin to UTC so reads are offset-correct.
    timezone: "Z",
  });

/** Read/write MySQL-wire pool (used for DDL-free reads + full-history replay). */
export const getGreptimeSqlPool = (): mysql.Pool => {
  if (!sqlPool) {
    sqlPool = buildSqlPool(env.GREPTIME_SQL_HOST);
    logger.info(
      `Initialized GreptimeDB SQL pool at ${env.GREPTIME_SQL_HOST}:${env.GREPTIME_SQL_PORT}`,
    );
  }
  return sqlPool;
};

/** Read-only MySQL-wire pool. Falls back to the primary host when no replica is configured. */
export const getGreptimeReadOnlySqlPool = (): mysql.Pool => {
  if (!env.GREPTIME_SQL_READ_ONLY_HOST) return getGreptimeSqlPool();
  if (!readOnlySqlPool) {
    readOnlySqlPool = buildSqlPool(env.GREPTIME_SQL_READ_ONLY_HOST);
  }
  return readOnlySqlPool;
};

/** Bind values for a parameterized GreptimeDB query (positional array or named object). */
export type GreptimeQueryParams =
  | ReadonlyArray<string | number | null>
  | Record<string, string | number | null>;

/**
 * Run a read query against GreptimeDB over the MySQL wire. `readOnly` routes to the replica pool
 * when configured. Returns plain row objects.
 */
export const greptimeQuery = async <T = Record<string, unknown>>(params: {
  query: string;
  params?: GreptimeQueryParams;
  readOnly?: boolean;
}): Promise<T[]> => {
  const pool = params.readOnly
    ? getGreptimeReadOnlySqlPool()
    : getGreptimeSqlPool();
  const [rows] = await pool.query(
    params.query,
    params.params as string[] | Record<string, string>,
  );
  return rows as T[];
};

/**
 * Stream rows from GreptimeDB over the MySQL wire without buffering the whole result set in JS.
 *
 * GreptimeDB's MySQL protocol has no server-side cursor, so the server still produces the full
 * result; but mysql2's row-by-row streaming parses rows incrementally off the socket with
 * backpressure, so peak client memory is bounded by the consumer's pace, not the result size.
 * Replaces `queryClickhouseStream` for exports / analytics streams.
 *
 * For unbounded scans that must checkpoint/resume (very large exports, full-history replay) prefer
 * `greptimeKeysetScan`, which pages by a stable composite cursor instead of holding one result open.
 *
 * On early abandonment (a consumer `break`) or error, the underlying connection is destroyed rather
 * than returned to the pool, so a half-drained query never corrupts a pooled connection.
 */
export async function* greptimeQueryStream<
  T = Record<string, unknown>,
>(params: {
  query: string;
  params?: GreptimeQueryParams;
  readOnly?: boolean;
}): AsyncGenerator<T> {
  const pool = params.readOnly
    ? getGreptimeReadOnlySqlPool()
    : getGreptimeSqlPool();
  const conn = await pool.getConnection();
  let drained = false;
  try {
    // mysql2/promise types `.connection` as a promise connection; the callback connection exposes
    // the row-by-row `.stream()` (the promise wrapper buffers). Cast to reach it.
    const core = conn.connection as unknown as CoreConnection;
    const stream = core
      .query(
        params.query,
        params.params as string[] | Record<string, string> | undefined,
      )
      .stream();
    for await (const row of stream) {
      yield row as T;
    }
    drained = true;
  } finally {
    if (drained) conn.release();
    else conn.destroy();
  }
}

/**
 * Build a keyset (seek) predicate for a stable composite cursor `(timeColumn, ...tiebreakColumns)`.
 *
 * A bare `WHERE timeColumn > :last` silently drops rows that share `last`'s timestamp. The cursor
 * must therefore extend the time column with enough tiebreak columns to be unique per row (e.g.
 * `(timestamp, project_id, id)`). The predicate is expanded explicitly (no SQL tuple comparison,
 * whose GreptimeDB support is unverified) into the lexicographic seek condition. Param names are
 * `cursor_0..cursor_n` matching `[timeColumn, ...tiebreakColumns]` order.
 *
 * Pure + exported for unit tests.
 */
export const keysetCursorPredicate = (
  columns: string[],
  direction: "ASC" | "DESC",
): string => {
  if (columns.length === 0) {
    throw new Error(
      "keysetCursorPredicate requires at least one cursor column (time + tiebreaks)",
    );
  }
  const cmp = direction === "ASC" ? ">" : "<";
  // Quote a possibly-qualified ref: `dri.dataset_run_created_at` -> dri.`dataset_run_created_at`.
  const quoteRef = (ref: string): string => {
    const i = ref.lastIndexOf(".");
    return i === -1
      ? quoteIdent(ref)
      : `${ref.slice(0, i)}.${quoteIdent(ref.slice(i + 1))}`;
  };
  // (c0 cmp :cursor_0) OR (c0 = :cursor_0 AND (c1 cmp :cursor_1) OR (c1 = :cursor_1 AND ...))
  const build = (i: number): string => {
    const col = quoteRef(columns[i]);
    const gt = `${col} ${cmp} :cursor_${i}`;
    if (i === columns.length - 1) return gt;
    return `(${gt} OR (${col} = :cursor_${i} AND ${build(i + 1)}))`;
  };
  return build(0);
};

/**
 * Page through a large result by a stable composite cursor, yielding rows across pages. Memory stays
 * bounded by `pageSize`, and the last-seen cursor can be persisted for resume. The caller supplies a
 * page builder so any projection/filter/join shape is supported; the cursor columns must appear in
 * the SELECT and define a strict total order (time + tiebreaks).
 */
export async function* greptimeKeysetScan<T = Record<string, unknown>>(params: {
  /** Columns forming the cursor, in order: `[timeColumn, ...tiebreakColumns]`. */
  cursorColumns: string[];
  /** Reads `cursorColumns` out of a row, in the same order, for the next page's seek. */
  cursorOf: (row: T) => Array<string | number | null>;
  /**
   * Build one page. `seekPredicate` is the keyset condition to AND into WHERE (empty on the first
   * page); `cursor` holds the bound values for params `cursor_0..cursor_n` (empty on the first page).
   */
  buildPage: (
    seekPredicate: string,
    cursor: Record<string, string | number | null>,
    limit: number,
  ) => { query: string; params?: Record<string, string | number | null> };
  pageSize?: number;
  direction?: "ASC" | "DESC";
  readOnly?: boolean;
}): AsyncGenerator<T> {
  const pageSize = params.pageSize ?? 1000;
  const direction = params.direction ?? "ASC";
  const predicate = keysetCursorPredicate(params.cursorColumns, direction);
  let cursor: Array<string | number | null> | null = null;

  while (true) {
    const seek = cursor ? predicate : "";
    const cursorParams: Record<string, string | number | null> = {};
    if (cursor) cursor.forEach((v, i) => (cursorParams[`cursor_${i}`] = v));

    const page = params.buildPage(seek, cursorParams, pageSize);
    const rows = await greptimeQuery<T>({
      query: page.query,
      params: { ...(page.params ?? {}), ...cursorParams },
      readOnly: params.readOnly,
    });
    if (rows.length === 0) return;
    for (const row of rows) yield row;
    if (rows.length < pageSize) return;
    cursor = params.cursorOf(rows[rows.length - 1]);
  }
}

/** Liveness probe for the GreptimeDB SQL endpoint. */
export const greptimeHealthCheck = async (): Promise<boolean> => {
  try {
    await greptimeQuery({ query: "SELECT 1" });
    return true;
  } catch (error) {
    logger.error("GreptimeDB health check failed", error);
    return false;
  }
};

/** Release all GreptimeDB connections. Call on worker/web shutdown. */
export const closeGreptimeConnections = async (): Promise<void> => {
  await Promise.all([
    ingestClient?.close(),
    sqlPool?.end(),
    readOnlySqlPool?.end(),
  ]);
  ingestClient = null;
  sqlPool = null;
  readOnlySqlPool = null;
};
