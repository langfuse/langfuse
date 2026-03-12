import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod/v4";
import { v4 as uuidv4 } from "uuid";
import {
  EvalExecutionQueue,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";
import { prisma } from "@langfuse/shared/src/db";

const ManageEvalBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("retry"),
    createdAtCutoff: z.coerce.date(),
    status: z.enum(["ERROR"]).nullable(),
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

    if (
      !AdminApiAuthService.handleAdminAuth(req, res, {
        isAllowedOnLangfuseCloud: true,
      })
    ) {
      return;
    }

    const body = ManageEvalBody.safeParse(req.body);

    if (!body.success) {
      res.status(400).json({ error: body.error });
      return;
    }

    if (req.method === "POST" && body.data.action === "retry") {
      logger.info(
        `Retrying eval jobs for createdAtCutoff ${body.data.createdAtCutoff}`,
      );

      const jobs = await prisma.jobExecution.findMany({
        where: {
          createdAt: {
            gte: body.data.createdAtCutoff,
          },
          status: body.data.status ?? undefined,
        },
      });

      if (jobs && jobs.length > 0) {
        const chunkSize = 1000;
        for (let i = 0; i < jobs.length; i += chunkSize) {
          const chunk = jobs.slice(i, i + chunkSize);
          const jobsByShard = new Map<
            string,
            {
              queue: NonNullable<
                ReturnType<typeof EvalExecutionQueue.getInstance>
              >;
              jobs: Array<{
                name: QueueJobs.EvaluationExecution;
                data: {
                  timestamp: Date;
                  id: string;
                  payload: {
                    jobExecutionId: string;
                    projectId: string;
                    delay: number;
                  };
                  name: QueueJobs.EvaluationExecution;
                };
              }>;
            }
          >();

          chunk.forEach((job) => {
            const queue = EvalExecutionQueue.getInstance({
              shardingKey: EvalExecutionQueue.getShardingKey({
                projectId: job.projectId,
                jobExecutionId: job.id,
              }),
            });

            if (!queue) {
              throw new Error("Failed to get evaluation execution queue");
            }

            const existing = jobsByShard.get(queue.name) ?? {
              queue,
              jobs: [],
            };

            existing.jobs.push({
              name: QueueJobs.EvaluationExecution,
              data: {
                timestamp: new Date(),
                id: uuidv4(),
                payload: {
                  jobExecutionId: job.id,
                  projectId: job.projectId,
                  delay: 0,
                },
                name: QueueJobs.EvaluationExecution,
              },
            });

            jobsByShard.set(queue.name, existing);
          });

          await Promise.all(
            Array.from(jobsByShard.values()).map(({ queue, jobs }) =>
              queue.addBulk(jobs),
            ),
          );
        }
      }

      return res.status(200).json({ message: "Retried all jobs" });
    }

    // return not implemented error
    res.status(404).json({ error: "Action does not exist" });
  } catch (e) {
    logger.error("failed to manage bullmq jobs", e);
    res
      .status(500)
      .json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
}
