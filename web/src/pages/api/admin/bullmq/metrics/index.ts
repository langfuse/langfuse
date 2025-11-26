import { type NextApiRequest, type NextApiResponse } from "next";

import {
  logger,
  QueueName,
  getQueue,
  IngestionQueue,
  TraceUpsertQueue,
  OtelIngestionQueue,
} from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (
    !AdminApiAuthService.handleAdminAuth(req, res, {
      isAllowedOnLangfuseCloud: true,
    })
  ) {
    return;
  }

  try {
    // allow only GET requests
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    const queues: string[] = Object.values(QueueName);

    const metrics = await Promise.all(
      queues.map(async (queueName) => {
        let queue;
        if (queueName.startsWith(QueueName.IngestionQueue)) {
          queue = IngestionQueue.getInstance({ shardName: queueName });
        } else if (queueName.startsWith(QueueName.TraceUpsert)) {
          queue = TraceUpsertQueue.getInstance({ shardName: queueName });
        } else if (queueName.startsWith(QueueName.OtelIngestionQueue)) {
          queue = OtelIngestionQueue.getInstance({ shardName: queueName });
        } else {
          queue = getQueue(
            queueName as Exclude<
              QueueName,
              | QueueName.IngestionQueue
              | QueueName.TraceUpsert
              | QueueName.OtelIngestionQueue
            >,
          );
        }
        return queue?.exportPrometheusMetrics();
      }),
    );
    const result = metrics
      .filter((chunk): chunk is string => typeof chunk === "string")
      .join("\n");
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Content-Length": Buffer.byteLength(result),
    });
    res.end(result);
  } catch (error) {
    logger.error("Error fetching BullMQ metrics", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
