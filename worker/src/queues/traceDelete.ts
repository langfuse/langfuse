import { Job, Processor } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";

import { env } from "../env";
import { processClickhouseTraceDelete } from "../features/traces/processClickhouseTraceDelete";
import { processPostgresTraceDelete } from "../features/traces/processPostgresTraceDelete";

export const traceDeleteProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.TraceDelete]>,
): Promise<void> => {
  const projectId = job.data.payload.projectId;
  const traceIds =
    "traceIds" in job.data.payload
      ? job.data.payload.traceIds
      : [job.data.payload.traceId];

  await processPostgresTraceDelete(projectId, traceIds);

  if (env.CLICKHOUSE_URL) {
    await processClickhouseTraceDelete(projectId, traceIds);
  }
};
