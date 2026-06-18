import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import {
  OTEL_TRACE_REQUEST_BODY_MAX_BYTES,
  OTEL_TRACE_REQUEST_MAX_RESOURCE_SPANS,
  OTEL_TRACE_REQUEST_MAX_SPANS,
  OtelTraceRequestLimitError,
  decompressGzipWithByteLimit,
  getOtelTraceBatchCounts,
  readStreamWithByteLimit,
  validateOtelTraceContentLength,
} from "@/src/features/public-api/server/otelTraceRequestLimits";

const expectLimitError = (
  fn: () => void,
  statusCode: number,
  message: string,
) => {
  try {
    fn();
    throw new Error("Expected function to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(OtelTraceRequestLimitError);
    expect(error).toMatchObject({ statusCode, message });
  }
};

describe("OTel trace request limits", () => {
  it("should reject the request if Content-Length is missing", () => {
    expectLimitError(
      () => validateOtelTraceContentLength({}),
      411,
      "Content-Length header is required",
    );
  });

  it("should reject the request if Content-Length exceeds the raw body limit", () => {
    expectLimitError(
      () =>
        validateOtelTraceContentLength({
          "content-length": String(OTEL_TRACE_REQUEST_BODY_MAX_BYTES + 1),
        }),
      413,
      `OTel trace request body exceeds the ${OTEL_TRACE_REQUEST_BODY_MAX_BYTES} byte limit`,
    );
  });

  it("should stop reading the raw body if the stream exceeds the byte limit", async () => {
    await expect(
      readStreamWithByteLimit(
        Readable.from([Buffer.alloc(3), Buffer.alloc(3)]),
        5,
      ),
    ).rejects.toMatchObject({
      statusCode: 413,
      message: "OTel trace request body exceeds the 5 byte limit",
    });
  });

  it("should resume instead of destroying the stream if configured to drain on limit", async () => {
    const stream = new Readable({ read() {} });
    const destroySpy = vi.spyOn(stream, "destroy");
    const resumeSpy = vi.spyOn(stream, "resume");

    const result = readStreamWithByteLimit(stream, 5, {
      limitExceededAction: "resume",
    });
    stream.emit("data", Buffer.alloc(3));
    stream.emit("data", Buffer.alloc(3));

    await expect(result).rejects.toMatchObject({
      statusCode: 413,
      message: "OTel trace request body exceeds the 5 byte limit",
    });

    expect(resumeSpy).toHaveBeenCalled();
    expect(destroySpy).not.toHaveBeenCalled();
  });

  it("should stop decompressing gzip if the inflated body exceeds the byte limit", async () => {
    await expect(
      decompressGzipWithByteLimit(gzipSync(Buffer.alloc(10)), 5),
    ).rejects.toMatchObject({
      statusCode: 413,
      message: "OTel trace request body exceeds the 5 byte limit",
    });
  });

  it("should count resource spans and spans for valid batches", () => {
    expect(
      getOtelTraceBatchCounts([
        { scopeSpans: [{ spans: [{}, {}] }] },
        { scopeSpans: [{ spans: [{}] }] },
      ]),
    ).toEqual({ resourceSpanCount: 2, spanCount: 3 });
  });

  it("should reject the request if the resource span count exceeds the limit", () => {
    expectLimitError(
      () =>
        getOtelTraceBatchCounts(
          Array.from(
            { length: OTEL_TRACE_REQUEST_MAX_RESOURCE_SPANS + 1 },
            () => ({
              scopeSpans: [],
            }),
          ),
        ),
      413,
      `OTel trace request exceeds the ${OTEL_TRACE_REQUEST_MAX_RESOURCE_SPANS} resourceSpans limit`,
    );
  });

  it("should reject the request if the span count exceeds the limit", () => {
    expectLimitError(
      () =>
        getOtelTraceBatchCounts([
          {
            scopeSpans: [
              {
                spans: Array.from(
                  { length: OTEL_TRACE_REQUEST_MAX_SPANS + 1 },
                  () => ({}),
                ),
              },
            ],
          },
        ]),
      413,
      `OTel trace request exceeds the ${OTEL_TRACE_REQUEST_MAX_SPANS} spans limit`,
    );
  });
});
