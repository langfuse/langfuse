import dd from "dd-trace";
import opentelemetry from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { BullMQInstrumentation } from "@appsignal/opentelemetry-instrumentation-bullmq";

if (!process.env.VERCEL && process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  const contextManager = new AsyncHooksContextManager().enable();

  opentelemetry.context.setGlobalContextManager(contextManager);

  const tracer = dd.init({
    runtimeMetrics: true,
  });

  const { TracerProvider } = tracer;

  const provider = new TracerProvider();

  registerInstrumentations({
    instrumentations: [
      new IORedisInstrumentation(),
      new HttpInstrumentation({
        requestHook: (span, req) => {
          if (span && req) {
            let url = "path" in req ? req.path : req.url;
            if (url) {
              // Remove URL parameters
              url = url.split("?")[0];
              // Add wildcard for /_next/static
              if (url.startsWith("/_next/static")) {
                url = "/_next/static/*";
              }
              const method = req.method;
              span.updateName(method ? `${method} ${url}` : url);
            }
          }
        },
      }),
      new PrismaInstrumentation(),
      new BullMQInstrumentation(),
      new WinstonInstrumentation({ disableLogSending: true }),
    ],
  });

  provider.register();
}
