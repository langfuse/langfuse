import { Job } from "bullmq";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  getCurrentSpan,
  getTracesForKubit,
  getObservationsForKubit,
  getScoresForKubit,
  getEventsForKubit,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { KubitClient } from "./kubitClient";
import { RedisLock } from "../../utils/RedisLock";
import { env } from "../../env";
import { z } from "zod/v4";

// ── Token endpoint ──

const tokenResponseSchema = z.object({
  credentials: z.object({
    AccessKeyId: z.string(),
    SecretAccessKey: z.string(),
    SessionToken: z.string(),
  }),
  metadata: z.object({
    partition_key: z.string(),
    stream_name: z.string(),
    region: z.string(),
    expiry: z.string(),
  }),
});

type AwsCredentials = {
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken: string;
  awsKinesisRegion: string;
  awsKinesisStreamName: string;
  awsKinesisPartitionKey: string;
};

async function getOrRefreshAwsCredentials(params: {
  dbIntegration: {
    endpointUrl: string;
    encryptedApiKey: string;
    encryptedAwsAccessKeyId: string | null;
    encryptedAwsSecretAccessKey: string | null;
    encryptedAwsSessionToken: string | null;
    awsCredentialsExpiry: Date | null;
    awsKinesisStreamName: string | null;
    awsKinesisRegion: string | null;
    awsKinesisPartitionKey: string | null;
    projectId: string;
  };
}): Promise<AwsCredentials | undefined> {
  const { dbIntegration } = params;

  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  const credentialsValid =
    dbIntegration.awsCredentialsExpiry !== null &&
    dbIntegration.awsCredentialsExpiry > fiveMinutesFromNow &&
    dbIntegration.encryptedAwsAccessKeyId !== null &&
    dbIntegration.encryptedAwsSecretAccessKey !== null &&
    dbIntegration.encryptedAwsSessionToken !== null &&
    dbIntegration.awsKinesisStreamName !== null &&
    dbIntegration.awsKinesisRegion !== null &&
    dbIntegration.awsKinesisPartitionKey !== null;

  if (credentialsValid) {
    return {
      awsAccessKeyId: decrypt(dbIntegration.encryptedAwsAccessKeyId!),
      awsSecretAccessKey: decrypt(dbIntegration.encryptedAwsSecretAccessKey!),
      awsSessionToken: decrypt(dbIntegration.encryptedAwsSessionToken!),
      awsKinesisRegion: dbIntegration.awsKinesisRegion!,
      awsKinesisStreamName: dbIntegration.awsKinesisStreamName!,
      awsKinesisPartitionKey: dbIntegration.awsKinesisPartitionKey!,
    };
  }

  logger.info(
    `[KUBIT] Refreshing AWS credentials for project ${dbIntegration.projectId}`,
  );

  const tokenUrl = `${dbIntegration.endpointUrl}/token`;
  const apiKey = decrypt(dbIntegration.encryptedApiKey);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const message = `Token endpoint returned ${response.status}: ${errorText}`;

    if (response.status === 401 || response.status === 403) {
      // Permanent auth failure — disable the integration so the scheduler
      // stops retrying until the user fixes the API key.
      await prisma.kubitIntegration.update({
        where: { projectId: dbIntegration.projectId },
        data: { enabled: false, lastError: message },
      });
      logger.error(
        `[KUBIT] Disabling integration for project ${dbIntegration.projectId} — ${message}`,
      );
      // Return undefined to signal a permanent failure without throwing,
      // so BullMQ does not retry the job.
      return undefined;
    }

    throw new Error(`[KUBIT] ${message}`);
  }

  const raw = await response.json();
  const parsed = tokenResponseSchema.parse(raw);

  await prisma.kubitIntegration.update({
    where: { projectId: dbIntegration.projectId },
    data: {
      encryptedAwsAccessKeyId: encrypt(parsed.credentials.AccessKeyId),
      encryptedAwsSecretAccessKey: encrypt(parsed.credentials.SecretAccessKey),
      encryptedAwsSessionToken: encrypt(parsed.credentials.SessionToken),
      awsCredentialsExpiry: new Date(parsed.metadata.expiry),
      awsKinesisStreamName: parsed.metadata.stream_name,
      awsKinesisRegion: parsed.metadata.region,
      awsKinesisPartitionKey: parsed.metadata.partition_key,
    },
  });

  logger.info(
    `[KUBIT] AWS credentials refreshed for project ${dbIntegration.projectId}`,
    { expiry: parsed.metadata.expiry, region: parsed.metadata.region },
  );

  return {
    awsAccessKeyId: parsed.credentials.AccessKeyId,
    awsSecretAccessKey: parsed.credentials.SecretAccessKey,
    awsSessionToken: parsed.credentials.SessionToken,
    awsKinesisRegion: parsed.metadata.region,
    awsKinesisStreamName: parsed.metadata.stream_name,
    awsKinesisPartitionKey: parsed.metadata.partition_key,
  };
}

