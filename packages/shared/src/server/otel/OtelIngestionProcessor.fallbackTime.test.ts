import { describe, expect, it } from "vitest";

import { OtelIngestionProcessor } from "./OtelIngestionProcessor";

/** An observation's start time, or a trace's timestamp. */
function legacyTime(body: object): unknown {
  if ("startTime" in body) return body.startTime;
  if ("timestamp" in body) return body.timestamp;
  return undefined;
}

describe("OtelIngestionProcessor fallback time", () => {
  it("gives a span without a start and end time the batch's fallback time in both conversions", async () => {
    const fallbackTime = "2026-01-02T03:04:05.678Z";
    const batch = [
      {
        scopeSpans: [
          {
            spans: [
              {
                traceId: Buffer.from("0af7651916cd43dd8448eb211c80319c", "hex"),
                spanId: Buffer.from("b7ad6b7169203331", "hex"),
                name: "span without times",
                kind: 1,
              },
            ],
          },
        ],
      },
    ];
    const processor = new OtelIngestionProcessor({
      projectId: "project-1",
      publicKey: "pk-test",
      sdkName: "python",
      sdkVersion: "3.0.0",
      fallbackTime,
    });
    // The legacy conversion reads seen traces from Redis unless initialized.
    Object.assign(processor, { isInitialized: true });

    const [event] = processor.processToEvent(batch);
    const legacy = await processor.processToIngestionEvents(batch);
    const legacyTimes = legacy.map(({ body }) => legacyTime(body));

    expect(event.startTimeISO).toBe(fallbackTime);
    expect(legacyTimes).toEqual([fallbackTime, fallbackTime]);
  });
});
