import {
  context,
  propagation,
  trace,
  TraceFlags,
  type Baggage,
  type SpanContext,
} from "@opentelemetry/api";
import { node } from "@opentelemetry/sdk-node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";

describe("getGatewayFetch", () => {
  const provider = new node.NodeTracerProvider();
  const callerSpanContext: SpanContext = {
    traceId: "0af7651916cd43dd8448eb211c80319c",
    spanId: "b7ad6b7169203331",
    traceFlags: TraceFlags.SAMPLED,
  };

  beforeAll(() => {
    provider.register();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await provider.shutdown();
    context.disable();
    trace.disable();
  });

  it("strips active OTel baggage on default-origin allowlisted fetches while preserving span and outer baggage", async () => {
    let outboundBaggage: Baggage | undefined = propagation.createBaggage();
    let outboundSpanContext: SpanContext | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () => {
        outboundBaggage = propagation.getBaggage(context.active());
        outboundSpanContext = trace.getSpanContext(context.active());
        return new Response("ok");
      }),
    );

    const callerContext = propagation.setBaggage(
      trace.setSpanContext(context.active(), callerSpanContext),
      propagation.createBaggage({
        "langfuse.project.id": { value: "project-1" },
        "langfuse.org.id": { value: "org-1" },
      }),
    );

    const fetcher = getGatewayFetch({
      baseURL: null,
      extraHeaders: {},
      logContext: "test",
    });

    let outerBaggageAfter: string | undefined;
    await context.with(callerContext, async () => {
      await fetcher(
        "https://bedrock-runtime.us-east-1.amazonaws.com/model/test/invoke",
      );
      outerBaggageAfter = propagation
        .getBaggage(context.active())
        ?.getEntry("langfuse.project.id")?.value;
    });

    expect(outboundBaggage).toBeUndefined();
    expect(outboundSpanContext).toEqual(callerSpanContext);
    expect(outerBaggageAfter).toBe("project-1");
  });
});
