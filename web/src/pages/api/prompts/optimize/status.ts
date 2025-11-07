import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod/v4";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/src/server/auth";
import {
  OptimizationQueue,
  logger,
} from "@langfuse/shared/src/server";

const StatusRequestSchema = z.object({
  jobId: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Only allow GET requests
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Check authentication
    const authOptions = await getAuthOptions();
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate request query
    const parseResult = StatusRequestSchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parseResult.error.errors,
      });
    }

    const { jobId } = parseResult.data;

    // Get the optimization queue
    const optimizationQueue = OptimizationQueue.getInstance();
    if (!optimizationQueue) {
      logger.error("OptimizationQueue not available");
      return res.status(503).json({
        error: "Optimization service not available",
      });
    }

    // Get job status from BullMQ
    const job = await optimizationQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: "Job not found",
        status: "not_found",
      });
    }

    const state = await job.getState();
    const progress = job.progress;
    const failedReason = job.failedReason;

    return res.status(200).json({
      jobId,
      status: state, // 'completed', 'failed', 'active', 'waiting', 'delayed'
      progress,
      failedReason,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    });
  } catch (error) {
    logger.error("Error checking optimization status", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
