import tracer from "dd-trace";
import ot from "@opentelemetry/api";

const { TracerProvider } = tracer.init({
  profiling: false,
  runtimeMetrics: true,
});

const provider = new TracerProvider();

provider.register();

// registerInstrumentations({
//   tracerProvider: provider,
//   instrumentations: [new PrismaInstrumentation()],
// });

export const otelTracer = ot.trace.getTracer("worker");

type CallbackAsyncFn<T> = () => Promise<T>;

export async function instrumentAsync<T>(
  ctx: { name: string; root: boolean },
  callback: CallbackAsyncFn<T>
): Promise<T> {
  return otelTracer.startActiveSpan(ctx.name, { root: ctx.root }, async () => {
    return callback();
  });
}
