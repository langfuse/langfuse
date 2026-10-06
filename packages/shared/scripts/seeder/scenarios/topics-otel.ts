import { createHash } from "node:crypto";
import { z } from "zod";
import type { EventRecordInsertType } from "../../../src/server";
import { LangfuseOtelSpanAttributes as Attribute } from "../../../src/server/otel/attributes";
import { DEFAULT_SEED_API_KEY } from "../utils/postgres-seed-constants";
import { chunk, SeedError } from "./types";

export const topicOtelId = (id: string, bytes: 8 | 16): string =>
  createHash("sha256")
    .update(id)
    .digest("hex")
    .slice(0, bytes * 2);

// Seeder events use ClickHouse UTC strings without a timezone suffix.
const utcDate = (timestamp: string): Date =>
  new Date(
    timestamp.includes("T") ? timestamp : `${timestamp.replace(" ", "T")}Z`,
  );

const unixNano = (timestamp: string): string =>
  (BigInt(utcDate(timestamp).getTime()) * 1_000_000n).toString();

export function topicEventsToOtel(events: EventRecordInsertType[]) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "topics-seeder" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "topics-seeder", version: "1.0.0" },
            spans: events.map((event) => {
              const attributes: Record<string, string> = {
                [Attribute.ENVIRONMENT]: event.environment,
                [Attribute.TRACE_NAME]: event.trace_name ?? "",
                [Attribute.TRACE_TAGS]: JSON.stringify(event.tags),
                [Attribute.OBSERVATION_TYPE]: event.type.toLowerCase(),
                [Attribute.OBSERVATION_LEVEL]: event.level,
                [Attribute.OBSERVATION_INPUT]: event.input ?? "",
                [Attribute.OBSERVATION_OUTPUT]: event.output ?? "",
                [Attribute.OBSERVATION_METADATA]: JSON.stringify(
                  Object.fromEntries(
                    event.metadata_names.map((name, index) => [
                      name,
                      event.metadata_values[index],
                    ]),
                  ),
                ),
              };
              if (event.status_message)
                attributes[Attribute.OBSERVATION_STATUS_MESSAGE] =
                  event.status_message;
              if (event.user_id)
                attributes[Attribute.TRACE_USER_ID] = event.user_id;
              if (event.session_id)
                attributes[Attribute.TRACE_SESSION_ID] = event.session_id;
              if (event.completion_start_time)
                attributes[Attribute.OBSERVATION_COMPLETION_START_TIME] =
                  utcDate(event.completion_start_time).toISOString();
              if (!event.parent_span_id) {
                attributes[Attribute.TRACE_INPUT] = event.input ?? "";
                attributes[Attribute.TRACE_OUTPUT] = event.output ?? "";
              }
              return {
                traceId: event.trace_id,
                spanId: topicOtelId(event.span_id, 8),
                ...(event.parent_span_id
                  ? { parentSpanId: topicOtelId(event.parent_span_id, 8) }
                  : {}),
                name: event.name,
                kind: 1,
                startTimeUnixNano: unixNano(event.start_time),
                endTimeUnixNano: unixNano(event.end_time ?? event.start_time),
                attributes: Object.entries(attributes).map(([key, value]) => ({
                  key,
                  value: { stringValue: value },
                })),
                status: {
                  code: event.level === "ERROR" ? 2 : 1,
                  ...(event.status_message
                    ? { message: event.status_message }
                    : {}),
                },
              };
            }),
          },
        ],
      },
    ],
  };
}

const responseSchema = z.object({
  partialSuccess: z
    .object({
      rejectedSpans: z.union([z.string(), z.number()]).optional(),
      errorMessage: z.string().optional(),
    })
    .optional(),
});

export async function ingestTopicEvents(
  baseUrl: string,
  events: EventRecordInsertType[],
): Promise<void> {
  const url = new URL(baseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new SeedError("Topics OTLP seeding requires a local NEXTAUTH_URL.");
  }
  // Each fixture trace stays in one request, including its child tool span.
  const traces = Map.groupBy(events, (event) => event.trace_id);
  for (const batch of chunk([...traces.values()], 25)) {
    const response = await fetch(`${baseUrl}/api/public/otel/v1/traces`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${DEFAULT_SEED_API_KEY.public}:${DEFAULT_SEED_API_KEY.secret}`,
        ).toString("base64")}`,
        "Content-Type": "application/json",
        "x-langfuse-ingestion-version": "4",
      },
      body: JSON.stringify(topicEventsToOtel(batch.flat())),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new SeedError(
        `Topics OTLP ingestion returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
        "start the local web and worker processes with the default seeded project API key",
      );
    }
    const result = responseSchema.parse(await response.json());
    if (
      Number(result.partialSuccess?.rejectedSpans ?? 0) > 0 ||
      result.partialSuccess?.errorMessage
    ) {
      throw new SeedError(
        `Topics OTLP ingestion rejected spans: ${JSON.stringify(result.partialSuccess)}`,
      );
    }
  }
}
