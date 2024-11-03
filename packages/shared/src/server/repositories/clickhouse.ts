import { JsonNested } from "../../utils/zod";
import { env } from "../../env";
import { clickhouseClient } from "../clickhouse/client";
import { logger } from "../logger";
import { getCurrentSpan, instrumentAsync } from "../instrumentation";

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
  return await instrumentAsync({ name: "clickhouse-query" }, async (span) => {
    // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
    span.setAttribute("ch.query.text", opts.query);

    // same logic as for prisma. we want to see queries in development

    const res = await clickhouseClient.query({
      query: opts.query,
      format: "JSONEachRow",
      query_params: opts.params,
    });

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

export function parseClickhouseUTCDateTimeFormat(dateStr: string): Date {
  return new Date(`${dateStr.replace(" ", "T")}Z`);
}
