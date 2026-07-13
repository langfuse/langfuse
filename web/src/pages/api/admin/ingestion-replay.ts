import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  eventTypes,
  logger,
  parseEventKey,
  QueueJobs,
  rawEventBucketPrefix,
  SecondaryIngestionQueue,
  OtelIngestionQueue,
  UNKNOWN_INGESTION_SDK_VALUE,
} from "@langfuse/shared/src/server";
import type { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";

const IngestionReplayBody = z.object({
  keys: z.array(z.string()).min(1).max(1000),
});

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
      const parsed = parseEventKey(key);
      if (parsed?.kind === "otel") {
        otelJobs.push({
          timestamp: new Date(),
          id: randomUUID(),
          payload: {
            data: { fileKey: key, publicKey: "" },
            authCheck: {
              validKey: true,
              scope: { projectId: parsed.projectId, accessLevel: "project" },
            },
            sdkName: UNKNOWN_INGESTION_SDK_VALUE,
            sdkVersion: UNKNOWN_INGESTION_SDK_VALUE,
          },
          name: QueueJobs.OtelIngestionJob,
        });
        continue;
      }

      if (parsed?.kind === "standard") {
        const { projectId, entityType, eventBodyId, eventId } = parsed;
        const replayEventType = getStandardReplayEventType(entityType);

        if (!replayEventType) {
          skipped++;
          errors.push(`Unsupported replay type: ${entityType}`);
          continue;
        }

        // The parsed eventBodyId is the literal segment as it sits in S3 —
        // could be sanitized + hashed (newer producer), raw SDK id (older
        // producer), or any future shape. Pass it through verbatim via
        // rawEventBucketPrefix so the worker reads from the same key the
        // original write produced, regardless of which producer wrote it.
        const bucketPrefix = rawEventBucketPrefix({
          projectId,
          entityType,
          rawEntityIdSegment: eventBodyId,
        });

        standardJobs.push({
          timestamp: new Date(),
          id: randomUUID(),
          payload: {
            data: {
              type: replayEventType,
              eventBodyId,
              fileKey: eventId,
              bucketPrefix,
              ingestionApiKey: "",
              ingestionSdkName: UNKNOWN_INGESTION_SDK_VALUE,
              ingestionSdkVersion: UNKNOWN_INGESTION_SDK_VALUE,
            },
            authCheck: {
              validKey: true,
              scope: { projectId },
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
