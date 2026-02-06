/**
 * Tests for OTEL API Content-Type Specification Compliance
 *
 * Per the OTLP/HTTP specification (https://opentelemetry.io/docs/specs/otlp/#otlphttp-response):
 * - Response encoding should match request encoding
 * - Protobuf requests → application/x-protobuf response
 * - JSON requests → application/json response
 *
 * These tests verify that the Langfuse OTEL endpoints correctly respect
 * the Content-Type of incoming requests when generating responses.
 */

import { createBasicAuthHeader } from "@langfuse/shared/src/server";
import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";
import { randomBytes } from "crypto";

const API_BASE_URL = "http://localhost:3000";
const AUTH_HEADER = createBasicAuthHeader(
  "pk-lf-1234567890",
  "sk-lf-1234567890",
);

/**
 * Helper to create a minimal OTEL trace payload as JSON
 */
function createJsonTracePayload() {
  const traceId = randomBytes(16);
  const spanId = randomBytes(8);

  return {
    json: {
      resourceSpans: [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: "test-sdk", version: "1.0.0", attributes: [] },
              spans: [
                {
                  traceId,
                  spanId,
                  name: "test-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 466848096,
                    high: 406528574,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 467248096,
                    high: 406528574,
                    unsigned: true,
                  },
                  attributes: [],
                  status: {},
                },
              ],
            },
          ],
        },
      ],
    },
    traceId: traceId.toString("hex"),
    spanId: spanId.toString("hex"),
  };
}

/**
 * Helper to create a protobuf-encoded OTEL trace request
 */
function createProtobufTracePayload(): Buffer {
  const traceId = randomBytes(16);
  const spanId = randomBytes(8);

  const ExportTraceServiceRequest =
    $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;

  const message = ExportTraceServiceRequest.create({
    resourceSpans: [
      {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: "test-sdk", version: "1.0.0" },
            spans: [
              {
                traceId: new Uint8Array(traceId),
                spanId: new Uint8Array(spanId),
                name: "protobuf-test-span",
                kind: 1,
                startTimeUnixNano: BigInt("1746528574466848096"),
                endTimeUnixNano: BigInt("1746528574467248096"),
                attributes: [],
                status: {},
              },
            ],
          },
        ],
      },
    ],
  });

  return Buffer.from(ExportTraceServiceRequest.encode(message).finish());
}

describe("/api/public/otel/v1/traces Content-Type Compliance", () => {
  it("should return application/json Content-Type for JSON requests", async () => {
    const { json } = createJsonTracePayload();

    const response = await fetch(`${API_BASE_URL}/api/public/otel/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_HEADER,
      },
      body: JSON.stringify(json),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    // Verify response body is valid JSON
    const responseBody = await response.json();
    expect(responseBody).toBeDefined();
    // Empty success response or partialSuccess structure
    expect(
      Object.keys(responseBody).length === 0 ||
        responseBody.partialSuccess !== undefined,
    ).toBe(true);
  });

  it("should return application/x-protobuf Content-Type for protobuf requests", async () => {
    const protobufPayload = createProtobufTracePayload();

    const response = await fetch(`${API_BASE_URL}/api/public/otel/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-protobuf",
        Authorization: AUTH_HEADER,
      },
      body: protobufPayload,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-protobuf",
    );

    // Verify response body is valid protobuf
    const responseBuffer = await response.arrayBuffer();
    const ExportTraceServiceResponse =
      $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse;
    const decoded = ExportTraceServiceResponse.decode(
      new Uint8Array(responseBuffer),
    );
    expect(decoded).toBeDefined();
  });

  it("should return JSON error response for JSON requests with invalid body", async () => {
    const response = await fetch(`${API_BASE_URL}/api/public/otel/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_HEADER,
      },
      body: "invalid json {{{",
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");

    const responseBody = await response.json();
    expect(responseBody.error).toBeDefined();
  });

  it("should return protobuf error response for protobuf requests with invalid body", async () => {
    const response = await fetch(`${API_BASE_URL}/api/public/otel/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-protobuf",
        Authorization: AUTH_HEADER,
      },
      body: Buffer.from("invalid protobuf data"),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain(
      "application/x-protobuf",
    );

    // Verify response body is valid protobuf with error message
    const responseBuffer = await response.arrayBuffer();
    const ExportTraceServiceResponse =
      $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse;
    const decoded = ExportTraceServiceResponse.decode(
      new Uint8Array(responseBuffer),
    );
    expect(decoded).toBeDefined();
    expect(decoded.partialSuccess?.errorMessage).toBeDefined();
  });

  it("should return protobuf error response for auth errors on protobuf requests", async () => {
    const protobufPayload = createProtobufTracePayload();

    const response = await fetch(`${API_BASE_URL}/api/public/otel/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-protobuf",
        Authorization: createBasicAuthHeader("invalid-key", "invalid-secret"),
      },
      body: protobufPayload,
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain(
      "application/x-protobuf",
    );

    // Verify response body is valid protobuf
    const responseBuffer = await response.arrayBuffer();
    const ExportTraceServiceResponse =
      $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse;
    const decoded = ExportTraceServiceResponse.decode(
      new Uint8Array(responseBuffer),
    );
    expect(decoded).toBeDefined();
  });

  it("should return JSON error response for auth errors on JSON requests", async () => {
    const { json } = createJsonTracePayload();

    const response = await fetch(`${API_BASE_URL}/api/public/otel/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: createBasicAuthHeader("invalid-key", "invalid-secret"),
      },
      body: JSON.stringify(json),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");

    const responseBody = await response.json();
    expect(responseBody.error).toBeDefined();
  });

  it("should handle empty resourceSpans with correct Content-Type for JSON", async () => {
    const response = await fetch(`${API_BASE_URL}/api/public/otel/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_HEADER,
      },
      body: JSON.stringify({ resourceSpans: [] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("should handle empty resourceSpans with correct Content-Type for protobuf", async () => {
    const ExportTraceServiceRequest =
      $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
    const message = ExportTraceServiceRequest.create({ resourceSpans: [] });
    const protobufPayload = Buffer.from(
      ExportTraceServiceRequest.encode(message).finish(),
    );

    const response = await fetch(`${API_BASE_URL}/api/public/otel/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-protobuf",
        Authorization: AUTH_HEADER,
      },
      body: protobufPayload,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-protobuf",
    );
  });
});

