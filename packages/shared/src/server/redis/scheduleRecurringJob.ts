import type { Queue, RepeatOptions, RepeatableJob } from "bullmq";
import { env } from "../../env";
import { logger } from "../logger";

// Keep this cleanup through V4. Without it, a direct upgrade from the legacy
// repeat API leaves an MD5-keyed schedule firing alongside the job scheduler.
// BullMQ v6 removes Queue.removeRepeatable(), so the cleanup must be completed
// before that upgrade. For FIPS, set cleanup to false from the first boot only
// when Redis has no legacy schedules. Upgrades must run cleanup in a non-FIPS
// deployment first.

const isLegacyRepeatableSchedule = (
  schedule: RepeatableJob,
  jobName: string,
): boolean =>
  // BullMQ stores Job Schedulers and legacy repeatables in the same sorted set.
  // This helper always uses the job name as the scheduler id, while legacy
  // repeatables have an MD5-derived key.
  schedule.key !== jobName && schedule.name === jobName;

const getRepeatOptions = (
  schedule: RepeatableJob,
): Pick<RepeatOptions, "pattern" | "every"> | null => {
  if (typeof schedule.pattern === "string") {
    return { pattern: schedule.pattern };
  }

  if (typeof schedule.every === "string") {
    const every = Number(schedule.every);
    if (Number.isFinite(every)) {
      return { every };
    }
  }

  return null;
};

/**
 * Registers a recurring cron job on a queue via a BullMQ job scheduler.
 *
 * Job schedulers replace the deprecated `Queue.add(name, data, { repeat })`
 * API. The legacy path replaced the pending next iteration in two separate
 * Redis round trips on every boot (delete the delayed job, then re-create
 * it), so a producer failing between the two - e.g. a container killed
 * mid-boot during a fleet-wide deploy - silently ended the schedule until
 * the next boot re-registered it. `upsertJobScheduler` performs the same
 * replacement in a single atomic Lua script, so concurrent boots and
 * mid-boot crashes cannot lose the chain. BullMQ v6 removes the legacy API
 * entirely.
 *
 * The scheduler id is the job name. Legacy schedules are keyed by
 * md5(name + pattern) instead, so this helper also removes the legacy
 * entries for the current pattern and any historical ones - without that
 * cleanup the old chain keeps firing in parallel with the scheduler. The
 * cleanup is idempotent and must stay in place for as long as a direct
 * upgrade from a Langfuse version that scheduled via the legacy API is
 * supported. It may be disabled only after a non-FIPS deployment has removed
 * every legacy schedule; disabling it earlier can leave both schedule types
 * active and duplicate recurring work.
 *
 * Never rejects: scheduling runs fire-and-forget from queue singleton
 * getters, so all failures are logged instead of thrown.
 */
export const scheduleRecurringJob = async (
  queue: Queue,
  opts: {
    jobName: string;
    pattern: string;
    /**
     * Cron patterns this job was registered with via the legacy repeat API
     * in earlier releases. The current pattern is always cleaned up and does
     * not need to be listed. When changing `pattern`, append the old value
     * here, since each legacy pattern was a separate schedule.
     */
    previousPatterns?: string[];
    /** Template data stored on the scheduler and passed to every iteration. */
    data?: Record<string, unknown>;
  },
): Promise<void> => {
  const { jobName, pattern, previousPatterns = [], data } = opts;
  const legacyRepeatOptions = new Map<
    string,
    Pick<RepeatOptions, "pattern" | "every">
  >(
    [pattern, ...previousPatterns].map((legacyPattern) => [
      `pattern:${legacyPattern}`,
      { pattern: legacyPattern },
    ]),
  );

  if (env.LANGFUSE_BULLMQ_LEGACY_REPEATABLE_JOB_CLEANUP === "true") {
    try {
      // Read stored metadata so cleanup covers historical patterns that were
      // not recorded in previousPatterns.
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- BullMQ stores legacy repeatables only behind this deprecated read API; keep until direct legacy upgrades are no longer supported.
      const legacySchedules = (await queue.getRepeatableJobs()).filter(
        (schedule) => isLegacyRepeatableSchedule(schedule, jobName),
      );
      for (const legacySchedule of legacySchedules) {
        const repeatOptions = getRepeatOptions(legacySchedule);
        if (!repeatOptions) {
          logger.error(
            `Cannot remove legacy ${jobName} schedule on ${queue.name}: its cadence is missing (key ${legacySchedule.key}).`,
          );
          continue;
        }

        const optionKey =
          "pattern" in repeatOptions
            ? `pattern:${repeatOptions.pattern}`
            : `every:${repeatOptions.every}`;
        legacyRepeatOptions.set(optionKey, repeatOptions);
      }
    } catch (err) {
      logger.error(
        `Cannot discover legacy ${jobName} schedules on ${queue.name}; removing known schedules only.`,
        err,
      );
    }

    for (const repeatOptions of legacyRepeatOptions.values()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- Removes schedules created by the deprecated repeat API in earlier releases; keep while direct upgrades from those releases are supported.
        await queue.removeRepeatable(jobName, repeatOptions);
      } catch (err) {
        logger.error(
          `Error removing legacy ${jobName} schedule on ${queue.name}`,
          err,
        );
      }
    }
  } else {
    try {
      // Read stored metadata only. Deriving a legacy repeat key would require
      // the MD5 operation this FIPS path is avoiding.
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- Read-only verification of legacy schedules is required before FIPS can skip the deprecated cleanup API; keep until direct legacy upgrades are no longer supported.
      const legacySchedules = await queue.getRepeatableJobs();
      const remainingLegacySchedule = legacySchedules.find((schedule) =>
        isLegacyRepeatableSchedule(schedule, jobName),
      );

      if (remainingLegacySchedule) {
        logger.error(
          `Cannot register ${jobName} scheduler on ${queue.name}: legacy repeatable schedule (key ${remainingLegacySchedule.key}) remains. Run with LANGFUSE_BULLMQ_LEGACY_REPEATABLE_JOB_CLEANUP=true in a non-FIPS deployment before disabling legacy cleanup.`,
        );
        return;
      }
    } catch (err) {
      logger.error(
        `Cannot verify legacy repeatable schedules for ${jobName} on ${queue.name}; not registering a scheduler while legacy cleanup is disabled.`,
        err,
      );
      return;
    }
  }

  try {
    await queue.upsertJobScheduler(
      jobName,
      { pattern },
      { name: jobName, data: data ?? {} },
    );
  } catch (err) {
    logger.error(
      `Error upserting ${jobName} scheduler on ${queue.name} - the recurring job may not run until the next boot`,
      err,
    );
  }
};
