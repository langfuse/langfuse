import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod/v4";
import {
  logger,
  QueueName,
  QueueJobs,
  S3RecoveryQueue,
  S3RecoveryJobSchema,
} from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";
import { v4 } from "uuid";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Only allow POST requests
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    // Admin authentication (same pattern as bullmq endpoint)
    if (
      !AdminApiAuthService.handleAdminAuth(req, res, {
        isAllowedOnLangfuseCloud: true,
      })
    ) {
      return;
    }

    // Validate request body
    const body = S3RecoveryJobSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error });
      return;
    }

    logger.info("S3 Recovery request received", {
      projectIds: body.data.projectIds,
      timeframeCount: body.data.timeframes.length,
    });

    // Get queue instance
    const queue = S3RecoveryQueue.getInstance();
    if (!queue) {
      throw new Error("Failed to get S3 recovery queue");
    }

    // Publish job to queue
    await queue.add(QueueJobs.S3RecoveryJob, {
      id: v4(),
      timestamp: new Date(),
      name: QueueJobs.S3RecoveryJob,
      payload: body.data,
    });

    logger.info("S3 Recovery job published to queue", {
      projectIds: body.data.projectIds,
      timeframeCount: body.data.timeframes.length,
    });

    return res.status(200).json({
      message: "S3 recovery job queued successfully",
      jobDetails: {
        projectIds: body.data.projectIds,
        timeframeCount: body.data.timeframes.length,
      },
    });
  } catch (e) {
    logger.error("Failed to queue S3 recovery job", e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "Internal server error",
    });
  }
}