describe("/api/public/otel/v1/metrics Content-Type Compliance", () => {
  it("should return application/json Content-Type for JSON requests", async () => {
    const response = await fetch(`${API_BASE_URL}/api/public/otel/v1/metrics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_HEADER,
      },
      body: JSON.stringify({ resourceMetrics: [] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("should return application/x-protobuf Content-Type for protobuf requests", async () => {
    const ExportMetricsServiceRequest =
      $root.opentelemetry.proto.collector.metrics.v1
        .ExportMetricsServiceRequest;
    const message = ExportMetricsServiceRequest.create({
      resourceMetrics: [],
    });
    const protobufPayload = Buffer.from(
      ExportMetricsServiceRequest.encode(message).finish(),
    );

    const response = await fetch(`${API_BASE_URL}/api/public/otel/v1/metrics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-protobuf",
        Authorization: AUTH_HEADER,
      },
      body: protobufPayload,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-protobuf",
    );

    // Verify response body is valid protobuf
    const responseBuffer = await response.arrayBuffer();
    const ExportMetricsServiceResponse =
      $root.opentelemetry.proto.collector.metrics.v1
        .ExportMetricsServiceResponse;
    const decoded = ExportMetricsServiceResponse.decode(
      new Uint8Array(responseBuffer),
    );
    expect(decoded).toBeDefined();
  });

  it("should return protobuf error response for auth errors on protobuf requests", async () => {
    const ExportMetricsServiceRequest =
      $root.opentelemetry.proto.collector.metrics.v1
        .ExportMetricsServiceRequest;
    const message = ExportMetricsServiceRequest.create({
      resourceMetrics: [],
    });
    const protobufPayload = Buffer.from(
      ExportMetricsServiceRequest.encode(message).finish(),
    );

    const response = await fetch(`${API_BASE_URL}/api/public/otel/v1/metrics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-protobuf",
        Authorization: createBasicAuthHeader("invalid-key", "invalid-secret"),
      },
      body: protobufPayload,
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain(
      "application/x-protobuf",
    );

    // Verify response body is valid protobuf
    const responseBuffer = await response.arrayBuffer();
    const ExportMetricsServiceResponse =
      $root.opentelemetry.proto.collector.metrics.v1
        .ExportMetricsServiceResponse;
    const decoded = ExportMetricsServiceResponse.decode(
      new Uint8Array(responseBuffer),
    );
    expect(decoded).toBeDefined();
  });
});
