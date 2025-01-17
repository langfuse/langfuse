import { Queue } from "bullmq";
import { QueueName } from "../queues";
import { BatchExportQueue } from "./batchExport";
import { CloudUsageMeteringQueue } from "./cloudUsageMeteringQueue";
import { DatasetRunItemUpsertQueue } from "./datasetRunItemUpsert";
import { EvalExecutionQueue } from "./evalExecutionQueue";
import { ExperimentCreateQueue } from "./experimentCreateQueue";
import { IngestionQueue, SecondaryIngestionQueue } from "./ingestionQueue";
import { LegacyIngestionQueue } from "./legacyIngestion";
import { TraceUpsertQueue } from "./traceUpsert";
import { TraceDeleteQueue } from "./traceDelete";
import { ProjectDeleteQueue } from "./projectDelete";
import { PostHogIntegrationQueue } from "./postHogIntegrationQueue";
import { PostHogIntegrationProcessingQueue } from "./postHogIntegrationProcessingQueue";
import { CoreDataS3ExportQueue } from "./coreDataS3ExportQueue";
import { MeteringDataPostgresExportQueue } from "./meteringDataPostgresExportQueue";

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
    case QueueName.TraceDelete:
      return TraceDeleteQueue.getInstance();
    case QueueName.IngestionQueue:
      return IngestionQueue.getInstance();
    case QueueName.ProjectDelete:
      return ProjectDeleteQueue.getInstance();
    case QueueName.PostHogIntegrationQueue:
      return PostHogIntegrationQueue.getInstance();
    case QueueName.PostHogIntegrationProcessingQueue:
      return PostHogIntegrationProcessingQueue.getInstance();
    case QueueName.IngestionSecondaryQueue:
      return SecondaryIngestionQueue.getInstance();
    case QueueName.CoreDataS3ExportQueue:
      return CoreDataS3ExportQueue.getInstance();
    case QueueName.MeteringDataPostgresExportQueue:
      return MeteringDataPostgresExportQueue.getInstance();
    default:
      const exhaustiveCheckDefault: never = queueName;
      throw new Error(`Queue ${queueName} not found`);
  }
}
