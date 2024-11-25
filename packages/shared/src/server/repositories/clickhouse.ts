import { env } from "../../env";
import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
} from "../clickhouse/client";
import { logger } from "../logger";
import { instrumentAsync } from "../instrumentation";
import {
  StorageService,
  StorageServiceFactory,
} from "../services/StorageService";
import { randomUUID } from "crypto";
import { getClickhouseEntityType } from "../clickhouse/schemaUtils";
import { NodeClickHouseClientConfigOptions } from "@clickhouse/client/dist/config";

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
    });
  }
  return s3StorageServiceClient;
};

export async function upsertClickhouse<
  T extends Record<string, unknown>,
>(opts: {
  table: "scores" | "traces" | "observations";
  records: T[];
  eventBodyMapper: (body: T) => Record<string, unknown>;
}): Promise<void> {
  return await instrumentAsync({ name: "clickhouse-upsert" }, async (span) => {
    // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
    span.setAttribute("ch.query.table", opts.table);

    // If event upload is enabled, we store all rows in S3 to have a backup
    if (env.LANGFUSE_S3_EVENT_UPLOAD_ENABLED === "true") {
      if (env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET === undefined) {
        throw new Error("S3 event store is enabled but no bucket is set");
      }
      const s3Client = getS3StorageServiceClient(
        env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      );
      await Promise.all(
        opts.records.map((record) => {
          // drop trailing s and pretend it's always a create.
          // Only applicable to scores and traces.
          let eventType = `${opts.table.slice(0, -1)}-create`;
          if (opts.table === "observations") {
            // @ts-ignore - If it's an observation we now that `type` is a string
            eventType = `${record["type"].toLowerCase()}-create`;
          }
          s3Client.uploadJson(
            `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${record.project_id}/${getClickhouseEntityType(eventType)}/${record.id}/${randomUUID()}.json`,
            [
              {
                id: randomUUID(),
                timestamp: new Date().toISOString(),
                type: eventType,
                body: opts.eventBodyMapper(record),
              },
            ],
          );
        }),
      );
    }

    const res = await clickhouseClient().insert({
      table: opts.table,
      values: opts.records.map((record) => ({
        ...record,
        event_ts: convertDateToClickhouseDateTime(new Date()),
      })),
      format: "JSONEachRow",
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
  });
}

export async function queryClickhouse<T>(opts: {
  query: string;
  params?: Record<string, unknown> | undefined;
  clickhouseConfigs?: NodeClickHouseClientConfigOptions;
}): Promise<T[]> {
  return await instrumentAsync({ name: "clickhouse-query" }, async (span) => {
    // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
    span.setAttribute("ch.query.text", opts.query);

    const res = await clickhouseClient(opts.clickhouseConfigs).query({
      query: opts.query,
      format: "JSONEachRow",
      query_params: opts.params,
    });
    // same logic as for prisma. we want to see queries in development
    if (env.NODE_ENV === "development") {
      logger.info(`clickhouse:query ${res.query_id} ${opts.query}`);
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

    return await res.json<T>();
  });
}

export async function commandClickhouse<T>(opts: {
  query: string;
  params?: Record<string, unknown> | undefined;
  clickhouseConfigs?: NodeClickHouseClientConfigOptions;
}): Promise<void> {
  return await instrumentAsync({ name: "clickhouse-command" }, async (span) => {
    // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
    span.setAttribute("ch.query.text", opts.query);
    const res = await clickhouseClient(opts.clickhouseConfigs).command({
      query: opts.query,
      query_params: opts.params,
    });
    // same logic as for prisma. we want to see queries in development
    if (env.NODE_ENV === "development") {
      logger.info(`clickhouse:query ${res.query_id} ${opts.query}`);
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
  });
}

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
