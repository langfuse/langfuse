import { Client } from "@greptime/ingester";
import mysql from "mysql2/promise";

import { env } from "../../env";
import { logger } from "../logger";

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
