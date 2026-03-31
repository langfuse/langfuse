/**
 * Tests for OTel metadata processing
 * Flow: ResourceSpan -> processToEvent() -> createEventRecord() -> metadata_names/metadata_raw_values
 *
 * NOTE: The dual-write path (otel-dual-write) uses mapKeys() in SQL which doesn't flatten.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  metadataArraysToRecord,
  OtelIngestionProcessor,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { IngestionService } from "../../services/IngestionService";
import * as clickhouseWriterExports from "../../services/ClickhouseWriter";

// vi.hoisted ensures this is declared before vi.mock's hoisted factory runs.
// Without it, the variable would be undefined when the factory executes.
const { mockAddToClickhouseWriter } = vi.hoisted(() => ({
  mockAddToClickhouseWriter: vi.fn(),
}));
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

function buildOtelSpan(params: {
  scopeVersion: string;
  resourceAttrKey: string;
  resourceAttrValue: string;
  scopeAttrKey: string;
  scopeAttrValue: string;
  metadataAttrs: Array<{ key: string; value: Record<string, unknown> }>;
}) {
  return {
    resource: {
      attributes: [
        {
          key: params.resourceAttrKey,
          value: { stringValue: params.resourceAttrValue },
        },
      ],
    },
    scopeSpans: [
      {
        scope: {
          name: "langfuse-sdk",
          version: params.scopeVersion,
          attributes: [
            {
              key: params.scopeAttrKey,
              value: { stringValue: params.scopeAttrValue },
            },
          ],
        },
        spans: [
          {
            traceId: createBufferId("aabbccdd11223344aabbccdd11223344"),
            spanId: createBufferId("1122334455667788"),
            name: "test-span",
            kind: 1,
            startTimeUnixNano: createNanoTimestamp(BigInt(1714488530686000000)),
            endTimeUnixNano: createNanoTimestamp(BigInt(1714488530687000000)),
            attributes: [
              {
                key: "langfuse.observation.type",
                value: { stringValue: "span" },
              },
              ...params.metadataAttrs.map((attr) => ({
                key: `langfuse.observation.metadata.${attr.key}`,
                value: attr.value,
              })),
            ],
            status: {},
          },
        ],
      },
    ],
  };
}

async function processAndCreateEvent(
  otelSpan: ReturnType<typeof buildOtelSpan>,
) {
  const processor = new OtelIngestionProcessor({ projectId: "test-project" });
  const eventInputs = processor.processToEvent([otelSpan]);
  expect(eventInputs.length).toBeGreaterThan(0);

  const eventRecord = await ingestionService.createEventRecord(
    eventInputs[0],
    "test/otel/test.json",
  );

  console.log("metadata_names:", JSON.stringify(eventRecord.metadata_names));
  console.log("metadata_values:", JSON.stringify(eventRecord.metadata_values));

  const nameToValue = metadataArraysToRecord(
    eventRecord.metadata_names,
    eventRecord.metadata_values,
  );

  return { eventRecord, nameToValue };
}

describe("OTel metadata processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("flattening", () => {
    it("flattens resource/scope attrs to dot-notation (SDK v4.0)", async () => {
      const { nameToValue } = await processAndCreateEvent(
        buildOtelSpan({
          scopeVersion: "4.0.0",
          resourceAttrKey: "service.name",
          resourceAttrValue: "svc-a",
          scopeAttrKey: "public_key",
          scopeAttrValue: "pk-test",
          metadataAttrs: [{ key: "env", value: { stringValue: "prod" } }],
        }),
      );

      console.log("nameToValue:", JSON.stringify(nameToValue));

      expect(nameToValue["resourceAttributes.service.name"]).toBe("svc-a");
      expect(nameToValue["scope.attributes.public_key"]).toBe("pk-test");
      expect(nameToValue["env"]).toBe("prod");
      expect(nameToValue["resourceAttributes"]).toBeUndefined();
      expect(nameToValue["scope.attributes"]).toBeUndefined();
    });

    it("flattens resource/scope attrs to dot-notation (SDK v3.8)", async () => {
      const { nameToValue } = await processAndCreateEvent(
        buildOtelSpan({
          scopeVersion: "3.8.1",
          resourceAttrKey: "service.name",
          resourceAttrValue: "svc-b",
          scopeAttrKey: "public_key",
          scopeAttrValue: "pk-legacy",
          metadataAttrs: [{ key: "topic", value: { stringValue: "test" } }],
        }),
      );

      expect(nameToValue["resourceAttributes.service.name"]).toBe("svc-b");
      expect(nameToValue["scope.attributes.public_key"]).toBe("pk-legacy");
      expect(nameToValue["topic"]).toBe("test");
      expect(nameToValue["resourceAttributes"]).toBeUndefined();
      expect(nameToValue["scope.attributes"]).toBeUndefined();
    });
  });
});
