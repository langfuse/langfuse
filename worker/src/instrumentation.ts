import tracer from "dd-trace";
import ot, { SpanKind } from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { PrismaInstrumentation } from "@prisma/instrumentation";

const { TracerProvider } = tracer.init({
  profiling: false,
  runtimeMetrics: true,
});

const provider = new TracerProvider();

provider.register();

registerInstrumentations({
  instrumentations: [new PrismaInstrumentation()],
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
