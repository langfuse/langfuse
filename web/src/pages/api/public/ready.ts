import { VERSION } from "@/src/constants";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { telemetry } from "@/src/features/telemetry";
import { isSigtermReceived } from "@/src/utils/shutdown";
import { logger, traceException } from "@langfuse/shared/src/server";
import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);
    await telemetry();

    if (isSigtermReceived()) {
      logger.info(
        "Readiness check failed: SIGTERM / SIGINT received, shutting down.",
      );
      return res.status(500).json({
        status: "SIGTERM / SIGINT received, shutting down",
        version: VERSION.replace("v", ""),
      });
    }
  } catch (e) {
    traceException(e);
    logger.warn("Readiness check failed: ", e);
    return res.status(503).json({
      status: "Readiness check failed",
      version: VERSION.replace("v", ""),
    });
  }
  return res.status(200).json({
    status: "OK",
    version: VERSION.replace("v", ""),
  });
}
