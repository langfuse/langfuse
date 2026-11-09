import { describe, expect, it } from "vitest";
import { PreparedEvent, validateOtelJson } from "@langfuse/native";

describe("Native OTEL batch NAPI boundary", () => {
  it("associates sparse lookup results with their events and retains events needing no I/O", async () => {
    const selectedTraceId = "0123456789abcdef0123456789abcdef";
    const unselectedTraceId = "fedcba9876543210fedcba9876543210";
    const spans = [0, 1, 2].map((index) => ({
      traceId: index === 2 ? unselectedTraceId : selectedTraceId,
      spanId: `0123456789abcde${index}`,
      name: "sparse-lookups".repeat(1000),
      startTimeUnixNano: "1750000000000000000",
      endTimeUnixNano: "1750000001000000000",
      attributes:
        index === 1
          ? [
              {
                key: "gen_ai.request.model",
                value: { stringValue: "test-model" },
              },
            ]
          : [],
    }));
    const validated = await validateOtelJson(
      Buffer.from(JSON.stringify([{ resource: {}, scopeSpans: [{ spans }] }])),
    );
    const batch = await validated.extract(true);
    const {
      batch: processing,
      mediaRequests,
      lookupRequests,
    } = await batch.process({
      projectId: "native-boundary",
      fileKey: "sparse-lookups.json",
      now: "2026-09-24T00:00:00.000Z",
      ingestionApiKey: "",
      ingestionSdkName: "test",
      ingestionSdkVersion: "test",
      isLangfuseInternal: false,
    });
    try {
      await expect(batch.copyJsonBuffer()).rejects.toMatchObject({
        code: "ERR_OTEL_CLOSED",
      });
      expect(mediaRequests).toEqual([]);
      expect(lookupRequests).toMatchObject([
        { spanId: "0123456789abcde1", modelName: "test-model" },
      ]);
      await expect(
        processing.complete([], [], undefined, true),
      ).rejects.toThrow("incomplete OTEL lookup results");
      const { finalized } = await processing.complete(
        [],
        [{ model: { id: "matched-model" } }],
        undefined,
        true,
        [selectedTraceId],
      );
      expect(finalized).toBeDefined();
      expect(finalized!.evaluationRows).toMatchObject([
        { span_id: "0123456789abcde0", model_id: null },
        { span_id: "0123456789abcde1", model_id: "matched-model" },
        { span_id: "0123456789abcde2", model_id: null },
      ]);
      expect(finalized!.events).toHaveLength(3);
      expect(finalized!.events[0]?.serializedEventBytes).toBeGreaterThan(
        Buffer.byteLength(spans[0].name),
      );
      expect(finalized!.events[2]?.serializedEventBytes).toBeUndefined();
      expect(
        PreparedEvent.columns().some(({ name }) => name === "event_bytes"),
      ).toBe(false);
    } finally {
      await processing.dispose();
      await batch.dispose();
      await validated.dispose();
    }
  });

  it("rejects the entire Rust batch when an event cannot fit the storage schema", async () => {
    // A usage count of 1e30 exceeds ClickHouse's UInt64 maximum. Finalization must
    // reject the whole batch so all its observations remain eligible for retry.
    const spans = [1, 1e30].map((usage, index) => ({
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: `0123456789abcde${index}`,
      name: "storage-boundary",
      startTimeUnixNano: "1750000000000000000",
      endTimeUnixNano: "1750000001000000000",
      attributes: [
        {
          key: "langfuse.observation.usage_details",
          value: { stringValue: JSON.stringify({ input: usage }) },
        },
      ],
    }));
    const validated = await validateOtelJson(
      Buffer.from(JSON.stringify([{ resource: {}, scopeSpans: [{ spans }] }])),
    );
    const batch = await validated.extract(true);
    const {
      batch: processing,
      mediaRequests,
      lookupRequests,
    } = await batch.process({
      projectId: "native-boundary",
      fileKey: "storage-boundary.json",
      now: "2026-09-24T00:00:00.000Z",
      ingestionApiKey: "",
      ingestionSdkName: "test",
      ingestionSdkVersion: "test",
      isLangfuseInternal: false,
    });
    try {
      expect(mediaRequests).toEqual([]);
      expect(lookupRequests).toEqual([]);
      await expect(
        processing.complete([], [], undefined, true),
      ).rejects.toThrow("usage_details");
    } finally {
      await processing.dispose();
      await batch.dispose();
      await validated.dispose();
    }
  });
});
