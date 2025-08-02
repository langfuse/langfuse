import { env } from "@/src/env.mjs";
import { sharedPrometheusMetrics } from "@langfuse/shared/src/server";

try {
  // Initialize metrics with environment configuration
  sharedPrometheusMetrics.initialize(env.PROMETHEUS_METRICS_ENABLED === "true");
} catch (e) {
  // ignore: env is not defined on the client, and we don't want to expose it
  // on the client, we do not need to initialize the metrics service
}

// Use the shared metrics service
export const prometheusMetrics = sharedPrometheusMetrics;
