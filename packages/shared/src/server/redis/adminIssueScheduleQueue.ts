import { Queue } from "bullmq";
import { QueueName, QueueJobs } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { scheduleRecurringJob } from "./scheduleRecurringJob";
import { logger } from "../logger";

export class AdminIssueScheduleQueue {
  private static instance: Queue | null = null;

  public static getInstance(): Queue | null {
    if (AdminIssueScheduleQueue.instance) {
      return AdminIssueScheduleQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.AdminIssueScheduleQueue,
    );
    AdminIssueScheduleQueue.instance = queueOptionsWithRedis
      ? new Queue(QueueName.AdminIssueScheduleQueue, {
          ...queueOptionsWithRedis,
          defaultJobOptions: {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 1,
          },
        })
      : null;

    AdminIssueScheduleQueue.instance?.on("error", (err) => {
      logger.error("AdminIssueScheduleQueue error", err);
    });

    if (AdminIssueScheduleQueue.instance) {
      logger.debug("Scheduling jobs for AdminIssueScheduleQueue");
      scheduleRecurringJob(AdminIssueScheduleQueue.instance, {
        jobName: QueueJobs.AdminIssueScheduleJob,
        pattern: "0 0 * * *", // daily at midnight
      });
    }

    return AdminIssueScheduleQueue.instance;
  }
}
