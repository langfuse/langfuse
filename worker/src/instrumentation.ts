import tracer from "dd-trace";
import ot, { SpanKind } from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { PrismaInstrumentation } from "@prisma/instrumentation";

const { TracerProvider } = tracer.init({
  profiling: false,
  runtimeMetrics: true,
});

const provider = new TracerProvider();

provider.register();

registerInstrumentations({
  instrumentations: [
    new IORedisInstrumentation(),
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PrismaInstrumentation(),
  ],
});

export const otelTracer = ot.trace.getTracer("worker");
export const otelMetrics = ot.metrics.getMeter("worker");

type CallbackAsyncFn<T> = () => Promise<T>;

export async function instrumentAsync<T>(
  ctx: { name: string; root?: boolean; kind?: SpanKind } = {
    name: "",
    root: false,
    kind: undefined,
  },
  callback: CallbackAsyncFn<T>
): Promise<T> {
  return otelTracer.startActiveSpan(
    ctx.name,
    { root: ctx.root },
    async (span) => {
      const result = callback();
      span.end();
      return result;
    }
  );
}
