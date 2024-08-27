import { VERSION } from "@/src/constants";
import { ServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { v4 as uuidv4 } from "uuid";

// Interval between jobs in milliseconds
const JOB_INTERVAL_MINUTES = Prisma.raw("60");

// Timeout for job in minutes, if job is not finished in this time, it will be retried
const JOB_TIMEOUT_MINUTES = Prisma.raw("10");

export async function telemetry() {
  try {
    // Only run in prod
    if (process.env.NODE_ENV !== "production") return;
    // Do not run in Lanfuse cloud, separate telemetry is used
    if (process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined) return;
    // Check if telemetry is not disabled, except for EE
    if (
      process.env.TELEMETRY_ENABLED === "false" &&
      process.env.LANGFUSE_EE_LICENSE_KEY === undefined
    )
      return;
    // Do not run in CI
    if (process.env.CI) return;

    // Check via db cron_jobs table if it is time to run job
    const job = await jobScheduler();

    if (job.shouldRunJob) {
      const { jobStartedAt, lastRun, clientId } = job;

      // Run telemetry job
      await posthogTelemetry({
        startTimeframe: lastRun,
        endTimeframe: jobStartedAt,
        clientId,
      });

      // Update cron_jobs table
      await prisma.cronJobs.update({
        where: { name: "telemetry" },
        data: { lastRun: jobStartedAt, state: clientId, jobStartedAt: null },
      });
    }
  } catch (error) {
    // Catch all errors to be sure telemetry does not break the application
    console.error("Telemetry, unexpected error:", error);
  }
}

/**
 * Checks if a job should be scheduled and returns the necessary information.
 * @returns A promise that resolves to an object with the following properties:
 * - shouldRunJob: A boolean indicating whether the job should be run.
 * - job_started_at: The timestamp when the job was started.
 * - last_run: The timestamp of the last run of the job, or null if it has never run.
 * - clientId: A unique clienId that identifies the host.
 */
async function jobScheduler(): Promise<
  | { shouldRunJob: false }
  | {
      shouldRunJob: true;
      jobStartedAt: Date;
      lastRun: Date | null;
      clientId: string;
    }
> {
  // Check if job should run, without a lock to not impact performance
  // "not exists" triggers when this is run for the very first time in a container
  const checkNoLock = await prisma.$queryRaw<Array<{ status: boolean }>>`
    SELECT (
      EXISTS (
        SELECT 1 
        FROM cron_jobs 
        WHERE name = 'telemetry' 
        AND (last_run IS NULL OR last_run <= (NOW() - INTERVAL '${JOB_INTERVAL_MINUTES} minute')) 
        AND (job_started_at IS NULL OR job_started_at <= (NOW() - INTERVAL '${JOB_TIMEOUT_MINUTES} minute'))
      )
      OR NOT EXISTS (
        SELECT 1 
        FROM cron_jobs 
        WHERE name = 'telemetry'
      ) 
    ) AS status;`;
  // Return if job should not run
  if (checkNoLock.length !== 1) {
    console.error("Telemetry failed to check if job should run");
    return { shouldRunJob: false };
  }
  if (!checkNoLock[0]!.status) return { shouldRunJob: false };

  // Lock table and update job_started_at if no other job was created in the meantime
  const res = await prisma.$transaction([
    prisma.$executeRaw`LOCK TABLE cron_jobs IN SHARE ROW EXCLUSIVE MODE`,
    prisma.$queryRaw<
      Array<{
        name: string;
        last_run: Date | null;
        job_started_at: Date | null;
        state: string | null;
      }>
    >`INSERT INTO cron_jobs (name, last_run, job_started_at, state)
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
    RETURNING *`,
  ]);
  const createJobLocked = res[1];

  // Other job was created in the meantime
  if (createJobLocked.length !== 1) {
    console.error("Telemetry job is locked");
    return { shouldRunJob: false };
  }

  const jobStartedAt = createJobLocked[0]?.job_started_at ?? null;

  // should not happen
  if (!jobStartedAt) {
    console.error("Telemetry failed to create job_started_at");
    return { shouldRunJob: false };
  }

  // set vars
  const lastRun = createJobLocked[0]?.last_run ?? null;
  const clientId = createJobLocked[0]?.state ?? uuidv4();

  return { shouldRunJob: true, jobStartedAt, lastRun, clientId };
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
    const posthog = new ServerPosthog();
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

    // Domains (no PII)
    const domains = await prisma.$queryRaw<Array<{ domain: string }>>`
      SELECT
        substring(email FROM position('@' in email) + 1) as domain,
        count(id)::int as "userCount"
      FROM users
      WHERE email ILIKE '%@%'
      GROUP BY 1
      ORDER BY count(id) desc
      LIMIT 30
    `;

    posthog.capture({
      distinctId: "docker:" + clientId,
      event: "telemetry",
      properties: {
        langfuseVersion: VERSION,
        userDomains: domains,
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
        eeLicenseKey: process.env.LANGFUSE_EE_LICENSE_KEY,
        langfuseCloudRegion: process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
        $set: {
          environment: process.env.NODE_ENV,
          userDomains: domains,
          docker: true,
          langfuseVersion: VERSION,
        },
      },
    });

    await posthog.shutdownAsync();
  } catch (error) {
    console.error(error);
  }
}
