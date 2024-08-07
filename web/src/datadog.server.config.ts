import { env } from "@/src/env.mjs";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import dd from "dd-trace";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import opentelemetry from "@opentelemetry/api";

if (!process.env.VERCEL && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  // const contextManager = new AsyncHooksContextManager().enable();

  // opentelemetry.context.setGlobalContextManager(contextManager);

  const tracer = dd.init({
    profiling: false,
    runtimeMetrics: true,
  });

  const { TracerProvider } = tracer.init({
    startupLogs: true,
  });

  const provider = new TracerProvider();

  // tracer.use("http", {
  //   hooks: {
  //     request(span, req) {
  //       if (span && req) {
  //         const urlString = "path" in req ? req.path : req.url;

  //         if (urlString) {
  //           const url = new URL(urlString, "http://localhost");
  //           const path = url.pathname + url.search;
  //           const resourceGroup = (() => {
  //             return url.pathname;
  //           })();
  //           const method = req.method;

  //           span.setTag(
  //             "resource.name",
  //             method ? `${method} ${resourceGroup}` : resourceGroup,
  //           );
  //           span.setTag("http.route", method ? `${method} ${path}` : path);
  //         }
  //       }
  //     },
  //   },
  // });

  registerInstrumentations({
    instrumentations: [
      new IORedisInstrumentation(),
      new HttpInstrumentation(),
      new PrismaInstrumentation(),
      getNodeAutoInstrumentations(),
    ],
  });

  provider.register();
}
