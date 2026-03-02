import mysql from "mysql2/promise";
import { env } from "../../env";
import { getCurrentSpan } from "../instrumentation";
import { propagation, context } from "@opentelemetry/api";
import type { Pool, PoolOptions } from "mysql2/promise";

export type OceanBaseClientType = Pool;

export interface OceanBaseClientConfigOptions {
  connectionLimit?: number;
  queueLimit?: number;
  connectTimeout?: number;
  timeout?: number;
  enableKeepAlive?: boolean;
  keepAliveInitialDelay?: number;
}

/**
 * OceanBaseClientManager provides a singleton pattern for managing OceanBase/MySQL clients.
 * It creates and reuses connection pools based on their configuration to avoid creating
 * a new connection for each query.
 */
export class OceanBaseClientManager {
  private static instance: OceanBaseClientManager;
  private clientMap: Map<string, OceanBaseClientType> = new Map();

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance of the OceanBaseClientManager
   */
  public static getInstance(): OceanBaseClientManager {
    if (!OceanBaseClientManager.instance) {
      OceanBaseClientManager.instance = new OceanBaseClientManager();
    }
    return OceanBaseClientManager.instance;
  }

  /**
   * Parse OCEANBASE_URL to extract connection details
   * Format: mysql://user:password@host:port/database
   */
  private parseConnectionUrl(url: string | undefined): {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  } {
    if (!url) {
      throw new Error("OCEANBASE_URL is not set");
    }
    try {
      const parsedUrl = new URL(url);
      return {
        host: parsedUrl.hostname,
        port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 3306,
        user: decodeURIComponent(parsedUrl.username),
        password: decodeURIComponent(parsedUrl.password),
        database: parsedUrl.pathname.slice(1), // Remove leading '/'
      };
    } catch (error) {
      throw new Error(
        `Invalid OCEANBASE_URL format. Expected format: mysql://user:password@host:port/database. Error: ${error}`,
      );
    }
  }

  /**
   * Generate a consistent hash key for client configurations
   * @param opts Client parameters
   * @returns String hash key
   */
  private generateClientSettingsKey(
    opts: OceanBaseClientConfigOptions,
  ): string {
    const keyParams = {
      url: env.OCEANBASE_URL,
      connectionLimit: opts?.connectionLimit ?? 10,
      queueLimit: opts?.queueLimit ?? 0,
      connectTimeout: opts?.connectTimeout ?? 10000,
      timeout: opts?.timeout ?? 60000,
      enableKeepAlive: opts?.enableKeepAlive ?? true,
      keepAliveInitialDelay: opts?.keepAliveInitialDelay ?? 0,
    };
    return JSON.stringify(keyParams);
  }

  /**
   * Get or create a client based on the provided parameters
   * @param opts Client configuration parameters
   * @returns OceanBase/MySQL connection pool instance
   */
  public getClient(opts?: OceanBaseClientConfigOptions): OceanBaseClientType {
    const key = this.generateClientSettingsKey(opts ?? {});
    if (!this.clientMap.has(key)) {
      const connectionConfig = this.parseConnectionUrl(env.OCEANBASE_URL);

      const poolOptions: PoolOptions = {
        host: connectionConfig.host,
        port: connectionConfig.port,
        user: connectionConfig.user,
        password: connectionConfig.password ?? undefined,
        database: connectionConfig.database,
        connectionLimit: opts?.connectionLimit ?? 10,
        queueLimit: opts?.queueLimit ?? 0,
        connectTimeout: opts?.connectTimeout ?? 10000,
        enableKeepAlive: opts?.enableKeepAlive ?? true,
        keepAliveInitialDelay: opts?.keepAliveInitialDelay ?? 0,
        multipleStatements: false,
        namedPlaceholders: true,
        // 配置 BIGINT 和 DECIMAL 始终返回字符串，避免 BigInt 序列化问题
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: true,
        typeCast: (field: any, next: () => any) => {
          // Handle JSON columns that might be interpreted as BINARY by default
          if (field.type === "JSON" || field.type === "BINARY") {
            try {
              const value = field.string("utf8");
              return value ? JSON.parse(value) : null;
            } catch (e) {
              // If parsing fails, return the original value
              return next();
            }
          }
          if (field.type === "DATETIME" || field.type === "TIMESTAMP") {
            return field.string();
          }
          return next();
        },
      };

      const pool = mysql.createPool(poolOptions);

      pool.on("connection", () => {
        const activeSpan = getCurrentSpan();
        if (activeSpan) {
          const headers: Record<string, string> = {};
          propagation.inject(context.active(), headers);
          // eslint-disable-next-line turbo/no-undeclared-env-vars
          if (process.env.NODE_ENV === "development") {
            console.debug("OceanBase connection established with span context");
          }
        }
      });

      this.clientMap.set(key, pool);
    }

    return this.clientMap.get(key)!;
  }

