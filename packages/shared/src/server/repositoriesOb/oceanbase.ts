import { env } from "../../env";
import { DatabaseAdapterFactory, convertDateToDateTime } from "../database";
import { logger } from "../logger";
import { getTracer, instrumentAsync } from "../instrumentation";
import { randomUUID } from "crypto";
import { getOceanBaseEntityType } from "../oceanbase/schemaUtils";
import { context, SpanKind, trace } from "@opentelemetry/api";
import { backOff } from "exponential-backoff";
import {
  StorageService,
  StorageServiceFactory,
} from "../services/StorageService";

let s3StorageServiceClient: StorageService;

const getS3StorageServiceClient = (bucketName: string): StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
      awsSse: env.LANGFUSE_S3_EVENT_UPLOAD_SSE,
      awsSseKmsKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_SSE_KMS_KEY_ID,
    });
  }
  return s3StorageServiceClient;
};

export async function upsertOceanBase<T extends Record<string, unknown>>(opts: {
  table: "scores" | "traces" | "observations" | "traces_null";
  records: T[];
  eventBodyMapper: (body: T) => Record<string, unknown>; // eslint-disable-line no-unused-vars
  tags?: Record<string, string>;
}): Promise<void> {
  return await instrumentAsync(
    { name: "oceanbase-upsert", spanKind: SpanKind.CLIENT },
    async (span) => {
      // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
      span.setAttribute("ob.query.table", opts.table);
      span.setAttribute("db.system", "oceanbase");
      span.setAttribute("db.operation.name", "UPSERT");

      const adapter = DatabaseAdapterFactory.getInstance();

      await Promise.all(
        opts.records.map(async (record) => {
          // drop trailing s and pretend it's always a create.
          // Only applicable to scores and traces.
          let eventType = `${opts.table.slice(0, -1)}-create`;
          if (opts.table === "observations") {
            // @ts-ignore - If it's an observation we now that `type` is a string
            eventType = `${record["type"].toLowerCase()}-create`;
          }

          const eventId = randomUUID();
          const bucketPath = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${record.project_id}/${getOceanBaseEntityType(eventType)}/${record.id}/${eventId}.json`;

          if (env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true") {
            // Write new file directly to OceanBase. We don't use the writer here as we expect more limited traffic
            // and are not worried that much about latency.
            await adapter.insert({
              table: "blob_storage_file_log",
              values: [
                {
                  id: randomUUID(),
                  project_id: record.project_id,
                  entity_type: getOceanBaseEntityType(eventType),
                  entity_id: record.id,
                  event_id: eventId,
                  bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
                  bucket_path: bucketPath,
                  event_ts: convertDateToDateTime(new Date()),
                  is_deleted: 0,
                },
              ],
              tags: opts.tags,
            });
          }

          return getS3StorageServiceClient(
            env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          ).uploadJson(bucketPath, [
            {
              id: eventId,
              timestamp: new Date().toISOString(),
              type: eventType,
              body: opts.eventBodyMapper(record),
            },
          ]);
        }),
      );

      await adapter.insert({
        table: opts.table,
        values: opts.records.map((record) => ({
          ...record,
          event_ts: convertDateToDateTime(new Date()),
        })),
        tags: opts.tags,
      });

      // same logic as for prisma. we want to see queries in development
      if (env.NODE_ENV === "development") {
        logger.info(`oceanbase:insert ${opts.table}`);
      }

      span.setAttribute("ob.queryId", `adapter-${Date.now()}`);
    },
  );
}

export async function* queryOceanBaseStream<T>(opts: {
  query: string;
  params?: Record<string, unknown> | unknown[] | undefined;
  tags?: Record<string, string>;
}): AsyncGenerator<T> {
  const tracer = getTracer("oceanbase-query-stream");
  const span = tracer.startSpan("oceanbase-query-stream", {
    kind: SpanKind.CLIENT,
  });

  try {
    // Set span attributes and get generator
    const generator = await context.with(
      trace.setSpan(context.active(), span),
      async () => {
        // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
        span.setAttribute("ob.query.text", opts.query);
        span.setAttribute("db.system", "oceanbase");
        span.setAttribute("db.query.text", opts.query);
        span.setAttribute("db.operation.name", "SELECT");

        const adapter = DatabaseAdapterFactory.getInstance();
        return adapter.queryStream<T>(opts.query, opts.params, {
          tags: opts.tags,
        });
      },
    );

    // Yield results from adapter (must be in generator function body, not in async callback)
    for await (const row of generator) {
      yield row;
    }

    span.setAttribute("ob.queryId", `adapter-${Date.now()}`);
  } finally {
    span.end();
  }
}

/**
 * Format SQL query with parameters replaced for logging/debugging purposes
 * WARNING: This is only for logging, NOT for actual execution (to prevent SQL injection)
 */
function formatSqlWithParams(
  query: string,
  params?: Record<string, unknown> | unknown[] | undefined,
): string {
  if (
    !params ||
    (Array.isArray(params) && params.length === 0) ||
    (typeof params === "object" && Object.keys(params).length === 0)
  ) {
    return query;
  }

  let formattedQuery = query;
  const paramArray = Array.isArray(params) ? params : Object.values(params);

  // Replace ? placeholders with actual values
  let paramIndex = 0;
  formattedQuery = formattedQuery.replace(/\?/g, () => {
    if (paramIndex >= paramArray.length) {
      return "?"; // Not enough parameters, keep placeholder
    }

    const value = paramArray[paramIndex++];

    if (value === null || value === undefined) {
      return "NULL";
    }

    if (typeof value === "string") {
      // Escape single quotes and backslashes
      const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "''");
      return `'${escaped}'`;
    }

    if (typeof value === "number") {
      return String(value);
    }

    if (typeof value === "boolean") {
      return value ? "1" : "0";
    }

    if (value instanceof Date) {
      // Format as MySQL datetime
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
      const hours = String(value.getHours()).padStart(2, "0");
      const minutes = String(value.getMinutes()).padStart(2, "0");
      const seconds = String(value.getSeconds()).padStart(2, "0");
      const ms = String(value.getMilliseconds()).padStart(3, "0");
      return `'${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}'`;
    }

    if (Array.isArray(value)) {
      // Handle array parameters (for IN clauses)
      return value
        .map((v) => {
          if (v === null || v === undefined) return "NULL";
          if (typeof v === "string") {
            const escaped = v.replace(/\\/g, "\\\\").replace(/'/g, "''");
            return `'${escaped}'`;
          }
          return String(v);
        })
        .join(", ");
    }

    // For other types, convert to string and escape
    const stringValue = String(value);
    const escaped = stringValue.replace(/\\/g, "\\\\").replace(/'/g, "''");
    return `'${escaped}'`;
  });

  return formattedQuery;
}

/**
 * Determines if an error is retryable (socket hang up, connection reset, etc.)
 */
function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const errorMessage = (error as Error).message?.toLowerCase() || "";

  // Check for socket hang up and other network-related errors
  return (
    errorMessage.includes("socket hang up") ||
    errorMessage.includes("connection") ||
    errorMessage.includes("timeout")
  );
}

export async function queryOceanBase<T>(opts: {
  query: string;
  params?: Record<string, unknown> | unknown[] | undefined;
  tags?: Record<string, string>;
}): Promise<any> {
  return await instrumentAsync(
    { name: "oceanbase-query", spanKind: SpanKind.CLIENT },
    async (span) => {
      // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
      span.setAttribute("ob.query.text", opts.query);
      span.setAttribute("db.system", "oceanbase");
      span.setAttribute("db.query.text", opts.query);
      span.setAttribute("db.operation.name", "SELECT");

      const adapter = DatabaseAdapterFactory.getInstance();
      const formattedSql = formatSqlWithParams(opts.query, opts.params);

      // Retry logic for socket hang up and other network errors
      return await backOff(
        async () => {
          const result = await adapter.query<T>({
            query: opts.query,
            params: opts.params,
          });

          // same logic as for prisma. we want to see queries in development
          logger.info(`oceanbase:query\n${formattedSql}`);

          span.setAttribute("ob.queryId", `adapter-${Date.now()}`);

          return result;
        },
        {
          numOfAttempts: env.LANGFUSE_CLICKHOUSE_QUERY_MAX_ATTEMPTS, // Reuse same config
          retry: (error: Error, attemptNumber: number) => {
            const shouldRetry = isRetryableError(error);
            if (shouldRetry) {
              logger.warn(`oceanbase:query\n${formattedSql}`);
              logger.warn(
                `OceanBase query failed with retryable error (attempt ${attemptNumber}/${env.LANGFUSE_CLICKHOUSE_QUERY_MAX_ATTEMPTS}): ${error.message}`,
                {
                  error: error.message,
                  attemptNumber,
                  tags: opts.tags,
                },
              );
              span.addEvent("oceanbase-query-retry", {
                "retry.attempt": attemptNumber,
                "retry.error": error.message,
              });
            } else {
              logger.error(`oceanbase:query\n${formattedSql}`);
              logger.error(
                `OceanBase query failed with non-retryable error: ${error.message}`,
                {
                  error: error.message,
                  tags: opts.tags,
                },
              );
            }
            return shouldRetry;
          },
          startingDelay: 100,
          timeMultiple: 1,
          maxDelay: 100,
        },
      );
    },
  );
}

export async function commandOceanBase(opts: {
  query: string;
  params?: Record<string, unknown> | unknown[] | undefined;
  tags?: Record<string, string>;
}): Promise<void> {
  return await instrumentAsync(
    { name: "oceanbase-command", spanKind: SpanKind.CLIENT },
    async (span) => {
      // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
      span.setAttribute("ob.query.text", opts.query);
      span.setAttribute("db.system", "oceanbase");
      span.setAttribute("db.query.text", opts.query);
      span.setAttribute("db.operation.name", "COMMAND");

      const adapter = DatabaseAdapterFactory.getInstance();
      await adapter.command({
        query: opts.query,
        params: opts.params,
      });

      // same logic as for prisma. we want to see queries in development
      const formattedSql = formatSqlWithParams(opts.query, opts.params);
      logger.info(`oceanbase:command\n${formattedSql}`);

      span.setAttribute("ob.queryId", `adapter-${Date.now()}`);
    },
  );
}

export function parseOceanBaseUTCDateTimeFormat(dateStr: string): Date {
  // OceanBase uses MySQL-compatible datetime format: 'YYYY-MM-DD HH:mm:ss.sss'
  // Parse it similar to ClickHouse but handle MySQL format
  return new Date(`${dateStr.replace(" ", "T")}Z`);
}

export function oceanBaseCompliantRandomCharacters() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  const randomArray = new Uint8Array(5);
  crypto.getRandomValues(randomArray);
  randomArray.forEach((number) => {
    result += chars[number % chars.length];
  });
  return result;
}
