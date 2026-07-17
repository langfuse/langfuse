import { type Readable } from "stream";
import { env } from "../../env";
import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
  PreferredClickhouseService,
  EXCEPTION_TAG_HEADER_NAME,
} from "../clickhouse/client";
import { ClickhouseExecExceptionTagTransform } from "./clickhouseExecExceptionTag";
import { logger } from "../logger";
import { getTracer, instrumentAsync } from "../instrumentation";
import { randomUUID } from "crypto";
import { getClickhouseEntityType } from "../clickhouse/schemaUtils";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";
import { type Span, context, SpanKind, trace } from "@opentelemetry/api";
import { backOff } from "exponential-backoff";
import {
  StorageService,
  StorageServiceFactory,
} from "../services/StorageService";
import { buildEventBucketPrefix } from "../ingestion/eventBucketPath";
import {
  ClickHouseSettings,
  type RowOrProgress,
  type DataFormat,
} from "@clickhouse/client";
import { RESOURCE_LIMIT_ERROR_MESSAGE } from "../../errors/errorMessages";
import {
  buildClickHouseLogComment,
  normalizeClickHouseQueryTags,
  type ClickHouseQueryTags,
  type NormalizedClickHouseQueryTags,
} from "../clickhouse/queryTags";

/**
 * Re-exported so callers can build `Array(Tuple(...))` query parameters without
 * importing `@clickhouse/client` directly (e.g. composite `(col_a, col_b) IN`
 * predicates). A plain JS array serializes as an `Array`; `TupleParam` is what
 * renders each element as a `(...)` tuple, with string contents escaped.
 */
export { TupleParam } from "@clickhouse/client";

/**
 * Custom error class for ClickHouse resource-related errors
 */
// Error type configuration map
const ERROR_TYPE_CONFIG: Record<
  "MEMORY_LIMIT" | "OVERCOMMIT" | "TIMEOUT",
  {
    discriminators: string[];
  }
> = {
  MEMORY_LIMIT: {
    discriminators: ["memory limit exceeded"],
  },
  OVERCOMMIT: {
    discriminators: ["OvercommitTracker"],
  },
  TIMEOUT: {
    discriminators: ["Timeout", "timeout", "timed out"],
  },
};

type ErrorType = keyof typeof ERROR_TYPE_CONFIG;

export class ClickHouseResourceError extends Error {
  static ERROR_ADVICE_MESSAGE = RESOURCE_LIMIT_ERROR_MESSAGE;

  public readonly errorType: ErrorType;
  public readonly tags?: NormalizedClickHouseQueryTags;

  constructor(
    errType: ErrorType,
    originalError: Error,
    tags?: NormalizedClickHouseQueryTags,
  ) {
    super(originalError.message, { cause: originalError });
    this.name = "ClickHouseResourceError";
    this.errorType = errType;
    this.tags = tags;
    // Preserve the original stack trace if available
    if (originalError.stack) {
      this.stack = originalError.stack;
    }
  }

  static wrapIfResourceError(
    originalError: Error,
    tags?: NormalizedClickHouseQueryTags,
  ): Error {
    const errorMessage = originalError.message || "";

    for (const [type, config] of Object.entries(ERROR_TYPE_CONFIG) as Array<
      [
        keyof typeof ERROR_TYPE_CONFIG,
        (typeof ERROR_TYPE_CONFIG)[keyof typeof ERROR_TYPE_CONFIG],
      ]
    >) {
      const hasDiscriminator = config.discriminators.some((discriminator) =>
        errorMessage.includes(discriminator),
      );

      if (hasDiscriminator) {
        return new ClickHouseResourceError(type, originalError, tags);
      }
    }

    return originalError;
  }
}

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

/**
 * Guard against reads from the legacy 'events' table.
 * Reads must use events_core or events_full instead.
 * Matches "FROM events" or "JOIN events" as a standalone table name
 * (not events_core, events_full, or CTE aliases like filtered_events).
 */
