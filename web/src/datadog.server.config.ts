import { env } from "@/src/env.mjs";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import dd from "dd-trace";
import { registerOTel } from "@vercel/otel";

if (!process.env.VERCEL && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  // const contextManager = new AsyncHooksContextManager().enable();

  // context.setGlobalContextManager(contextManager);

  const tracer = dd.init({
    profiling: false,
    runtimeMetrics: true,
  });

  const { TracerProvider } = tracer.init({});

  const provider = new TracerProvider();

  tracer.use("http", {
    hooks: {
      request(span, req) {
        if (span && req) {
          const urlString = "path" in req ? req.path : req.url;

          if (urlString) {
            const url = new URL(urlString, "http://localhost");
            const path = url.pathname + url.search;
            const resourceGroup = (() => {
              const segments = url.pathname.split("/").filter(Boolean);
              return segments.length > 0 ? `/${segments[0]}` : "/";
            })();
            const method = req.method;

            span.setTag(
              "resource.name",
              method ? `${method} ${resourceGroup}` : resourceGroup,
            );
            span.setTag("http.route", method ? `${method} ${path}` : path);
          }
        }
      },
    },
  });

  registerOTel({
    instrumentations: [
      new IORedisInstrumentation(),
      new HttpInstrumentation(),
      new PrismaInstrumentation({ middleware: true }),
      // getNodeAutoInstrumentations(),
    ],
  });

  provider.register();
}
