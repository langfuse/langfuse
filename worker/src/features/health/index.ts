import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { Response } from "express";

/**
 * Check the health of the container.
 * If failOnSigterm is true, the health check will fail if a SIGTERM signal has been received.
 */
export const checkContainerHealth = async (
  res: Response,
  failOnSigterm: boolean,
) => {
  if (failOnSigterm && isSigtermReceived()) {
    logger.info(
      "Health check failed: SIGTERM / SIGINT received, shutting down.",
    );
    return res.status(500).json({
      status: "SIGTERM / SIGINT received, shutting down",
    });
  }

  //check database health
  await prisma.$queryRaw`SELECT 1;`;

  if (!redis) {
    throw new Error("Redis connection not available");
  }

  await Promise.race([
    redis?.ping(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Redis ping timeout after 2 seconds")),
        2000,
      ),
    ),
  ]);

  res.json({
    status: "ok",
  });
};

let sigtermReceived: boolean = false;

export const setSigtermReceived = () => {
  logger.info("Set sigterm received to true");
  sigtermReceived = true;
};

const isSigtermReceived = () => sigtermReceived;
