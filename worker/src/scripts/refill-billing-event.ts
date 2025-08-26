// This script can be used to manually retrigger the metering job.
// Execute with caution in production.
import { QueueJobs, CloudUsageMeteringQueue } from "@langfuse/shared/server";
import { logger } from "@langfuse/shared/server";
import { redis } from "@langfuse/shared/server";

const main = async () => {
  // Create queue connection
  const billingQueue = CloudUsageMeteringQueue.getInstance();

  await billingQueue?.add(QueueJobs.CloudUsageMeteringJob, {
    name: QueueJobs.CloudUsageMeteringJob as const,
  });

  logger.info("Done triggering billing event");
};

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("Error running script:", err);
    })
    .finally(() => {
      redis?.disconnect();
      process.exit(0);
    });
}
