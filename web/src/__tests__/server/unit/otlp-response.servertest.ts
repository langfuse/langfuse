import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";
import {
  decodeOtlpStatusMessage,
  OTLP_PROTOBUF_CONTENT_TYPE,
  writeOtlpHttpResponse,
} from "@/src/server/otel/otlpResponse";

const ExportTraceServiceResponse =
  $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse;

function write(params: {
  contentType?: string;
  body?: unknown;
  statusCode?: number;
}) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    headers: params.contentType
      ? { "content-type": params.contentType }
      : undefined,
  });

  writeOtlpHttpResponse({
    req,
    res,
    body: params.body ?? {},
    statusCode: params.statusCode ?? 200,
  });

  return res;
}

describe("writeOtlpHttpResponse", () => {
  it("returns an empty ExportTraceServiceResponse for protobuf success", () => {
    const res = write({ contentType: OTLP_PROTOBUF_CONTENT_TYPE });

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toBe(OTLP_PROTOBUF_CONTENT_TYPE);

    const decoded = ExportTraceServiceResponse.decode(res._getBuffer());
    expect(decoded.partialSuccess).toBeNull();
    expect(() => JSON.parse(res._getData())).toThrow();
  });

  it("matches protobuf Content-Type when a charset parameter is present", () => {
    const res = write({
      contentType: "application/x-protobuf; charset=utf-8",
    });

    expect(res.getHeader("Content-Type")).toBe(OTLP_PROTOBUF_CONTENT_TYPE);
  });

  it("keeps JSON success bodies for JSON requests", () => {
    const res = write({
      contentType: "application/json",
      body: { accepted: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toMatch(/application\/json/);
    expect(res._getJSONData()).toEqual({ accepted: true });
  });

  it("encodes handler errors as an OTLP Status protobuf", () => {
    const res = write({
      contentType: OTLP_PROTOBUF_CONTENT_TYPE,
      statusCode: 400,
      body: { error: "Failed to parse OTel Protobuf Trace" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.getHeader("Content-Type")).toBe(OTLP_PROTOBUF_CONTENT_TYPE);
    expect(decodeOtlpStatusMessage(res._getBuffer()).message).toBe(
      "Failed to parse OTel Protobuf Trace",
    );
  });
});
