/**
 * Test that nested metadata from OTel spans is properly flattened
 * into dot-notation keys in metadata_names/metadata_raw_values.
 *
 * Flow tested:
 * ResourceSpan -> processToEvent() -> createEventRecord() -> metadata_names/metadata_raw_values
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { OtelIngestionProcessor } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { IngestionService } from "../../services/IngestionService";
import * as clickhouseWriterExports from "../../services/ClickhouseWriter";

// Mock ClickhouseWriter to avoid actual database writes
const mockAddToClickhouseWriter = vi.fn();
vi.mock("../../services/ClickhouseWriter", async (importOriginal) => {
  const original = (await importOriginal()) as object;
  return {
    ...original,
    ClickhouseWriter: {
      getInstance: () => ({
        addToQueue: mockAddToClickhouseWriter,
      }),
    },
  };
});

// Mock ClickhouseClient to return empty results (no existing records)
const mockClickhouseClient = {
  query: async () => ({
    json: async () => [],
    query_id: "test-query-id",
    response_headers: { "x-clickhouse-summary": "[]" },
  }),
};

const ingestionService = new IngestionService(
  null as any,
  prisma,
  clickhouseWriterExports.ClickhouseWriter.getInstance() as any,
  mockClickhouseClient as any,
);

function createNanoTimestamp(nanoTime: bigint): {
  low: number;
  high: number;
  unsigned: boolean;
} {
  const low = Number(nanoTime & BigInt(0xffffffff));
  const high = Number(nanoTime >> BigInt(32));
  return { low, high, unsigned: true };
}

function createBufferId(hexString: string): { type: "Buffer"; data: number[] } {
  const buffer = Buffer.from(hexString, "hex");
  return { type: "Buffer", data: Array.from(buffer) };
}

describe("OTel metadata flattening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should flatten nested metadata objects into dot-notation keys", async () => {
    // This mirrors real production metadata with nested objects
    const otelSpan = {
      resource: {
        attributes: [
          {
            key: "telemetry.sdk.language",
            value: { stringValue: "python" },
          },
          {
            key: "telemetry.sdk.name",
            value: { stringValue: "opentelemetry" },
          },
          {
            key: "telemetry.sdk.version",
            value: { stringValue: "1.38.0" },
          },
          {
            key: "service.name",
            value: { stringValue: "unknown_service" },
          },
        ],
      },
      scopeSpans: [
        {
          scope: {
            name: "langfuse-sdk",
            version: "3.8.1",
            attributes: [
              {
                key: "public_key",
                value: { stringValue: "pk-lf-1234567890" },
              },
            ],
          },
          spans: [
            {
              traceId: createBufferId("aabbccdd11223344aabbccdd11223344"),
              spanId: createBufferId("1122334455667788"),
              name: "test-span",
              kind: 1,
              startTimeUnixNano: createNanoTimestamp(
                BigInt(1714488530686000000),
              ),
              endTimeUnixNano: createNanoTimestamp(BigInt(1714488530687000000)),
              attributes: [
                {
                  key: "langfuse.observation.type",
                  value: { stringValue: "span" },
                },
                // Nested metadata: resourceAttributes with nested keys
                {
                  key: "langfuse.observation.metadata.resourceAttributes",
                  value: {
                    stringValue: JSON.stringify({
                      "telemetry.sdk.language": "python",
                      "telemetry.sdk.name": "opentelemetry",
                      "telemetry.sdk.version": "1.38.0",
                      "service.name": "unknown_service",
                    }),
                  },
                },
                // Nested metadata: scopeAttributes with nested key
                {
                  key: "langfuse.observation.metadata.scopeAttributes",
                  value: {
                    stringValue: JSON.stringify({
                      public_key: "pk-lf-1234567890",
                    }),
                  },
                },
                // Flat metadata: simple string value
                {
                  key: "langfuse.observation.metadata.environment",
                  value: { stringValue: '"development"' },
                },
                // Flat metadata: simple number
                {
                  key: "langfuse.observation.metadata.langgraph_step",
                  value: { stringValue: "2" },
                },
              ],
              status: {},
            },
          ],
        },
      ],
    };

    const processor = new OtelIngestionProcessor({
      projectId: "test-project",
    });
    const eventInputs = processor.processToEvent([otelSpan]);
    expect(eventInputs.length).toBeGreaterThan(0);

    const eventRecord = await ingestionService.createEventRecord(
      eventInputs[0],
      "test/otel/test.json",
    );

    console.log("metadata_names:", JSON.stringify(eventRecord.metadata_names));
    console.log(
      "metadata_raw_values:",
      JSON.stringify(eventRecord.metadata_raw_values),
    );

    // Nested objects should be flattened to dot-notation
    expect(eventRecord.metadata_names).toContain(
      "resourceAttributes.telemetry.sdk.language",
    );
    expect(eventRecord.metadata_names).toContain(
      "resourceAttributes.service.name",
    );
    expect(eventRecord.metadata_names).toContain("scopeAttributes.public_key");

    // Flat values should remain as-is
    expect(eventRecord.metadata_names).toContain("environment");
    expect(eventRecord.metadata_names).toContain("langgraph_step");

    // First-level keys for nested objects should NOT be in the list
    // (they should be replaced by their flattened children)
    expect(eventRecord.metadata_names).not.toContain("resourceAttributes");
    expect(eventRecord.metadata_names).not.toContain("scopeAttributes");

    // Values should correspond to leaf values
    const nameToValue = Object.fromEntries(
      eventRecord.metadata_names.map((name, i) => [
        name,
        eventRecord.metadata_raw_values[i],
      ]),
    );
    expect(nameToValue["scopeAttributes.public_key"]).toBe("pk-lf-1234567890");
    expect(nameToValue["resourceAttributes.telemetry.sdk.language"]).toBe(
      "python",
    );
    expect(nameToValue["environment"]).toBe("development");
  });
});