// ── Job config ──

type KubitConfig = {
  projectId: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  requestTimeoutSeconds: number;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken: string;
  awsKinesisRegion: string;
  awsKinesisStreamName: string;
  awsKinesisPartitionKey: string;
};

// ── Processors ──

const processKubitTraces = async (config: KubitConfig) => {
  const traces = getTracesForKubit(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  const client = new KubitClient({
    awsAccessKeyId: config.awsAccessKeyId,
    awsSecretAccessKey: config.awsSecretAccessKey,
    awsSessionToken: config.awsSessionToken,
    awsRegion: config.awsKinesisRegion,
    streamName: config.awsKinesisStreamName,
    projectId: config.projectId,
    workspaceId: config.awsKinesisPartitionKey,
    requestTimeoutSeconds: config.requestTimeoutSeconds,
  });
  let count = 0;

  try {
    for await (const trace of traces) {
      count++;
      client.addEvent(trace);
      if (client.shouldFlush()) {
        await client.flush();
        logger.info(
          `[KUBIT] Flushed batch, ${count} traces sent so far for project ${config.projectId}`,
        );
      }
    }

    await client.flush();
    logger.info(
      `[KUBIT] Sent ${count} traces total for project ${config.projectId}`,
    );
  } finally {
    await client.destroy();
  }
};

const processKubitObservations = async (config: KubitConfig) => {
  const observations = getObservationsForKubit(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  const client = new KubitClient({
    awsAccessKeyId: config.awsAccessKeyId,
    awsSecretAccessKey: config.awsSecretAccessKey,
    awsSessionToken: config.awsSessionToken,
    awsRegion: config.awsKinesisRegion,
    streamName: config.awsKinesisStreamName,
    projectId: config.projectId,
    workspaceId: config.awsKinesisPartitionKey,
    requestTimeoutSeconds: config.requestTimeoutSeconds,
  });
  let count = 0;

  try {
    for await (const observation of observations) {
      count++;
      client.addEvent(observation);
      if (client.shouldFlush()) {
        await client.flush();
        logger.info(
          `[KUBIT] Flushed batch, ${count} observations sent so far for project ${config.projectId}`,
        );
      }
    }

    await client.flush();
    logger.info(
      `[KUBIT] Sent ${count} observations total for project ${config.projectId}`,
    );
  } finally {
    await client.destroy();
  }
};

const processKubitScores = async (config: KubitConfig) => {
  const scores = getScoresForKubit(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  const client = new KubitClient({
    awsAccessKeyId: config.awsAccessKeyId,
    awsSecretAccessKey: config.awsSecretAccessKey,
    awsSessionToken: config.awsSessionToken,
    awsRegion: config.awsKinesisRegion,
    streamName: config.awsKinesisStreamName,
    projectId: config.projectId,
    workspaceId: config.awsKinesisPartitionKey,
    requestTimeoutSeconds: config.requestTimeoutSeconds,
  });
  let count = 0;

  try {
    for await (const score of scores) {
      count++;
      client.addEvent(score);
      if (client.shouldFlush()) {
        await client.flush();
        logger.info(
          `[KUBIT] Flushed batch, ${count} scores sent so far for project ${config.projectId}`,
        );
      }
    }

    await client.flush();
    logger.info(
      `[KUBIT] Sent ${count} scores total for project ${config.projectId}`,
    );
  } finally {
    await client.destroy();
  }
};

const processKubitEvents = async (config: KubitConfig) => {
  const events = getEventsForKubit(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  const client = new KubitClient({
    awsAccessKeyId: config.awsAccessKeyId,
    awsSecretAccessKey: config.awsSecretAccessKey,
    awsSessionToken: config.awsSessionToken,
    awsRegion: config.awsKinesisRegion,
    streamName: config.awsKinesisStreamName,
    projectId: config.projectId,
    workspaceId: config.awsKinesisPartitionKey,
    requestTimeoutSeconds: config.requestTimeoutSeconds,
  });
  let count = 0;

  try {
    for await (const event of events) {
      count++;
      client.addEvent(event);
      if (client.shouldFlush()) {
        await client.flush();
        logger.info(
          `[KUBIT] Flushed batch, ${count} enriched observations sent so far for project ${config.projectId}`,
        );
      }
    }

    await client.flush();
    logger.info(
      `[KUBIT] Sent ${count} enriched observations total for project ${config.projectId}`,
    );
  } finally {
    await client.destroy();
  }
};

// ── Main job handler ──

export const handleKubitProjectJob = async (
  job: Job<TQueueJobTypes[QueueName.KubitIntegrationProcessingQueue]>,
) => {
  const { projectId } = job.data.payload;

  const span = getCurrentSpan();
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.jobId", job.data.id);
    span.setAttribute("messaging.bullmq.job.input.projectId", projectId);
  }

  const dbIntegration = await prisma.kubitIntegration.findFirst({
    where: { projectId, enabled: true },
  });

  if (!dbIntegration) {
    logger.info(
      `[KUBIT] No enabled Kubit integration for project ${projectId}, skipping`,
    );
    return;
  }

  logger.info(`[KUBIT] Processing Kubit integration for project ${projectId}`);

  // Distributed lock — ensures only one worker processes this project at a time.
  // TTL is 4 hours; the lock is released atomically in the finally block so
  // normal runs don't hold it for the full TTL.
  const lock = new RedisLock(`kubit:lock:${projectId}`, {
    ttlSeconds: 4 * 60 * 60,
    name: "KUBIT",
    onUnavailable: "proceed",
  });

  const lockResult = await lock.acquire();
  if (lockResult === "held_by_other") {
    logger.info(
      `[KUBIT] Another worker is already processing project ${projectId}, skipping`,
    );
    return;
  }

  try {
    const awsCredentials = await getOrRefreshAwsCredentials({ dbIntegration });

    // Permanent auth failure — integration has been disabled, nothing left to do.
    if (!awsCredentials) return;

    // ── Determine the sync window ──
    //
    // On the first attempt we pick a fresh maxTimestamp and persist it so that
    // every retry uses the exact same window. This prevents the window from
    // drifting forward on retries, which would cause gaps or leave already-
    // succeeded processors running against a different range the second time.
    const maxTimestamp: Date =
      dbIntegration.currentSyncMaxTimestamp ?? new Date();

    if (!dbIntegration.currentSyncMaxTimestamp) {
      await prisma.kubitIntegration.update({
        where: { projectId },
        data: { currentSyncMaxTimestamp: maxTimestamp },
      });
      logger.info(
        `[KUBIT] Starting new sync window for project ${projectId} up to ${maxTimestamp.toISOString()}`,
      );
    } else {
      logger.info(
        `[KUBIT] Retrying sync window for project ${projectId} up to ${maxTimestamp.toISOString()}`,
      );
    }

    const config: KubitConfig = {
      projectId,
      minTimestamp: dbIntegration.lastSyncAt ?? new Date("2000-01-01"),
      maxTimestamp,
      requestTimeoutSeconds: dbIntegration.requestTimeoutSeconds,
      ...awsCredentials,
    };

    // ── Per-processor skip logic ──
    //
    // After each processor completes successfully we write its syncedAt timestamp
    // to the DB. On retry we read back those timestamps and skip any processor
    // that already finished within this sync window — preventing duplicate sends
    // for the processors that succeeded before the failure.
    const alreadySynced = (syncedAt: Date | null): boolean =>
      syncedAt !== null && syncedAt.getTime() >= maxTimestamp.getTime();

    const runOrSkip = async (
      name: string,
      syncedAt: Date | null,
      run: () => Promise<void>,
      markDone: () => Promise<void>,
    ): Promise<void> => {
      if (alreadySynced(syncedAt)) {
        logger.info(
          `[KUBIT] Skipping ${name} for project ${projectId} — already synced in this window`,
        );
        return;
      }
      await run();
      await markDone();
    };

    // Use allSettled so all processors always run to completion before we
    // throw — prevents lingering processors from Worker N overlapping with the
    // retry picked up by Worker N+1, which would cascade throttling on Kinesis.
    const processors: Promise<void>[] = [];

    // When the V4 events pipeline is active, send enriched observations
    // (denormalized, trace-context-embedded) instead of raw traces + observations.
    // The pipeline is active when LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE=true,
    // which is the deployment-level flag the admin sets when events_core is ready.
    const useV4Pipeline =
      env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true";

    // Scores always run regardless of pipeline mode
    processors.push(
      runOrSkip(
        "scores",
        dbIntegration.scoresSyncedAt,
        () => processKubitScores(config),
        () =>
          prisma.kubitIntegration
            .update({
              where: { projectId },
              data: { scoresSyncedAt: maxTimestamp },
            })
            .then(() => undefined),
      ),
    );

    // Legacy mode: raw traces + observations (V4 pipeline not active)
    if (!useV4Pipeline) {
      processors.push(
        runOrSkip(
          "traces",
          dbIntegration.tracesSyncedAt,
          () => processKubitTraces(config),
          () =>
            prisma.kubitIntegration
              .update({
                where: { projectId },
                data: { tracesSyncedAt: maxTimestamp },
              })
              .then(() => undefined),
        ),
        runOrSkip(
          "observations",
          dbIntegration.observationsSyncedAt,
          () => processKubitObservations(config),
          () =>
            prisma.kubitIntegration
              .update({
                where: { projectId },
                data: { observationsSyncedAt: maxTimestamp },
              })
              .then(() => undefined),
        ),
      );
    }

    // V4 mode: enriched observations with denormalized trace context
    if (useV4Pipeline) {
      processors.push(
        runOrSkip(
          "enriched observations",
          dbIntegration.eventsSyncedAt,
          () => processKubitEvents(config),
          () =>
            prisma.kubitIntegration
              .update({
                where: { projectId },
                data: { eventsSyncedAt: maxTimestamp },
              })
              .then(() => undefined),
        ),
      );
    }

    const results = await Promise.allSettled(processors);

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      const errors = failed.map((r) =>
        r.status === "rejected" ? r.reason : null,
      );
      errors.forEach((error) => {
        logger.error(
          `[KUBIT] Error processing Kubit integration for project ${projectId}`,
          error,
        );
      });

      const errorMessage = errors
        .map((e) => (e instanceof Error ? e.message : String(e)))
        .join("; ");

      await prisma.kubitIntegration.update({
        where: { projectId },
        data: { lastError: errorMessage },
      });

      throw errors[0];
    }

    // All three processors finished — advance the sync cursor and clear the
    // per-processor tracking so the next cron run starts fresh.
    await prisma.kubitIntegration.update({
      where: { projectId },
      data: {
        lastSyncAt: maxTimestamp,
        lastError: null,
        currentSyncMaxTimestamp: null,
        tracesSyncedAt: null,
        observationsSyncedAt: null,
        eventsSyncedAt: null,
        scoresSyncedAt: null,
      },
    });

    logger.info(`[KUBIT] Kubit integration complete for project ${projectId}`);
  } finally {
    if (lockResult === "acquired") {
      await lock.release();
    }
  }
};
