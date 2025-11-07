import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod/v4";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/src/server/auth";
import {
  OptimizationQueue,
  QueueJobs,
  logger,
} from "@langfuse/shared/src/server";

const OptimizeRequestSchema = z.object({
  projectId: z.string(),
  promptId: z.string().optional(),
  promptName: z.string().optional(),
  promptVersion: z.number().optional(),
  numIterations: z.number().min(1).max(100).default(10),
  numExamples: z.number().min(1).max(50).default(5),
  promptLabel: z.string().optional(),
  environment: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Only allow POST requests
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Check authentication
    const authOptions = await getAuthOptions();
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate request body
    const parseResult = OptimizeRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const {
      projectId,
      promptName,
      promptLabel,
      numIterations,
      numExamples,
      environment,
    } = parseResult.data;

    // TODO: Add project access check
    // throwIfNoProjectAccess({
    //   session,
    //   projectId,
    //   scope: "prompts:read",
    // });

    // Queue the optimization job
    const optimizationQueue = OptimizationQueue.getInstance();
    if (!optimizationQueue) {
      logger.error("OptimizationQueue not available");
      return res.status(503).json({
        error: "Optimization service not available",
      });
    }

    const jobId = `optimization-${projectId}-${Date.now()}`;
    await optimizationQueue.add(QueueJobs.OptimizationJob, {
      timestamp: new Date(),
      id: jobId,
      payload: {
        projectId,
        promptName: promptName || "",
        promptLabel: promptLabel || "",
        numIterations,
        numExamples,
        environment,
      },
      name: QueueJobs.OptimizationJob,
    });

    logger.info("Optimization job queued", {
      projectId,
      jobId,
      userId: session.user.id,
    });

    return res.status(200).json({
      success: true,
      message: "Optimization job started",
      jobId,
    });
  } catch (error) {
    logger.error("Error in optimize endpoint", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
