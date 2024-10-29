import express from "express";
import { traceException } from "@langfuse/shared/src/server";

import { checkContainerHealth } from "../features/health";
import { logger } from "@langfuse/shared/src/server";
const router = express.Router();

router.get<{}, { status: string }>("/health", async (_req, res) => {
  try {
    await checkContainerHealth(res, false);
  } catch (e) {
    traceException(e);
    logger.error("Health check failed", e);
    res.status(500).json({
      status: "error",
    });
  }
});

router.get<{}, { status: string }>("/ready", async (_req, res) => {
  try {
    await checkContainerHealth(res, true);
  } catch (e) {
    traceException(e);
    logger.error("Readiness check failed", e);
    res.status(500).json({
      status: "error",
    });
  }
});

export default router;
