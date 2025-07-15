import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { env } from "@/src/env.mjs";

const tracerProvider = new NodeTracerProvider();

const traceExporter = new OTLPTraceExporter({
  url: `${env.LANGFUSE_AI_LANGFUSE_HOST}/api/public/otel/v1/traces`,
  headers: {
    // Bae64 encode public key and private key
    Authorization: `Basic ${Buffer.from(`${env.LANGFUSE_AI_LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_AI_LANGFUSE_SECRET_KEY}`).toString("base64")}`,
  },
});

tracerProvider.addSpanProcessor(new SimpleSpanProcessor(traceExporter));
tracerProvider.register();

export { tracerProvider };
