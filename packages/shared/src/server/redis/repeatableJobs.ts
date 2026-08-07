import type { RepeatOptions } from "bullmq";
import { QueueJobs } from "../queues";

type BullMQRepeatableJobName =
  | QueueJobs.CloudUsageMeteringJob
  | QueueJobs.CloudFreeTierUsageThresholdJob
  | QueueJobs.PostHogIntegrationJob
  | QueueJobs.MixpanelIntegrationJob
  | QueueJobs.DataRetentionJob
  | QueueJobs.DeadLetterRetryJob
  | QueueJobs.EventPropagationJob
  | QueueJobs.MeteringDataPostgresExportJob
  | QueueJobs.BlobStorageIntegrationJob
  | QueueJobs.CoreDataS3ExportJob;

type BullMQRepeatableJobRepeatOptions = Required<
  Pick<RepeatOptions, "key" | "pattern">
>;

type BullMQLegacyRepeatableJobName = "BlobStorageIntegrationHourlyJob";

// BullMQ's historical md5 repeatable-job keys for existing schedules. Supplying
// them explicitly avoids runtime md5 in FIPS mode without duplicating schedules
// that were already registered with BullMQ's previous md5 default.
export const BullMQRepeatableJobOptions = {
  [QueueJobs.CloudUsageMeteringJob]: {
    pattern: "5 * * * *",
    key: "377ab885ab66e6719c7ead551191bee4",
  },
  [QueueJobs.CloudFreeTierUsageThresholdJob]: {
    pattern: "35 * * * *",
    key: "d5679ede07cb19842de8380b672eddaf",
  },
  [QueueJobs.PostHogIntegrationJob]: {
    pattern: "30 * * * *",
    key: "0a227a38a1e4c356a72bdb4db2e204f1",
  },
  [QueueJobs.MixpanelIntegrationJob]: {
    pattern: "30 * * * *",
    key: "71871fb53c1ede72441eef93bec87956",
  },
  [QueueJobs.DataRetentionJob]: {
    pattern: "15 3 * * *",
    key: "ad0dea02aa06085752866b409f804a06",
  },
  [QueueJobs.DeadLetterRetryJob]: {
    pattern: "0 */10 * * * *",
    key: "798e2b5859ff4cf095e691e8caeb4ab4",
  },
  [QueueJobs.EventPropagationJob]: {
    pattern: "* * * * *",
    key: "e206e022c8ca55a314d66260950cf2a0",
  },
  [QueueJobs.MeteringDataPostgresExportJob]: {
    pattern: "30 2 * * *",
    key: "7e6f82188dba4df3c2f92932062a58da",
  },
  [QueueJobs.BlobStorageIntegrationJob]: {
    pattern: "*/20 * * * *",
    key: "457fa291e49e1b3e96583898a1796c53",
  },
  [QueueJobs.CoreDataS3ExportJob]: {
    pattern: "15 3 * * *",
    key: "fab5b5e1c08ecc80860350faaf20e4a3",
  },
} as const satisfies Record<
  BullMQRepeatableJobName,
  BullMQRepeatableJobRepeatOptions
>;

export const getBullMQRepeatableJobOptions = (
  jobName: BullMQRepeatableJobName,
): BullMQRepeatableJobRepeatOptions => ({
  ...BullMQRepeatableJobOptions[jobName],
});

export const BullMQLegacyRepeatableJobOptions = {
  BlobStorageIntegrationHourlyJob: {
    pattern: "20 * * * *",
    key: "0b26f715add3eee8c35ae11b26c0caf6",
  },
} as const satisfies Record<
  BullMQLegacyRepeatableJobName,
  BullMQRepeatableJobRepeatOptions
>;

export const getBullMQLegacyRepeatableJobOptions = (
  jobName: BullMQLegacyRepeatableJobName,
): BullMQRepeatableJobRepeatOptions => ({
  ...BullMQLegacyRepeatableJobOptions[jobName],
});
