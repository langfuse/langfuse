import { type Processor } from "bullmq";
import { SpanKind } from "@opentelemetry/api";
import {
  AdminIssueDetectionJobSchema,
  executeAdminIssueRules,
  instrumentAsync,
  QueueJobs,
  QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { handleAdminIssueSchedule } from "../features/adminIssues/handleAdminIssueSchedule";

export const adminIssueScheduleProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.AdminIssueScheduleJob) {
    return await handleAdminIssueSchedule();
  }
};

export const adminIssueDetectionProcessor: Processor<
  TQueueJobTypes[QueueName.AdminIssueDetectionQueue]
> = async (job) => {
  if (job.name === QueueJobs.AdminIssueDetectionJob) {
    const { projectId } = AdminIssueDetectionJobSchema.parse(job.data.payload);
    return await instrumentAsync(
      {
        name: "process admin-issue-detection-project",
        startNewTrace: true,
        spanKind: SpanKind.CONSUMER,
      },
      () => executeAdminIssueRules(projectId),
    );
  }
};
