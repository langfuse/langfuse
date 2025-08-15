import type { NextApiRequest, NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { prometheusMetrics } from "@/src/features/prometheus-metrics/prometheus-metrics";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Only allow GET requests
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // Check if Prometheus metrics are enabled
  console.log(
    "PROMETHEUS_METRICS_ENABLED:",
    process.env.PROMETHEUS_METRICS_ENABLED,
  );
  if (env.PROMETHEUS_METRICS_ENABLED !== "true") {
    return res.status(404).json({
      error:
        "Prometheus metrics are not enabled. Set PROMETHEUS_METRICS_ENABLED=true to enable.",
    });
  }

  try {
    // Get metrics from the shared prometheus metrics instance
    const metrics = await prometheusMetrics.getMetrics();

    // Set appropriate headers for Prometheus metrics
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(metrics);
  } catch (error) {
    logger.error("Error collecting metrics", { error });
    return res.status(500).json({ error: "Error collecting metrics" });
  }
}
