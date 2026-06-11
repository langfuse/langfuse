import dd from "dd-trace";
import {
  context,
  trace,
  INVALID_SPAN_CONTEXT,
  type Context,
  type Span,
  type SpanOptions,
  type Tracer,
  type TracerOptions,
  type TracerProvider,
} from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { AwsInstrumentation } from "@opentelemetry/instrumentation-aws-sdk";
import { BullMQInstrumentation } from "@appsignal/opentelemetry-instrumentation-bullmq";
import { ioredisRequestHook } from "@langfuse/shared/src/server";
import { envDetector, resourceFromAttributes } from "@opentelemetry/resources";
import { containerDetector } from "@opentelemetry/resource-detector-container";
import { env } from "@/src/env.mjs";

/**
 * Tracer that never records spans but keeps the caller's parent span context
 * active, so descendant spans attach to the real parent. Dropping spans via a
 * sampler instead would mint a new unsampled span id and orphan the subtree.
 *
 * Unlike the upstream NoopTracer, startActiveSpan intentionally does NOT set
 * the non-recording span as the active span: trace.getActiveSpan() must keep
 * returning the real recording parent (http.server) so helpers that write to
 * the active span (traceException, addUserToSpan) land on an exported span.
 */
class PassthroughTracer implements Tracer {
  startSpan(
    _name: string,
    _options?: SpanOptions,
    ctx: Context = context.active(),
  ): Span {
    return trace.wrapSpanContext(
      trace.getSpanContext(ctx) ?? INVALID_SPAN_CONTEXT,
    );
  }

  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: SpanOptions,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: SpanOptions,
    ctx: Context,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    arg2: SpanOptions | F,
    arg3?: Context | F,
    arg4?: F,
  ): ReturnType<F> {
    let fn: F;
    let ctx = context.active();
    if (typeof arg2 === "function") {
      fn = arg2;
    } else if (typeof arg3 === "function") {
      fn = arg3;
    } else {
      ctx = arg3 ?? ctx;
      fn = arg4 as F;
    }
    const span = this.startSpan(name, undefined, ctx);
    return context.with(ctx, () => fn(span)) as ReturnType<F>;
  }
}

class ScopeFilteringTracerProvider implements TracerProvider {
  private readonly passthroughTracer = new PassthroughTracer();

  constructor(
    private readonly delegate: TracerProvider,
    private readonly mutedScopes: ReadonlySet<string>,
  ) {}

  getTracer(name: string, version?: string, options?: TracerOptions): Tracer {
    return this.mutedScopes.has(name)
      ? this.passthroughTracer
      : this.delegate.getTracer(name, version, options);
  }
}

dd.init({
  runtimeMetrics: true,
  plugins: false,
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": env.OTEL_SERVICE_NAME,
    "service.version": env.BUILD_ID,
  }),
  traceExporter: new OTLPTraceExporter({
    url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  }),
  instrumentations: [
    new IORedisInstrumentation({ requestHook: ioredisRequestHook }),
    new HttpInstrumentation({
      requireParentforOutgoingSpans: true,
      ignoreIncomingRequestHook: (req) => {
        // Ignore health checks
        return ["/api/public/health", "/api/public/ready", "/api/health"].some(
          (path) => req.url?.includes(path),
        );
      },
      ignoreOutgoingRequestHook: (req) => {
        return req.host === "127.0.0.1";
      },
      requestHook: (span, req: any) => {
        const url = "path" in req ? req?.path : req?.url;
        let path = new URL(url, `http://${req?.host ?? "localhost"}`).pathname;
        if (path.startsWith("/_next/static")) {
          path = "/_next/static/*";
        }
        if (path.endsWith("/index")) {
          path = path.slice(0, -6);
        }
        span.updateName(`${req?.method} ${path}`);
        span.setAttribute("http.route", path);
      },
    }),
    new PrismaInstrumentation({
      ignoreSpanTypes: [
        "prisma:client:serialize",
        "prisma:engine:query",
        "prisma:engine:connection",
        "prisma:engine:serialize",
        "prisma:engine:response_json_serialization",
      ],
    }),
    new AwsInstrumentation(),
    new WinstonInstrumentation({ disableLogSending: true }),
    new BullMQInstrumentation({ useProducerSpanAsConsumerParent: true }),
  ],
  // Datadog's OTLP intake flattens resource attributes onto every ingested
  // span, so each detector attribute costs ingest bytes per span. The AWS ECS
  // and process detectors only duplicated infra tags the Datadog agent adds
  // itself (~1KB/span). containerDetector must stay: the agent resolves those
  // infra tags by looking up the container.id resource attribute.
  resourceDetectors: [envDetector, containerDetector],
  sampler: new TraceIdRatioBasedSampler(env.OTEL_TRACE_SAMPLING_RATIO),
});

sdk.start();

// Next.js emits wrapper spans (scope "next.js": next.js.server plus
// "executing api route" internals) on every request whenever a global tracer
// provider is registered; there is no Next.js setting to turn them off.
// Muting the scope means those spans are never started: child spans attach
// directly to the http.server span, and Next.js still stamps the resolved
// route template onto http.server (BaseServer.handleRequest propagates
// http.route to the parent span), so resource names keep route templates.
// The swap must happen after sdk.start(): instrumentations registered by the
// SDK keep the tracers they already resolved, while Next.js resolves its
// tracer through the global provider on every call.
const registeredTracerProvider = trace.getTracerProvider();
trace.disable();
trace.setGlobalTracerProvider(
  new ScopeFilteringTracerProvider(
    registeredTracerProvider,
    new Set(["next.js"]),
  ),
);
