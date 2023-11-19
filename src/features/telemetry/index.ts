import { prisma } from "@/src/server/db";
import { Prisma } from "@prisma/client";
import { PostHog } from "posthog-node";
import { v4 as uuidv4 } from "uuid";

// Safe as it is intended to be public
const POSTHOG_API_KEY = "phc_zkMwFajk8ehObUlMth0D7DtPItFnxETi3lmSvyQDrwB";

// Interval between jobs in milliseconds
const JOB_INTERVAL_MINUTES = Prisma.raw("60");
// Timeout for job in minutes, if job is not finished in this time, it will be retried
const JOB_TIMEOUT_MINUTES = Prisma.raw("10");

export async function telemetry() {
  // Check if job should run
  // This does not need a lock to reduce performance impact
  const checkNoLock = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM cron_jobs
    WHERE name = 'telemetry' 
      AND (last_run IS NULL OR last_run <= (NOW() - INTERVAL '${JOB_INTERVAL_MINUTES} minutes'))
      AND (job_started_at IS NULL OR job_started_at <= (NOW() - INTERVAL '${JOB_TIMEOUT_MINUTES} minutes'))`;
  // Return if job should not run
  if (checkNoLock.length === 0) return;

  // Lock table and update job_started_at if no other job was created in the meantime
  const createJobLocked = await prisma.$queryRaw<
    Array<{
      name: string;
      last_run: Date | null;
      job_started_at: Date | null;
      state: string | null;
    }>
  >`
    BEGIN;
    LOCK TABLE cron_jobs IN SHARE ROW EXCLUSIVE MODE;

    INSERT INTO cron_jobs (name, last_run, job_started_at, state)
    VALUES ('telemetry', NULL, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT (name) 
    DO UPDATE 
    SET job_started_at = CASE 
        WHEN (cron_jobs.last_run IS NULL OR cron_jobs.last_run <= (NOW() - INTERVAL '${JOB_INTERVAL_MINUTES} minutes')) 
          AND (cron_jobs.job_started_at IS NULL OR cron_jobs.job_started_at <= (NOW() - INTERVAL '${JOB_TIMEOUT_MINUTES} minutes'))
        THEN CURRENT_TIMESTAMP 
        ELSE cron_jobs.job_started_at 
        END
    WHERE cron_jobs.name = 'telemetry' 
      AND (cron_jobs.last_run IS NULL OR cron_jobs.last_run <= (NOW() - INTERVAL '${JOB_INTERVAL_MINUTES} minutes')) 
      AND (cron_jobs.job_started_at IS NULL OR cron_jobs.job_started_at <= (NOW() - INTERVAL '${JOB_TIMEOUT_MINUTES} minutes'))
    RETURNING *;

    COMMIT;`;
  if (createJobLocked.length !== 1) {
    console.error("Telemetry job is locked");
    return;
  }

  const job_started_at = createJobLocked[0]?.job_started_at ?? null;
  if (!job_started_at) {
    console.error("Telemetry failed to create job_started_at");
    return;
  }
  console.log("Telemetry: ", JSON.stringify(createJobLocked[0]));

  // vars
  const last_run = createJobLocked[0]?.last_run ?? null;
  const state = createJobLocked[0]?.state ?? uuidv4();

  // Run telemetry job
  await posthogTelemetry({
    startTimeframe: last_run,
    endTimeframe: job_started_at,
    clientId: state,
  });

  // Update last_run
  await prisma.cronJobs.update({
    where: { name: "telemetry" },
    data: { lastRun: job_started_at, state, jobStartedAt: null },
  });
}

async function posthogTelemetry({
  startTimeframe,
  endTimeframe,
  clientId,
}: {
  startTimeframe: Date | null;
  endTimeframe: Date;
  clientId: string;
}) {
  try {
    const posthog = new PostHog(POSTHOG_API_KEY, {
      host: "https://eu.posthog.com",
    });
    if (process.env.NODE_ENV === "development") posthog.debug();

    // Count projects
    const totalProjects = await prisma.project.count();

    // Count traces
    const countTraces = await prisma.trace.count({
      where: {
        timestamp: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count scores
    const countScores = await prisma.score.count({
      where: {
        timestamp: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count observations
    const countObservations = await prisma.observation.count({
      where: {
        startTime: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count datasets
    const countDatasets = await prisma.dataset.count({
      where: {
        createdAt: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count dataset items
    const countDatasetItems = await prisma.datasetItem.count({
      where: {
        createdAt: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count dataset runs
    const countDatasetRuns = await prisma.datasetRuns.count({
      where: {
        createdAt: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    // Count dataset run items
    const countDatasetRunItems = await prisma.datasetRunItems.count({
      where: {
        createdAt: {
          gte: startTimeframe?.toISOString(),
          lt: endTimeframe.toISOString(),
        },
      },
    });

    posthog.identify({
      distinctId: "docker:" + clientId,
      properties: {
        environment: process.env.NODE_ENV,
        docker: true,
      },
    });
    posthog.capture({
      distinctId: "docker:" + clientId,
      event: "telemetry",
      properties: {
        totalProjects: totalProjects,
        traces: countTraces,
        scores: countScores,
        observations: countObservations,
        datasets: countDatasets,
        datasetItems: countDatasetItems,
        datasetRuns: countDatasetRuns,
        datasetRunItems: countDatasetRunItems,
        startTimeframe: startTimeframe?.toISOString(),
        endTimeframe: endTimeframe.toISOString(),
      },
    });

    await posthog.shutdownAsync();

    await prisma.cronJobs.upsert({
      where: { name: "telemetry" },
      update: { lastRun: endTimeframe, state: clientId },
      create: { name: "telemetry", lastRun: endTimeframe, state: clientId },
    });
  } catch (error) {
    console.error(error);
  }
}
