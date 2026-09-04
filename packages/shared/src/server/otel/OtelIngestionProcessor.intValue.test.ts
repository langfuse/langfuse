import { describe, expect, it } from "vitest";

import { OtelIngestionProcessor } from "./OtelIngestionProcessor";

// Regression coverage for protobuf int64 attribute decoding. Protobuf.js
// decodes int64 into a Long `{ low, high }` where `low`/`high` are *signed*
// 32-bit ints, so the low word must be read as unsigned (`low >>> 0`) when
// reconstructing the value — otherwise every int64 whose low 32 bits have the
// sign bit set (value ranges crossing 2^31) decodes to a negative/short number.

const spanWithIntAttribute = (intValue: {
  low: number;
  high: number;
  unsigned?: boolean;
}) => ({
  resource: { attributes: [] },
  scopeSpans: [
    {
      scope: { name: "test" },
      spans: [
        {
          traceId: {
            type: "Buffer",
            data: [
              44, 206, 24, 247, 232, 205, 6, 90, 11, 78, 99, 78, 239, 114, 131,
              145,
            ],
          },
          spanId: { type: "Buffer", data: [87, 240, 37, 84, 23, 151, 65, 189] },
          name: "my-span",
          kind: 1,
          startTimeUnixNano: {
            low: 466848096,
            high: 406528574,
            unsigned: true,
          },
          endTimeUnixNano: { low: 467248096, high: 406528574, unsigned: true },
          attributes: [{ key: "test.big_int", value: { intValue } }],
        },
      ],
    },
  ],
});

const decodeBigIntAttribute = async (intValue: {
  low: number;
  high: number;
  unsigned?: boolean;
}) => {
  const processor = new OtelIngestionProcessor({
    projectId: "p",
    publicKey: "",
    sdkName: "",
    sdkVersion: "",
  });
  (processor as any).seenTraces = new Set();
  (processor as any).isInitialized = true;
  const events = await processor.processToIngestionEvents([
    spanWithIntAttribute(intValue),
  ] as any);
  const withMetadata = events.find(
    (e: any) => e.body?.metadata?.attributes?.["test.big_int"] !== undefined,
  ) as any;
  return withMetadata?.body?.metadata?.attributes?.["test.big_int"];
};

describe("OtelIngestionProcessor int64 attribute decoding", () => {
  it("decodes a protobuf Long whose low word has the sign bit set (high=0)", async () => {
    // 3_000_000_000 -> Long { low: -1294967296, high: 0 }
    expect(await decodeBigIntAttribute({ low: -1294967296, high: 0 })).toBe(
      "3000000000",
    );
  });

  it("decodes a protobuf Long across the high word with a sign-bit-set low word", async () => {
    // 1_721_000_000_000 -> Long { low: -1281885696, high: 400 }
    expect(await decodeBigIntAttribute({ low: -1281885696, high: 400 })).toBe(
      "1721000000000",
    );
  });

  it("still decodes int64 -1 (the all-ones Long) as -1", async () => {
    expect(await decodeBigIntAttribute({ low: -1, high: -1 })).toBe("-1");
  });

  it("still decodes a small positive Long unchanged", async () => {
    expect(await decodeBigIntAttribute({ low: 42, high: 0 })).toBe("42");
  });
});
