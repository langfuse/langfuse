import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod/v4";
import {
  logger,
  QueueName,
  getQueue,
  IngestionQueue,
} from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";

/* 
This API route is used by Langfuse Cloud to retry failed bullmq jobs.
*/

const BullStatus = z.enum([
  "completed",
  "failed",
  "active",
  "delayed",
  "prioritized",
  "paused",
  "wait",
]);

const ManageBullBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("retry"),
    queueNames: z.array(z.string()),
  }),
  z.object({
    action: z.literal("remove"),
    queueNames: z.array(z.string()),
    bullStatus: BullStatus,
  }),
]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // allow only POST and GET requests
    if (req.method !== "POST" && req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    if (!AdminApiAuthService.handleAdminAuth(req, res, false)) {
      return;
    }

    const body = ManageBullBody.safeParse(req.body);

    if (!body.success) {
      res.status(400).json({ error: body.error });
      return;
    }

    if (req.method === "GET") {
      const queues: string[] = Object.values(QueueName);
      queues.push(...IngestionQueue.getShardNames());
      const queueCounts = await Promise.all(
        queues.map(async (queueName) => {
          try {
            const queue = queueName.startsWith(QueueName.IngestionQueue)
              ? IngestionQueue.getInstance({ shardName: queueName })
              : getQueue(
                  queueName as Exclude<QueueName, QueueName.IngestionQueue>,
                );
            const jobCount = await queue?.getJobCounts();
            return { queueName, jobCount };
          } catch (e) {
            logger.error(`Failed to get job count for queue ${queueName}`, e);
            return { queueName, jobCount: NaN };
          }
        }),
      );
      return res.status(200).json(queueCounts);
    }

    if (req.method === "POST" && body.data.action === "remove") {
      logger.info(
        `Removing jobs for queues ${body.data.queueNames.join(", ")}`,
      );

      for (const queueName of body.data.queueNames) {
        const queue = queueName.startsWith(QueueName.IngestionQueue)
          ? IngestionQueue.getInstance({ shardName: queueName })
          : getQueue(queueName as Exclude<QueueName, QueueName.IngestionQueue>);

        let totalCount = 0;
        let failedCountInLoop;
        let loopCount = 0;
        const maxLoops = 200;

        do {
          if (loopCount >= maxLoops) {
            logger.warn(
              `Circuit breaker activated: Stopped after ${maxLoops} iterations for queue ${queueName}`,
            );
            break;
          }

          failedCountInLoop =
            (await queue?.clean(0, 1000, body.data.bullStatus))?.length ?? 0;

          totalCount += failedCountInLoop;

          loopCount++;
        } while (failedCountInLoop > 0);

        logger.info(`Removed ${totalCount} jobs for queue ${queueName}`);
      }

      return res.status(200).json({ message: "Removed all jobs" });
    }

    if (req.method === "POST" && body.data.action === "retry") {
      logger.info(
        `Retrying jobs for queues ${body.data.queueNames.join(", ")}`,
      );

      for (const queueName of body.data.queueNames) {
        const queue = queueName.startsWith(QueueName.IngestionQueue)
          ? IngestionQueue.getInstance({ shardName: queueName })
          : getQueue(queueName as Exclude<QueueName, QueueName.IngestionQueue>);
        const jobCount = await queue?.getJobCounts("failed");
        logger.info(
          `Retrying ${JSON.stringify(jobCount)} jobs for queue ${queueName}`,
        );

        let count = 0;
        let failed;
        let loopCount = 0;
        const maxLoops = 200;

        do {
          if (loopCount >= maxLoops) {
            logger.warn(
              `Circuit breaker activated: Stopped after ${maxLoops} iterations for queue ${queueName}`,
            );
            break;
          }

          failed = await queue?.getJobs(["failed"], 0, 1000, true);
          if (failed && failed.length > 0) {
            await Promise.all(failed.map((job) => job.retry()));
            count += failed.length;
          }
          loopCount++;
        } while (failed && failed.length > 0);

        logger.info(`Retried ${count} jobs for queue ${queueName}`);
      }

      return res.status(200).json({ message: "Retried all jobs" });
    }

    // return not implemented error
    res.status(404).json({ error: "Action does not exist" });
  } catch (e) {
    logger.error("failed to manage bullmq jobs", e);
    res.status(500).json({ error: e });
  }
}