  /**
   * Close all client connections - useful for application shutdown
   */
  public async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.clientMap.values()).map((pool) =>
      pool.end(),
    );
    await Promise.all(closePromises);
    this.clientMap.clear();
  }
}

export const oceanbaseClient = (
  opts?: OceanBaseClientConfigOptions,
): OceanBaseClientType => {
  return OceanBaseClientManager.getInstance().getClient(opts);
};

/**
 * Accepts a JavaScript date and returns the DateTime in format YYYY-MM-DD HH:MM:SS.SSS
 * Compatible with MySQL DATETIME(3) format
 */
export const convertDateToOceanBaseDateTime = (date: Date): string => {
  // 2024-11-06T20:37:00.123Z -> 2024-11-06 21:37:00.123
  return date.toISOString().replace("T", " ").replace("Z", "");
};

/**
 * Execute a query and return results
 * Note: SQL should already be in MySQL/OceanBase format with positional parameters (?)
 * Params should be an array matching the order of ? placeholders in SQL
 */
export async function queryOceanBase<T = unknown>(
  sql: string,
  params?: unknown[] | Record<string, unknown>,
  pool?: OceanBaseClientType,
): Promise<T[]> {
  const client = pool ?? oceanbaseClient();

  // For MySQL/OceanBase, params must be an array for positional placeholders (?)
  let finalParams: unknown[] = [];

  if (Array.isArray(params)) {
    finalParams = params;
  } else if (params && typeof params === "object") {
    throw new Error(
      "OceanBase queries require positional parameters (array). " +
        "SQL should use ? placeholders, not named parameters. " +
        "Please update the SQL generation to use MySQL/OceanBase syntax.",
    );
  }

  const [rows] = await client.execute(sql, finalParams);
  return rows as T[];
}

/**
 * Execute a query and return the first result
 */
export async function queryOceanBaseOne<T = unknown>(
  sql: string,
  params?: unknown[] | Record<string, unknown>,
  pool?: OceanBaseClientType,
): Promise<T | null> {
  const results = await queryOceanBase<T>(sql, params, pool);
  return results[0] ?? null;
}

/**
 * Execute a query that returns a stream
 */
export async function* queryOceanBaseStream<T = unknown>(
  sql: string,
  params?: unknown[] | Record<string, unknown>,
  pool?: OceanBaseClientType,
): AsyncGenerator<T> {
  const client = pool ?? oceanbaseClient();
  const connection = await client.getConnection();

  try {
    // For MySQL/OceanBase, params must be an array
    let finalParams: unknown[] = [];

    if (Array.isArray(params)) {
      finalParams = params;
    } else if (params && typeof params === "object") {
      throw new Error(
        "OceanBase queries require positional parameters (array). " +
          "SQL should use ? placeholders, not named parameters. " +
          "Please update the SQL generation to use MySQL/OceanBase syntax.",
      );
    }

    const [rows] = await connection.execute(sql, finalParams);
    const results = rows as T[];

    for (const row of results) {
      yield row;
    }
  } finally {
    connection.release();
  }
}
