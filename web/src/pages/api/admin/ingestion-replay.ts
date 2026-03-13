import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod/v4";
import { randomUUID } from "crypto";
import {
  logger,
  QueueJobs,
  SecondaryIngestionQueue,
  OtelIngestionQueue,
} from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";

const IngestionReplayBody = z.object({
  keys: z.array(z.string()).min(1).max(1000),
});

const OTEL_KEY_REGEX =
  /^otel\/([^/]+)\/(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})\/([^.]+)\.json$/;
const STANDARD_KEY_REGEX = /^([^/]+)\/([^/]+)\/(.+)\/([^/]+)\.json$/;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST") {
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

    const body = IngestionReplayBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error });
      return;
    }

    const standardJobs: Array<{
      name: QueueJobs.IngestionJob;
      data: {
        timestamp: Date;
        id: string;
        payload: {
          data: { type: any; eventBodyId: string; fileKey: string };
          authCheck: {
            validKey: true;
            scope: { projectId: string };
          };
        };
        name: QueueJobs.IngestionJob;
      };
    }> = [];

    const otelJobs: Array<{
      name: QueueJobs.OtelIngestionJob;
      data: {
        timestamp: Date;
        id: string;
        payload: {
          data: { fileKey: string };
          authCheck: {
            validKey: true;
            scope: { projectId: string; accessLevel: "project" };
          };
        };
        name: QueueJobs.OtelIngestionJob;
      };
    }> = [];

    let skipped = 0;
    const errors: string[] = [];

    for (const key of body.data.keys) {
      const otelMatch = key.match(OTEL_KEY_REGEX);
      if (otelMatch) {
        const [, projectId] = otelMatch;
        otelJobs.push({
          name: QueueJobs.OtelIngestionJob,
          data: {
            timestamp: new Date(),
            id: randomUUID(),
            payload: {
              data: { fileKey: key },
              authCheck: {
                validKey: true,
                scope: { projectId: projectId!, accessLevel: "project" },
              },
            },
            name: QueueJobs.OtelIngestionJob,
          },
        });
        continue;
      }

      const standardMatch = key.match(STANDARD_KEY_REGEX);
      if (standardMatch) {
        const [, projectId, type, eventBodyId, eventId] = standardMatch;
        standardJobs.push({
          name: QueueJobs.IngestionJob,
          data: {
            timestamp: new Date(),
            id: randomUUID(),
            payload: {
              data: {
                type: `${type}-create`,
                eventBodyId: eventBodyId!,
                fileKey: eventId!,
              },
              authCheck: {
                validKey: true,
                scope: { projectId: projectId! },
              },
            },
            name: QueueJobs.IngestionJob,
          },
        });
        continue;
      }

      skipped++;
      errors.push(`Invalid key format: ${key}`);
    }

    if (standardJobs.length > 0) {
      const queue = SecondaryIngestionQueue.getInstance();
      if (!queue) {
        throw new Error("Failed to get SecondaryIngestionQueue");
      }
      await queue.addBulk(standardJobs);
    }

    if (otelJobs.length > 0) {
      const queue = OtelIngestionQueue.getInstance({});
      if (!queue) {
        throw new Error("Failed to get OtelIngestionQueue");
      }
      await queue.addBulk(otelJobs);
    }

    const queued = standardJobs.length + otelJobs.length;

    logger.info(
      `Ingestion replay: queued ${queued}, skipped ${skipped}, errors ${errors.length}`,
    );

    return res.status(200).json({ queued, skipped, errors });
  } catch (e) {
    logger.error("Failed to replay ingestion events", e);
    res
      .status(500)
      .json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
}
