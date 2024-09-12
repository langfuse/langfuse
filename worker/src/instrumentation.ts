import tracer from "dd-trace";
import opentelemetry from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
// import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { BullMQInstrumentation } from "@appsignal/opentelemetry-instrumentation-bullmq";

const contextManager = new AsyncHooksContextManager().enable();

opentelemetry.context.setGlobalContextManager(contextManager);

const { TracerProvider } = tracer.init({
  runtimeMetrics: true,
});

const provider = new TracerProvider();

registerInstrumentations({
  instrumentations: [
    new IORedisInstrumentation(),
    new HttpInstrumentation({
      startIncomingSpanHook: (req) => {
        console.log(`** incoming hook: ${JSON.stringify(req)}`);
        if (req) {
          return {
            name: `${req.method} ${"path" in req ? req.path : req.url}`,
            resource: "http.request",
          };
        }
        return {};
      },
      requestHook: (span, req) => {
        console.log(`** request hook: ${JSON.stringify(req)}`);
        if (span && req) {
          let url = "path" in req ? req.path : req.url;
          if (url) {
            // Remove URL parameters
            url = url.split("?")[0];
            const method = req.method;
            span.updateName(method ? `${method} ${url}` : url);
          }
        }
      },
    }),
    // new ExpressInstrumentation(),
    new PrismaInstrumentation(),
    new BullMQInstrumentation(),
    new WinstonInstrumentation({ disableLogSending: true }),
  ],
});

provider.register();
