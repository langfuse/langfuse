import { Queue } from "bullmq";
import { QueueName } from "../queues";
import { BatchExportQueue } from "./batchExport";
import { CloudUsageMeteringQueue } from "./CloudUsageMeteringQueue";
import { DatasetRunItemUpsertQueue } from "./datasetRunItemUpsert";
import { EvalExecutionQueue } from "./evalExecutionQueue";
import { ExperimentCreateQueue } from "./experimentCreateQueue";
import { IngestionQueue } from "./ingestionQueue";
import { LegacyIngestionQueue } from "./legacyIngestion";
import { TraceUpsertQueue } from "./traceUpsert";

export function getQueue(queueName: QueueName): Queue | null {
  switch (queueName) {
    case QueueName.LegacyIngestionQueue:
      return LegacyIngestionQueue.getInstance();
    case QueueName.BatchExport:
      return BatchExportQueue.getInstance();
    case QueueName.CloudUsageMeteringQueue:
      return CloudUsageMeteringQueue.getInstance();
    case QueueName.DatasetRunItemUpsert:
      return DatasetRunItemUpsertQueue.getInstance();
    case QueueName.EvaluationExecution:
      return EvalExecutionQueue.getInstance();
    case QueueName.ExperimentCreate:
      return ExperimentCreateQueue.getInstance();
    case QueueName.TraceUpsert:
      return TraceUpsertQueue.getInstance();
    case QueueName.IngestionQueue:
      return IngestionQueue.getInstance();
    default:
      throw new Error(`Queue ${queueName} not found`);
  }
}
