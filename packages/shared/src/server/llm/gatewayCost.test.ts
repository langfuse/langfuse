import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { context, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { LangfuseOtelSpanAttributes } from "../otel/attributes";
import { gatewayCostFromHeaders, withGatewayCostCapture } from "./gatewayCost";

const COST_DETAILS = LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS;

const contextManager = new AsyncLocalStorageContextManager();
const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
const tracer = provider.getTracer("gateway-cost-test");

beforeAll(() => {
  context.setGlobalContextManager(contextManager.enable());
});

afterAll(() => {
  context.disable();
});

beforeEach(() => {
  exporter.reset();
});

const responseWith = (headers: Record<string, string>) =>
  new Response("{}", { headers });

/** Runs the wrapped fetch inside a span, the way a provider call runs. */
async function costOnSpanFor(headers: Record<string, string>) {
  const createFetch = withGatewayCostCapture(
    () => async () => responseWith(headers),
  );
  const span = tracer.startSpan("chat gpt-4");

  await context.with(trace.setSpan(context.active(), span), () =>
    createFetch("test")("https://gateway.example/v1/chat/completions"),
  );
  span.end();

  return exporter.getFinishedSpans()[0]?.attributes[COST_DETAILS];
}

describe("gatewayCostFromHeaders", () => {
  it("reads what LiteLLM charged", () => {
    expect(
      gatewayCostFromHeaders(
        new Headers({ "x-litellm-response-cost": "5.85e-06" }),
      ),
    ).toEqual({ total: 5.85e-6 });
  });

  it("reports nothing when the gateway sent no cost", () => {
    // An unpriced deployment omits the header. Recording zero here would look
    // like a free call rather than an unmetered one.
    expect(gatewayCostFromHeaders(new Headers())).toBeUndefined();
  });

  it("records a real zero", () => {
    expect(
      gatewayCostFromHeaders(new Headers({ "x-litellm-response-cost": "0" })),
    ).toEqual({ total: 0 });
  });

  it.each(["", "   ", "None", "not-a-number", "NaN", "Infinity"])(
    "ignores the unusable value %o",
    (value) => {
      expect(
        gatewayCostFromHeaders(
          new Headers({ "x-litellm-response-cost": value }),
        ),
      ).toBeUndefined();
    },
  );

  it("ignores the component headers when the total is absent", () => {
    // A streamed LiteLLM response carries every component as 0.0 and no total.
    // Reading the components would record an exact $0.00 for every stream.
    expect(
      gatewayCostFromHeaders(
        new Headers({
          "x-litellm-response-cost-input": "0.0",
          "x-litellm-response-cost-output": "0.0",
        }),
      ),
    ).toBeUndefined();
  });
});

describe("withGatewayCostCapture", () => {
  it("puts the gateway's cost on the generation span", async () => {
    expect(await costOnSpanFor({ "x-litellm-response-cost": "5.85e-06" })).toBe(
      JSON.stringify({ total: 5.85e-6 }),
    );
  });

  it("leaves the span alone when no cost was reported", async () => {
    expect(await costOnSpanFor({})).toBeUndefined();
  });

  it("returns the provider's response untouched", async () => {
    const response = responseWith({ "x-litellm-response-cost": "5.85e-06" });
    const createFetch = withGatewayCostCapture(() => async () => response);

    expect(await createFetch("test")("https://gateway.example/v1")).toBe(
      response,
    );
  });

  it("does not throw without an active span", async () => {
    const createFetch = withGatewayCostCapture(
      () => async () => responseWith({ "x-litellm-response-cost": "5.85e-06" }),
    );

    await expect(
      createFetch("test")("https://gateway.example/v1"),
    ).resolves.toBeInstanceOf(Response);
  });

  it("propagates a failed request rather than swallowing it", async () => {
    const boom = new Error("connection refused");
    const createFetch = withGatewayCostCapture(() => async () => {
      throw boom;
    });

    await expect(
      createFetch("test")("https://gateway.example/v1"),
    ).rejects.toBe(boom);
  });

  it("passes the log context and sensitive headers through", () => {
    const seen: unknown[] = [];
    const createFetch = withGatewayCostCapture((...args) => {
      seen.push(args);
      return async () => responseWith({});
    });

    createFetch("Anthropic LLM base URL", ["x-api-key"]);

    expect(seen).toEqual([["Anthropic LLM base URL", ["x-api-key"]]]);
  });
});
