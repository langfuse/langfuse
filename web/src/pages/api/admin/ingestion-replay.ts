import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  eventTypes,
  logger,
  QueueJobs,
  SecondaryIngestionQueue,
  OtelIngestionQueue,
} from "@langfuse/shared/src/server";
import type { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";

const IngestionReplayBody = z.object({
  keys: z.array(z.string()).min(1).max(1000),
});

const OTEL_KEY_REGEX =
  /^otel\/([^/]+)\/(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})\/([^.]+)\.json$/;
const STANDARD_KEY_REGEX = /^([^/]+)\/([^/]+)\/(.+)\/([^/]+)\.json$/;

type StandardReplayJob = TQueueJobTypes[QueueName.IngestionSecondaryQueue];
type OtelReplayJob = TQueueJobTypes[QueueName.OtelIngestionQueue];

type StandardReplayEventType =
  TQueueJobTypes[QueueName.IngestionSecondaryQueue]["payload"]["data"]["type"];

const standardReplayEventTypes = new Set<StandardReplayEventType>(
  Object.values(eventTypes).filter((type): type is StandardReplayEventType =>
    type.endsWith("-create"),
  ),
);

const getStandardReplayEventType = (
  value: string,
): StandardReplayEventType | null => {
  const replayEventType = `${value}-create`;

  return standardReplayEventTypes.has(
    replayEventType as StandardReplayEventType,
  )
    ? (replayEventType as StandardReplayEventType)
    : null;
};

const enqueueStandardJobs = async (jobs: StandardReplayJob[]) => {
  const jobsByQueue = new Map<
    string,
    {
      queue: NonNullable<
        ReturnType<typeof SecondaryIngestionQueue.getInstance>
      >;
      jobs: StandardReplayJob[];
    }
  >();

  for (const job of jobs) {
    const shardingKey = `${job.payload.authCheck.scope.projectId}-${job.payload.data.eventBodyId}`;
    const queue = SecondaryIngestionQueue.getInstance({ shardingKey });

    if (!queue) {
      throw new Error("Failed to get SecondaryIngestionQueue");
    }

    const existing = jobsByQueue.get(queue.name);

    if (existing) {
      existing.jobs.push(job);
    } else {
      jobsByQueue.set(queue.name, { queue, jobs: [job] });
    }
  }

  await Promise.all(
    Array.from(jobsByQueue.values()).map(({ queue, jobs }) =>
      queue.addBulk(jobs.map((job) => ({ name: job.name, data: job }))),
    ),
  );
};

const enqueueOtelJobs = async (jobs: OtelReplayJob[]) => {
  const jobsByQueue = new Map<
    string,
    {
      queue: NonNullable<ReturnType<typeof OtelIngestionQueue.getInstance>>;
      jobs: OtelReplayJob[];
    }
  >();

  for (const job of jobs) {
    const shardingKey = `${job.payload.authCheck.scope.projectId}-${job.payload.data.fileKey}`;
    const queue = OtelIngestionQueue.getInstance({ shardingKey });

    if (!queue) {
      throw new Error("Failed to get OtelIngestionQueue");
    }

    const existing = jobsByQueue.get(queue.name);

    if (existing) {
      existing.jobs.push(job);
    } else {
      jobsByQueue.set(queue.name, { queue, jobs: [job] });
    }
  }

  await Promise.all(
    Array.from(jobsByQueue.values()).map(({ queue, jobs }) =>
      queue.addBulk(jobs.map((job) => ({ name: job.name, data: job }))),
    ),
  );
};

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

    const standardJobs: StandardReplayJob[] = [];

    const otelJobs: OtelReplayJob[] = [];

    let skipped = 0;
    const errors: string[] = [];

    for (const key of body.data.keys) {
      const otelMatch = key.match(OTEL_KEY_REGEX);
      if (otelMatch) {
        const [, projectId] = otelMatch;
        otelJobs.push({
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
        });
        continue;
      }

      const standardMatch = key.match(STANDARD_KEY_REGEX);
      if (standardMatch) {
        const [, projectId, type, eventBodyId, eventId] = standardMatch;
        const replayEventType = getStandardReplayEventType(type!);

        if (!replayEventType) {
          skipped++;
          errors.push(`Unsupported replay type: ${type}`);
          continue;
        }

        standardJobs.push({
          timestamp: new Date(),
          id: randomUUID(),
          payload: {
            data: {
              type: replayEventType,
              eventBodyId: eventBodyId!,
              fileKey: eventId!,
            },
            authCheck: {
              validKey: true,
              scope: { projectId: projectId! },
            },
          },
          name: QueueJobs.IngestionJob,
        });
        continue;
      }

      skipped++;
      errors.push(`Invalid key format: ${key}`);
    }

    if (standardJobs.length > 0) {
      await enqueueStandardJobs(standardJobs);
    }

    if (otelJobs.length > 0) {
      await enqueueOtelJobs(otelJobs);
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