const LEGACY_EVENTS_TABLE_PATTERN = /\b(?:from|join)\s+events\b(?!_)/i;

function assertNoLegacyEventsRead(query: string): void {
  if (LEGACY_EVENTS_TABLE_PATTERN.test(query)) {
    throw new Error(
      `Reading from legacy 'events' table is forbidden. Use events_core or events_full. Query: ${query.slice(0, 200)}`,
    );
  }
}

export async function upsertClickhouse<
  T extends Record<string, unknown>,
>(opts: {
  table: "scores" | "traces" | "observations" | "traces_null";
  records: T[];
  eventBodyMapper: (body: T) => Record<string, unknown>;
  tags?: ClickHouseQueryTags;
}): Promise<void> {
  return await instrumentAsync(
    { name: "clickhouse-upsert", spanKind: SpanKind.CLIENT },
    async (span) => {
      // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
      span.setAttribute("ch.query.table", opts.table);
      span.setAttribute("db.system", "clickhouse");
      span.setAttribute("db.operation.name", "UPSERT");

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
          const entityType = getClickhouseEntityType(eventType);
          const bucketPath = `${buildEventBucketPrefix({
            projectId: String(record.project_id),
            entityType,
            entityId: String(record.id),
          })}${eventId}.json`;

          if (env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true") {
            // Write new file directly to ClickHouse. We don't use the ClickHouse writer here as we expect more limited traffic
            // and are not worried that much about latency.
            await clickhouseClient().insert({
              table: "blob_storage_file_log",
              values: [
                {
                  id: randomUUID(),
                  project_id: record.project_id,
                  entity_type: entityType,
                  entity_id: record.id,
                  event_id: eventId,
                  bucket_name: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
                  bucket_path: bucketPath,
                  event_ts: convertDateToClickhouseDateTime(new Date()),
                  is_deleted: 0,
                },
              ],
              format: "JSONEachRow",
              clickhouse_settings: {
                log_comment: buildClickHouseLogComment(opts.tags),
              },
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

      const res = await clickhouseClient().insert({
        table: opts.table,
        values: opts.records.map((record) => ({
          ...record,
          event_ts: convertDateToClickhouseDateTime(new Date()),
        })),
        format: "JSONEachRow",
        clickhouse_settings: {
          log_comment: buildClickHouseLogComment(opts.tags),
        },
      });
      // same logic as for prisma. we want to see queries in development
      if (env.NODE_ENV === "development") {
        logger.info(`clickhouse:insert ${res.query_id} ${opts.table}`);
      }

      span.setAttribute("ch.queryId", res.query_id);

      // add summary headers to the span. Helps to tune performance
      const summaryHeader = res.response_headers["x-clickhouse-summary"];
      if (summaryHeader) {
        try {
          const summary = Array.isArray(summaryHeader)
            ? JSON.parse(summaryHeader[0])
            : JSON.parse(summaryHeader);
          for (const key in summary) {
            span.setAttribute(`ch.${key}`, summary[key]);
          }
        } catch (error) {
          logger.debug(
            `Failed to parse clickhouse summary header ${summaryHeader}`,
            error,
          );
        }
      }
    },
  );
}

export async function* queryClickhouseStream<T>(
  opts: ClickhouseQueryOpts,
): AsyncGenerator<T> {
  if (!opts.allowLegacyEventsRead) assertNoLegacyEventsRead(opts.query);
  const normalizedTags = normalizeClickHouseQueryTags(opts.tags);
  const tracer = getTracer("clickhouse-query-stream");
  const span = tracer.startSpan("clickhouse-query-stream", {
    kind: SpanKind.CLIENT,
  });

  let queryId: string | undefined;

  try {
    setSpanQueryAttributes(span, opts.query);

    const res = await context
      .with(trace.setSpan(context.active(), span), () =>
        sendClickhouseQuery({ ...opts, format: "JSONEachRow", span }),
      )
      .catch((error) => {
        throw ClickHouseResourceError.wrapIfResourceError(
          error as Error,
          normalizedTags,
        );
      });

    queryId = res.query_id;
    span.setAttribute("ch.queryId", queryId);

    for await (const rows of res.stream<T>()) {
      for (const row of rows) {
        yield handleExceptionRow(row.json());
      }
    }
  } catch (error) {
    if (error instanceof ClickHouseResourceError) {
      const enriched = enrichWithQueryId(error, queryId);
      throw enriched === error
        ? error
        : new ClickHouseResourceError(
            error.errorType,
            enriched,
            normalizedTags,
          );
    }
    throw ClickHouseResourceError.wrapIfResourceError(
      enrichWithQueryId(error as Error, queryId),
      normalizedTags,
    );
  } finally {
    span.end();
  }
}

/**
 * Raw passthrough read for the blob-export path (LFE-10402): yields each row's
 * unparsed JSONEachRow text (no trailing newline) instead of its parsed object.
 * Skips the per-row `JSON.parse` (`row.json()`) and lets the caller skip the
 * re-serialize step — the dominant CPU cost on large exports — while reusing the
 * exact same client machinery as {@link queryClickhouseStream}, including its
 * built-in mid-stream exception detection. A failed query therefore throws here,
 * just like the parsed path, so the pipeline aborts instead of emitting a
 * truncated object — no out-of-band system.query_log check needed.
 *
 * IMPORTANT: that mid-stream detection only works on ClickHouse >= 25.11 (it
 * relies on the `x-clickhouse-exception-tag` response header). On older servers
 * a query that fails after a 200 response is NOT detected and this can silently
 * yield a truncated object. The only caller (blob raw-passthrough export) is an
 * experimental, per-project opt-in gated on that version — see
 * RAW_PASSTHROUGH_MIN_CLICKHOUSE_VERSION in features/analytics-integrations.
 */
export async function* queryClickhouseStreamRawText(
  opts: ClickhouseQueryOpts,
): AsyncGenerator<string> {
  if (!opts.allowLegacyEventsRead) assertNoLegacyEventsRead(opts.query);
  const normalizedTags = normalizeClickHouseQueryTags(opts.tags);
  const tracer = getTracer("clickhouse-query-stream-raw-text");
  const span = tracer.startSpan("clickhouse-query-stream-raw-text", {
    kind: SpanKind.CLIENT,
  });

  let queryId: string | undefined;

  try {
    setSpanQueryAttributes(span, opts.query);

    const res = await context
      .with(trace.setSpan(context.active(), span), () =>
        sendClickhouseQuery({ ...opts, format: "JSONEachRow", span }),
      )
      .catch((error) => {
        throw ClickHouseResourceError.wrapIfResourceError(
          error as Error,
          normalizedTags,
        );
      });

    queryId = res.query_id;
    span.setAttribute("ch.queryId", queryId);

    for await (const rows of res.stream()) {
      for (const row of rows) {
        yield row.text;
      }
    }
  } catch (error) {
    if (error instanceof ClickHouseResourceError) {
      const enriched = enrichWithQueryId(error, queryId);
      throw enriched === error
        ? error
        : new ClickHouseResourceError(
            error.errorType,
            enriched,
            normalizedTags,
          );
    }
    throw ClickHouseResourceError.wrapIfResourceError(
      enrichWithQueryId(error as Error, queryId),
      normalizedTags,
    );
  } finally {
    span.end();
  }
}

// Blob-export Parquet settings (LFE-10463). CH buffers a row group in memory and
// flushes at whichever cap hits first. The bytes cap is the real memory governor
// (auto-adapts to row width); set below CH's 512 MiB default since the dispatcher
// exports up to 4 tables concurrently (peak ≈ 4×). The row cap bounds narrow tables.
export const BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: ClickHouseSettings = {
  output_format_parquet_row_group_size: "1000000",
  output_format_parquet_row_group_size_bytes: String(128 * 1024 * 1024), // 128 MiB
};

export type ClickhouseExecRawResult = {
  queryId: string;
  // Raw response body, already wrapped by the exception-tag Transform so a
  // mid-stream failure (CH >= 25.11) errors it instead of truncating.
  stream: Readable;
  responseHeaders: Record<string, string | string[] | undefined>;
};

/**
 * Raw binary read for the blob-export Parquet path (LFE-10463). Runs the query
 * via `clickhouseClient().exec()` (returns the unparsed HTTP body as a
 * {@link Readable}) and appends `FORMAT <format>` to the SQL — exec has no
 * `format` param. Streams ClickHouse-native Parquet bytes straight to upload,
 * offloading columnar encoding + compression to ClickHouse.
 *
 * `exec()` skips the ResultSet machinery and its mid-stream exception detection,
 * so we restore it by piping through {@link ClickhouseExecExceptionTagTransform}
 * — the stream errors on a failed query, aborting the upload before any commit.
 * Detection needs CH >= 25.11 (exception-tag header); the only caller is an
 * experimental per-project opt-in with the same caveat as raw passthrough — see
 * RAW_PASSTHROUGH_MIN_CLICKHOUSE_VERSION. Pass Parquet tuning via `clickhouseSettings`.
 */
export async function queryClickhouseExecRaw(
  opts: ClickhouseQueryOpts & { format: string },
): Promise<ClickhouseExecRawResult> {
  if (!opts.allowLegacyEventsRead) assertNoLegacyEventsRead(opts.query);
  const normalizedTags = normalizeClickHouseQueryTags(opts.tags);
  const tracer = getTracer("clickhouse-query-exec-raw");
  const span = tracer.startSpan("clickhouse-query-exec-raw", {
    kind: SpanKind.CLIENT,
  });

  let queryId: string | undefined;

  try {
    const queryWithFormat = `${opts.query}\nFORMAT ${opts.format}`;
    setSpanQueryAttributes(span, queryWithFormat);

    const res = await context
      .with(trace.setSpan(context.active(), span), () =>
        clickhouseClient(
          opts.clickhouseConfigs,
          opts.preferredClickhouseService,
        ).exec({
          query: queryWithFormat,
          query_params: opts.params,
          use_multipart_params_auto: opts.useMultipartParamsAuto,
          clickhouse_settings: {
            ...opts.clickhouseSettings,
            log_comment: JSON.stringify(normalizedTags),
          },
        }),
      )
      .catch((error) => {
        throw ClickHouseResourceError.wrapIfResourceError(
          enrichWithQueryId(error as Error, queryId),
          normalizedTags,
        );
      });

    queryId = res.query_id;
    span.setAttribute("ch.queryId", queryId);
    for (const [key, value] of Object.entries(normalizedTags)) {
      span.setAttribute(`ch.tag.${key}`, value);
    }
    recordSummaryOnSpan(span, res.response_headers);

    if (env.NODE_ENV === "development") {
      logger.info(`clickhouse:exec ${res.query_id} ${queryWithFormat}`);
    }

    const exceptionTag = res.response_headers[EXCEPTION_TAG_HEADER_NAME] as
      | string
      | undefined;

    const guardedStream = res.stream.pipe(
      new ClickhouseExecExceptionTagTransform({
        exceptionTag,
        wrapError: (error) =>
          ClickHouseResourceError.wrapIfResourceError(
            enrichWithQueryId(error, queryId),
            normalizedTags,
          ),
      }),
    );

    // The span outlives this function (it covers the consumer's read). Forward
    // source errors so the consumer sees them.
    res.stream.on("error", (error) => guardedStream.destroy(error));
    // `.pipe()` only wires src→dest, so destroying guardedStream (e.g. the
    // worker's pipeline aborting on an upload failure) would leave the live CH
    // body streaming into an unread socket — pinning a connection slot and query
    // thread until the request timeout. 'close' fires on every termination path
    // (end, error, no-arg destroy); span.end() is idempotent.
    guardedStream.once("close", () => {
      span.end();
      if (!res.stream.destroyed) res.stream.destroy();
    });

    return {
      queryId,
      stream: guardedStream,
      responseHeaders: res.response_headers,
    };
  } catch (error) {
    span.end();
    if (error instanceof ClickHouseResourceError) throw error;
    throw ClickHouseResourceError.wrapIfResourceError(
      enrichWithQueryId(error as Error, queryId),
      normalizedTags,
    );
  }
}

function enrichWithQueryId(error: Error, queryId: string | undefined): Error {
  if (!queryId) return error;
  const enriched = new Error(`${error.message} [query_id: ${queryId}]`, {
    cause: error,
  });
  enriched.stack = error.stack;
  return enriched;
}

/**
 * ClickHouse has a quirk when it comes to handling exceptions mid response.
 * It will simply output a row with "exception" key inside, which is indistinguishable from
 * a query like `SELECT "my lovely string" AS exception;` may return.
 *
 * E.g.:
 * ```
 * {"exception":"Code: 395. DB::Exception: memory limit exceeded: would use l0.23 GiB"}
 * ```
 *
 * This function makes the best effort to convert such rows into errors and throws them.
 *
 * See:
 * - https://github.com/ClickHouse/clickhouse-js/issues/332
 * - https://github.com/ClickHouse/ClickHouse/issues/75175
 *
 * Ideally this should get fixed in the future versions of ClickHouse.
 */
function handleExceptionRow<T>(parsedRow: T): T {
  if (
    typeof parsedRow === "object" &&
    parsedRow !== null &&
    Object.keys(parsedRow).length === 1 &&
    "exception" in parsedRow
  ) {
    const potentialException = (parsedRow as { exception: string }).exception;
    if (potentialException.match(/^Code: (\d+)/)) {
      logger.error(
        `[clickhouse] Exception row detected: ${potentialException}`,
        parsedRow,
      );
      throw new Error(potentialException);
    }
  }
  return parsedRow;
}

export type ClickhouseQueryOpts = {
  query: string;
  params?: Record<string, unknown>;
  useMultipartParamsAuto?: boolean;
  clickhouseConfigs?: NodeClickHouseClientConfigOptions;
  tags?: ClickHouseQueryTags;
  preferredClickhouseService?: PreferredClickhouseService;
  clickhouseSettings?: ClickHouseSettings;
  allowLegacyEventsRead?: boolean;
};

function recordSummaryOnSpan(
  span: Span,
  responseHeaders: Record<string, string | string[] | undefined>,
): void {
  const summaryHeader = responseHeaders["x-clickhouse-summary"];
  if (!summaryHeader) return;
  try {
    const summary = Array.isArray(summaryHeader)
      ? JSON.parse(summaryHeader[0])
      : JSON.parse(summaryHeader);
    for (const key in summary) {
      span.setAttribute(`ch.${key}`, summary[key]);
    }
  } catch (error) {
    logger.debug(
      `Failed to parse clickhouse summary header ${summaryHeader}`,
      error,
    );
  }
}

function setSpanQueryAttributes(span: Span, query: string): void {
  span.setAttribute("ch.query.text", query);
  span.setAttribute("db.system", "clickhouse");
  span.setAttribute("db.query.text", query);
  span.setAttribute("db.operation.name", "SELECT");
}

async function sendClickhouseQuery<F extends DataFormat>(opts: {
  query: string;
  params?: Record<string, unknown>;
  useMultipartParamsAuto?: boolean;
  clickhouseConfigs?: NodeClickHouseClientConfigOptions;
  tags?: ClickHouseQueryTags;
  preferredClickhouseService?: PreferredClickhouseService;
  clickhouseSettings?: ClickHouseSettings;
  format: F;
  span: Span;
}) {
  const normalizedTags = normalizeClickHouseQueryTags(opts.tags);
  const res = await clickhouseClient(
    opts.clickhouseConfigs,
    opts.preferredClickhouseService,
  ).query({
    query: opts.query,
    format: opts.format,
    query_params: opts.params,
    use_multipart_params_auto: opts.useMultipartParamsAuto,
    clickhouse_settings: {
      ...opts.clickhouseSettings,
      log_comment: JSON.stringify(normalizedTags),
    },
  });

  if (env.NODE_ENV === "development") {
    logger.info(`clickhouse:query ${res.query_id} ${opts.query}`);
  }

  opts.span.setAttribute("ch.queryId", res.query_id);
  for (const [key, value] of Object.entries(normalizedTags)) {
    opts.span.setAttribute(`ch.tag.${key}`, value);
  }
  recordSummaryOnSpan(opts.span, res.response_headers);

  return res;
}

/**
 * Determines if an error is retryable (socket hang up, connection reset, broken pipe, etc.)
 */
function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const errorMessage = (error as Error).message?.toLowerCase() || "";

  // Check for socket hang up and other network-related errors
  const retryablePatterns = [
    "socket hang up",
    "broken pipe",
    "connection reset",
    "econnreset",
    "network_error",
    "etimedout",
    "econnrefused",
  ];

  return retryablePatterns.some((pattern) => errorMessage.includes(pattern));
}

export async function queryClickhouse<T>(
  opts: ClickhouseQueryOpts,
): Promise<T[]> {
  if (!opts.allowLegacyEventsRead) assertNoLegacyEventsRead(opts.query);
  const normalizedTags = normalizeClickHouseQueryTags(opts.tags);
  return await instrumentAsync(
    { name: "clickhouse-query", spanKind: SpanKind.CLIENT },
    async (span) => {
      setSpanQueryAttributes(span, opts.query);

      return await backOff(
        async () => {
          const res = await sendClickhouseQuery({
            ...opts,
            clickhouseSettings: {
              asterisk_include_alias_columns: 1,
              asterisk_include_materialized_columns: 1,
              ...opts.clickhouseSettings,
            },
            format: "JSONEachRow",
            span,
          });
          return (await res.json<T>()).map(handleExceptionRow);
        },
        {
          numOfAttempts: env.LANGFUSE_CLICKHOUSE_QUERY_MAX_ATTEMPTS,
          retry: (error: Error, attemptNumber: number) => {
            const shouldRetry = isRetryableError(error);
            if (shouldRetry) {
              logger.warn(
                `ClickHouse query failed with retryable error (attempt ${attemptNumber}/${env.LANGFUSE_CLICKHOUSE_QUERY_MAX_ATTEMPTS}): ${error.message}`,
                {
                  error: error.message,
                  attemptNumber,
                  tags: normalizedTags,
                },
              );
              span.addEvent("clickhouse-query-retry", {
                "retry.attempt": attemptNumber,
                "retry.error": error.message,
              });
            } else {
              logger.error(
                `ClickHouse query failed with non-retryable error: ${error.message}`,
                {
                  error: error.message,
                  tags: normalizedTags,
                },
              );
            }
            return shouldRetry;
          },
          startingDelay: 100,
          timeMultiple: 1,
          maxDelay: 100,
        },
      ).catch((error) => {
        throw ClickHouseResourceError.wrapIfResourceError(
          error as Error,
          normalizedTags,
        );
      });
    },
  );
}

export async function* queryClickhouseWithProgress<T>(
  opts: ClickhouseQueryOpts,
): AsyncGenerator<RowOrProgress<T>> {
  if (!opts.allowLegacyEventsRead) assertNoLegacyEventsRead(opts.query);
  const normalizedTags = normalizeClickHouseQueryTags(opts.tags);

  const tracer = getTracer("clickhouse-query-progress");
  const span = tracer.startSpan("clickhouse-query-progress", {
    kind: SpanKind.CLIENT,
  });

  try {
    setSpanQueryAttributes(span, opts.query);

    const res = await context
      .with(trace.setSpan(context.active(), span), () =>
        sendClickhouseQuery({
          ...opts,
          clickhouseSettings: {
            asterisk_include_alias_columns: 1,
            asterisk_include_materialized_columns: 1,
            ...opts.clickhouseSettings,
          },
          format: "JSONEachRowWithProgress",
          span,
        }),
      )
      .catch((error) => {
        throw ClickHouseResourceError.wrapIfResourceError(
          error as Error,
          normalizedTags,
        );
      });

    for await (const rows of res.stream()) {
      for (const row of rows) {
        yield row.json() as RowOrProgress<T>;
      }
    }
  } catch (error) {
    if (error instanceof ClickHouseResourceError) throw error;
    throw ClickHouseResourceError.wrapIfResourceError(
      error as Error,
      normalizedTags,
    );
  } finally {
    span.end();
  }
}

export async function commandClickhouse(opts: {
  query: string;
  params?: Record<string, unknown> | undefined;
  clickhouseConfigs?: NodeClickHouseClientConfigOptions;
  tags?: ClickHouseQueryTags;
  queryId?: string;
  clickhouseSettings?: ClickHouseSettings;
  abortSignal?: AbortSignal;
  session_id?: string;
}): Promise<void> {
  return await instrumentAsync(
    { name: "clickhouse-command", spanKind: SpanKind.CLIENT },
    async (span) => {
      // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
      span.setAttribute("ch.query.text", opts.query);
      span.setAttribute("db.system", "clickhouse");
      span.setAttribute("db.query.text", opts.query);
      span.setAttribute("db.operation.name", "COMMAND");
      const normalizedTags = normalizeClickHouseQueryTags(opts.tags);

      const res = await clickhouseClient(opts.clickhouseConfigs).command({
        query: opts.query,
        query_params: opts.params,
        ...(opts.session_id ? { session_id: opts.session_id } : {}),
        ...(opts.queryId ? { query_id: opts.queryId } : {}),
        ...(opts.abortSignal ? { abort_signal: opts.abortSignal } : {}),
        clickhouse_settings: {
          ...opts.clickhouseSettings,
          log_comment: JSON.stringify(normalizedTags),
        },
      });
      // same logic as for prisma. we want to see queries in development
      if (env.NODE_ENV === "development") {
        logger.info(`clickhouse:query ${res.query_id} ${opts.query}`);
      }

      span.setAttribute("ch.queryId", res.query_id);
      for (const [key, value] of Object.entries(normalizedTags)) {
        span.setAttribute(`ch.tag.${key}`, value);
      }

      // add summary headers to the span. Helps to tune performance
      const summaryHeader = res.response_headers["x-clickhouse-summary"];
      if (summaryHeader) {
        try {
          const summary = Array.isArray(summaryHeader)
            ? JSON.parse(summaryHeader[0])
            : JSON.parse(summaryHeader);
          for (const key in summary) {
            span.setAttribute(`ch.${key}`, summary[key]);
          }
        } catch (error) {
          logger.debug(
            `Failed to parse clickhouse summary header ${summaryHeader}`,
            error,
          );
        }
      }
    },
  );
}

export {
  isProgressRow,
  isRow,
  isException,
  type RowOrProgress,
} from "@clickhouse/client";

export function parseClickhouseUTCDateTimeFormat(dateStr: string): Date {
  return new Date(`${dateStr.replace(" ", "T")}Z`);
}

export function clickhouseCompliantRandomCharacters() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  const randomArray = new Uint8Array(5);
  crypto.getRandomValues(randomArray);
  randomArray.forEach((number) => {
    result += chars[number % chars.length];
  });
  return result;
}
