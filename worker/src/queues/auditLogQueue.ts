import { Job } from "bullmq";
import {
  auditLogRecordInsertSchema,
  logger,
  QueueName,
  recordIncrement,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { ClickhouseWriter, TableName } from "../services/ClickhouseWriter";

/**
 * Hands one audit log row to the batching ClickHouse writer. A malformed
 * payload can never become valid on retry, so it is dropped with a metric
 * instead of failing the job.
 */
export const auditLogQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.AuditLogQueue]>,
) => {
  const parsed = auditLogRecordInsertSchema.safeParse(job.data.payload);
  if (!parsed.success) {
    logger.error("Dropping malformed audit log job", {
      jobId: job.id,
      error: parsed.error.message,
    });
    recordIncrement("langfuse.audit_log.malformed_job");
    return;
  }

  ClickhouseWriter.getInstance().addToQueue(TableName.AuditLogs, parsed.data);
};
