import express from "express";
import { traceException } from "@langfuse/shared/src/server";

import { hello } from "@langfuse/native";
import { checkContainerHealth } from "../features/health";
import { logger } from "@langfuse/shared/src/server";
const router = express.Router();

router.get<{}, { status: string }>("/health", async (req, res) => {
  try {
    // Exercise the Rust addon on every probe so a worker whose native module
    // stopped working is reported unhealthy, and its metric keeps a heartbeat.
    hello("health");
    await checkContainerHealth(res, {
      failOnSigterm: false,
      failIfEventPropagationStuck:
        req.query.failIfEventPropagationStuck === "true",
      failIfQueueConsumptionStuck:
        req.query.failIfQueueConsumptionStuck === "true",
    });
  } catch (e) {
    traceException(e);
    logger.error("Health check failed", e);
    res.status(500).json({
      status: "error",
    });
  }
});

router.get<{}, { status: string }>("/ready", async (req, res) => {
  try {
    await checkContainerHealth(res, {
      failOnSigterm: true,
      failIfEventPropagationStuck:
        req.query.failIfEventPropagationStuck === "true",
      failIfQueueConsumptionStuck:
        req.query.failIfQueueConsumptionStuck === "true",
    });
  } catch (e) {
    traceException(e);
    logger.error("Readiness check failed", e);
    res.status(500).json({
      status: "error",
    });
  }
});

export default router;
