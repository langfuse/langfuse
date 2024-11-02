import { JsonNested } from "../../utils/zod";
import { env } from "../../env";
import { clickhouseClient } from "../clickhouse/client";
import { logger } from "../logger";
import { getCurrentSpan } from "../instrumentation";

export const convertRecordToJsonSchema = (
  record: Record<string, string>,
): JsonNested | undefined => {
  const jsonSchema: JsonNested = {};

  // if record is empty, return undefined
  if (Object.keys(record).length === 0) {
    return undefined;
  }

  for (const key in record) {
    try {
      jsonSchema[key] = JSON.parse(record[key]);
    } catch (e) {
      jsonSchema[key] = record[key];
    }
  }

  return jsonSchema;
};

export async function queryClickhouse<T>(opts: {
  query: string;
  params?: Record<string, unknown> | undefined;
}) {
  // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
  getCurrentSpan()?.setAttribute("ch.query.text", opts.query);

  // same logic as for prisma. we want to see queries in development
  if (env.NODE_ENV === "development") {
    logger.info(`clickhouse:query ${opts.query}`);
  }

  const res = await clickhouseClient.query({
    query: opts.query,
    format: "JSONEachRow",
    query_params: opts.params,
  });

  getCurrentSpan()?.setAttribute("ch.queryId", res.query_id);

  // add summary headers to the span. Helps to tune performance
  const summaryHeader = res.response_headers["x-clickhouse-summary"];
  if (summaryHeader) {
    try {
      const summary = Array.isArray(summaryHeader)
        ? JSON.parse(summaryHeader[0])
        : JSON.parse(summaryHeader);
      for (const key in summary) {
        getCurrentSpan()?.setAttribute(`ch.${key}`, summary[key]);
      }
    } catch (error) {
      logger.debug(
        `Failed to parse clickhouse summary header ${summaryHeader}`,
        error,
      );
    }
  }

  return res.json<T>();
}

export function parseClickhouseUTCDateTimeFormat(dateStr: string): Date {
  return new Date(`${dateStr.replace(" ", "T")}Z`);
}
