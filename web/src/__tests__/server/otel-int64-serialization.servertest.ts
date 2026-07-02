import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";

describe("OTel protobuf int64 serialization", () => {
  it("toObject with longs:String emits OTLP/JSON conformant strings", () => {
    const Req =
      $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;

    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: Buffer.alloc(16, 1),
                  spanId: Buffer.alloc(8, 1),
                  startTimeUnixNano: 1700000000000000000n,
                  endTimeUnixNano: 1700000001000000000n,
                  attributes: [
                    { key: "answer", value: { intValue: 42 } },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ],
    };

    const buf = Req.encode(Req.fromObject(payload)).finish();
    const decoded = Req.decode(buf);
    const obj = Req.toObject(decoded, { longs: String });

    const span = obj.resourceSpans[0].scopeSpans[0].spans[0];
    expect(typeof span.startTimeUnixNano).toBe("string");
    expect(span.startTimeUnixNano).toBe("1700000000000000000");
    expect(typeof span.attributes[0].value.intValue).toBe("string");
    expect(span.attributes[0].value.intValue).toBe("42");

    // Negative regression: must not leak protobufjs Long internals
    const json = JSON.stringify(obj);
    expect(json).not.toMatch(/"low":/);
    expect(json).not.toMatch(/"unsigned":/);
  });
});
