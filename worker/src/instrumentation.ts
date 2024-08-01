import tracer from "dd-trace";
import ot, { SpanKind } from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";

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
  ],
});

export const otelTracer = ot.trace.getTracer("worker");

type CallbackAsyncFn<T> = () => Promise<T>;

export async function instrumentAsync<T>(
  ctx: { name: string; root: boolean },
  callback: CallbackAsyncFn<T>
): Promise<T> {
  return otelTracer.startActiveSpan(
    ctx.name,
    { root: ctx.root, kind: SpanKind.CONSUMER },
    async (span) => {
      const result = callback();
      span.end();
      return result;
    }
  );
}
