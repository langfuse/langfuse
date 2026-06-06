// @vitest-environment node

import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";

const ExportTraceServiceRequest =
  $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;

describe("OTel protobuf decoding", () => {
  it("serializes fixed64 timestamps as decimal strings", () => {
    const start = { low: 466_848_096, high: 406_528_574, unsigned: true };
    const end = { low: 467_248_096, high: 406_528_574, unsigned: true };

    const request = ExportTraceServiceRequest.fromObject({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: Buffer.alloc(16, 1),
                  spanId: Buffer.alloc(8, 2),
                  name: "span",
                  startTimeUnixNano: start,
                  endTimeUnixNano: end,
                },
              ],
            },
          ],
        },
      ],
    });
    const decoded = ExportTraceServiceRequest.decode(
      ExportTraceServiceRequest.encode(request).finish(),
    );

    const body = ExportTraceServiceRequest.toObject(decoded, {
      longs: String,
    });
    const span = body.resourceSpans[0]?.scopeSpans?.[0]?.spans?.[0];

    expect(span?.startTimeUnixNano).toBe("1746026930686364000");
    expect(span?.endTimeUnixNano).toBe("1746026930686764000");
    expect(JSON.stringify(span)).not.toContain('"low"');
  });
});
