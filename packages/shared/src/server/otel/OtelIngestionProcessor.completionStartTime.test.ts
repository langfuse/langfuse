import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";
import { stringDateTime } from "../ingestion/types";

describe("OtelIngestionProcessor completionStartTime", () => {
  const processor = new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "pk-test",
    sdkName: "test",
    sdkVersion: "1.0.0",
  });

  const extractCompletionStartTime = (
    attributes: Record<string, unknown>,
    startTimeISO?: string,
  ): string | null => {
    return (processor as any).extractCompletionStartTime(
      attributes,
      startTimeISO,
    );
  };

  it("handles absent completion_start_time by returning null", () => {
    const result = extractCompletionStartTime({});
    expect(result).toBeNull();
    expect(stringDateTime.safeParse(result).success).toBe(true);
  });

  it("normalizes date-only completion_start_time to full ISO date-time", () => {
    const result = extractCompletionStartTime({
      "langfuse.observation.completion_start_time": "2025-01-01",
    });
    expect(result).toBe("2025-01-01T00:00:00.000Z");
    expect(stringDateTime.safeParse(result).success).toBe(true);
  });

  it("normalizes space-separated date-time completion_start_time to ISO format", () => {
    const result = extractCompletionStartTime({
      "langfuse.observation.completion_start_time": "2025-01-01 12:00:00",
    });
    expect(result).not.toBeNull();
    expect(result).toMatch(/^2025-01-01T.*Z$/);
    expect(stringDateTime.safeParse(result).success).toBe(true);
  });

  it("normalizes double-stringified date-only timestamps", () => {
    const result = extractCompletionStartTime({
      "langfuse.observation.completion_start_time":
        JSON.stringify("2025-01-01"),
    });
    expect(result).toBe("2025-01-01T00:00:00.000Z");
    expect(stringDateTime.safeParse(result).success).toBe(true);
  });

  it("retains double-stringified full ISO timestamps with sub-millisecond precision", () => {
    const isoString = "2025-10-01T08:45:26.112648Z";
    const result = extractCompletionStartTime({
      "langfuse.observation.completion_start_time": JSON.stringify(isoString),
    });
    expect(result).toBe(isoString);
    expect(stringDateTime.safeParse(result).success).toBe(true);
  });

  it("preserves already valid full ISO date-time strings", () => {
    const isoString = "2025-07-13T05:20:00.500Z";
    const result = extractCompletionStartTime({
      "langfuse.observation.completion_start_time": isoString,
    });
    expect(result).toBe(isoString);
    expect(stringDateTime.safeParse(result).success).toBe(true);
  });

  it("preserves ISO date-time strings with timezone offset", () => {
    const isoString = "2025-01-01T12:00:00+02:00";
    const result = extractCompletionStartTime({
      "langfuse.observation.completion_start_time": isoString,
    });
    expect(result).toBe(isoString);
    expect(stringDateTime.safeParse(result).success).toBe(true);
  });

  it("ignores invalid date strings and returns null", () => {
    const result = extractCompletionStartTime({
      "langfuse.observation.completion_start_time": "not-a-valid-date",
    });
    expect(result).toBeNull();
    expect(stringDateTime.safeParse(result).success).toBe(true);
  });

  it("ignores empty or whitespace strings and returns null", () => {
    expect(
      extractCompletionStartTime({
        "langfuse.observation.completion_start_time": "",
      }),
    ).toBeNull();
    expect(
      extractCompletionStartTime({
        "langfuse.observation.completion_start_time": "   ",
      }),
    ).toBeNull();
  });

  it("ignores non-string attribute values safely", () => {
    expect(
      extractCompletionStartTime({
        "langfuse.observation.completion_start_time": null,
      }),
    ).toBeNull();
    expect(
      extractCompletionStartTime({
        "langfuse.observation.completion_start_time": undefined,
      }),
    ).toBeNull();
    expect(
      extractCompletionStartTime({
        "langfuse.observation.completion_start_time": {},
      }),
    ).toBeNull();
  });

  it("derives completionStartTime from time_to_first_chunk when attribute is absent", () => {
    const startTimeISO = "2025-01-01T00:00:00.000Z";
    const result = extractCompletionStartTime(
      {
        "gen_ai.client.operation.time_to_first_chunk": 0.25,
      },
      startTimeISO,
    );
    expect(result).toBe("2025-01-01T00:00:00.250Z");
    expect(stringDateTime.safeParse(result).success).toBe(true);
  });

  it("ingests generation span with date-only completion_start_time via processToEvent", () => {
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: { name: "test-scope" },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "chat",
                kind: 1,
                startTimeUnixNano: "1735689600000000000",
                endTimeUnixNano: "1735689601000000000",
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "generation" },
                  },
                  {
                    key: "langfuse.observation.completion_start_time",
                    value: { stringValue: "2025-01-01" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      },
    ];

    const events = processor.processToEvent(batch);
    expect(events).toHaveLength(1);
    expect(events[0].completionStartTime).toBe("2025-01-01T00:00:00.000Z");
    expect(
      stringDateTime.safeParse(events[0].completionStartTime).success,
    ).toBe(true);
  });
});
