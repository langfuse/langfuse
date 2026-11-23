import type { Span } from "@opentelemetry/api";
import { vi } from "vitest";
import { buildTrpcCorrelationHeaders } from "@/src/server/utils/trpcCorrelationHeaders";

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const GATEWAY_ID = "11111111-2222-4333-8444-555555555555";
const GENERATED_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const recordingSpan = () => {
  const attributes: Record<string, string> = {};
  const span = {
    attributes,
    isRecording: () => true,
    setAttribute(key: string, value: string) {
      attributes[key] = value;
      return span;
    },
  };
  return span;
};

const silentSpan = () => {
  const setAttribute = vi.fn();
  return {
    setAttribute,
    isRecording: () => false,
  };
};

describe("buildTrpcCorrelationHeaders", () => {
  it("sets the gateway request id, the Datadog trace id, and the build id", () => {
    const span = recordingSpan();

    const headers = buildTrpcCorrelationHeaders({
      buildId: "build-1",
      incomingRequestId: `  ${GATEWAY_ID}  `,
      traceId: TRACE_ID.toUpperCase(),
      span: span as unknown as Span,
      createRequestId: () => GENERATED_ID,
    });

    expect(headers).toEqual({
      "x-build-id": "build-1",
      "x-request-id": GATEWAY_ID,
      "x-dd-trace-id": TRACE_ID,
    });
    expect(span.attributes).toEqual({ request_id: GATEWAY_ID });
  });

  it("keeps a gateway id's case and a Cloudflare ray id", () => {
    const uppercase = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";
    expect(
      buildTrpcCorrelationHeaders({
        buildId: "build-1",
        incomingRequestId: uppercase,
        traceId: undefined,
      })["x-request-id"],
    ).toBe(uppercase);

    expect(
      buildTrpcCorrelationHeaders({
        buildId: "build-1",
        incomingRequestId: "230b030023ae2822-SJC",
        traceId: undefined,
      })["x-request-id"],
    ).toBe("230b030023ae2822-SJC");
  });

  it("uses the first header value only", () => {
    const headers = buildTrpcCorrelationHeaders({
      buildId: "build-1",
      incomingRequestId: [GATEWAY_ID, "person@example.com"],
      traceId: TRACE_ID,
    });

    expect(headers["x-request-id"]).toBe(GATEWAY_ID);

    const rejected = buildTrpcCorrelationHeaders({
      buildId: "build-1",
      incomingRequestId: ["person@example.com", GATEWAY_ID],
      traceId: undefined,
      createRequestId: () => GENERATED_ID,
    });
    expect(rejected["x-request-id"]).toBe(GENERATED_ID);
    expect(JSON.stringify(rejected)).not.toContain("example.com");
    expect(JSON.stringify(rejected)).not.toContain(GATEWAY_ID);
  });

  it.each([
    "person@example.com",
    "hello world",
    `c${"a".repeat(24)}`,
    `${GATEWAY_ID}\ninjected`,
    "Bearer secret-token",
    "",
    "   ",
    NIL_UUID,
  ])("does not echo an unsafe incoming request id (%j)", (incoming) => {
    const span = recordingSpan();
    const headers = buildTrpcCorrelationHeaders({
      buildId: "build-1",
      incomingRequestId: incoming,
      traceId: TRACE_ID,
      span: span as unknown as Span,
      createRequestId: () => GENERATED_ID,
    });

    expect(headers["x-request-id"]).toBe(TRACE_ID);
    expect(headers["x-dd-trace-id"]).toBe(TRACE_ID);
    expect(JSON.stringify(headers)).not.toContain("example.com");
    expect(JSON.stringify(headers)).not.toContain("injected");
    expect(JSON.stringify(headers)).not.toContain("secret");
    expect(span.attributes.request_id).toBe(TRACE_ID);
  });

  it("omits the trace header when the span was not sampled", () => {
    const span = silentSpan();
    const headers = buildTrpcCorrelationHeaders({
      buildId: "build-1",
      incomingRequestId: undefined,
      traceId: "0".repeat(32),
      span: span as unknown as Span,
      createRequestId: () => GENERATED_ID,
    });

    expect(headers).toEqual({
      "x-build-id": "build-1",
      "x-request-id": GENERATED_ID,
    });
    expect(span.setAttribute).not.toHaveBeenCalled();
  });

  it("drops a generated id that is not itself a safe request id", () => {
    const headers = buildTrpcCorrelationHeaders({
      buildId: undefined,
      incomingRequestId: undefined,
      traceId: "not-a-trace",
      createRequestId: () => "person@example.com",
    });

    expect(headers).toEqual({});
  });
});
