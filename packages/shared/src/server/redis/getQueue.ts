import { Queue } from "bullmq";
import { QueueName } from "../queues";
import { BatchExportQueue } from "./batchExport";
import { CloudUsageMeteringQueue } from "./cloudUsageMeteringQueue";
import { CloudSpendAlertQueue } from "./cloudSpendAlertQueue";
import { CloudFreeTierUsageThresholdQueue } from "./cloudFreeTierUsageThresholdQueue";
import { DatasetRunItemUpsertQueue } from "./datasetRunItemUpsert";
import {
  EvalExecutionQueue,
  SecondaryEvalExecutionQueue,
} from "./evalExecutionQueue";
import { LLMAsJudgeExecutionQueue } from "./llmAsJudgeExecutionQueue";
import { ExperimentCreateQueue } from "./experimentCreateQueue";
import { SecondaryIngestionQueue } from "./ingestionQueue";
import { TraceDeleteQueue } from "./traceDelete";
import { ProjectDeleteQueue } from "./projectDelete";
import { PostHogIntegrationQueue } from "./postHogIntegrationQueue";
import { PostHogIntegrationProcessingQueue } from "./postHogIntegrationProcessingQueue";
import { MixpanelIntegrationQueue } from "./mixpanelIntegrationQueue";
import { MixpanelIntegrationProcessingQueue } from "./mixpanelIntegrationProcessingQueue";
import { BlobStorageIntegrationQueue } from "./blobStorageIntegrationQueue";
import { BlobStorageIntegrationProcessingQueue } from "./blobStorageIntegrationProcessingQueue";
import { CoreDataS3ExportQueue } from "./coreDataS3ExportQueue";
import { MeteringDataPostgresExportQueue } from "./meteringDataPostgresExportQueue";
import { DataRetentionQueue } from "./dataRetentionQueue";
import { DataRetentionProcessingQueue } from "./dataRetentionProcessingQueue";
import { BatchActionQueue } from "./batchActionQueue";
import { CreateEvalQueue } from "./createEvalQueue";
import { ScoreDeleteQueue } from "./scoreDelete";
import { DeadLetterRetryQueue } from "./dlqRetryQueue";
import { WebhookQueue } from "./webhookQueue";
import { EntityChangeQueue } from "./entityChangeQueue";
import { DatasetDeleteQueue } from "./datasetDelete";
import { EventPropagationQueue } from "./eventPropagationQueue";
import { NotificationQueue } from "./notificationQueue";

// IngestionQueue, OtelIngestionQueue, and TraceUpsert are sharded and require a sharding key
// Use IngestionQueue.getInstance({ shardName: queueName }) or TraceUpsertQueue.getInstance({ shardName: queueName }) directly instead
export function getQueue(
  queueName: Exclude<
    QueueName,
    | QueueName.IngestionQueue
    | QueueName.TraceUpsert
    | QueueName.OtelIngestionQueue
  >,
): Queue | null {
  switch (queueName) {
    case QueueName.BatchExport:
      return BatchExportQueue.getInstance();
    case QueueName.CloudUsageMeteringQueue:
      return CloudUsageMeteringQueue.getInstance();
    case QueueName.CloudSpendAlertQueue:
      return CloudSpendAlertQueue.getInstance();
    case QueueName.CloudFreeTierUsageThresholdQueue:
      return CloudFreeTierUsageThresholdQueue.getInstance();
    case QueueName.DatasetRunItemUpsert:
      return DatasetRunItemUpsertQueue.getInstance();
    case QueueName.DatasetDelete:
      return DatasetDeleteQueue.getInstance();
    case QueueName.EvaluationExecution:
      return EvalExecutionQueue.getInstance();
    case QueueName.EvaluationExecutionSecondaryQueue:
      return SecondaryEvalExecutionQueue.getInstance();
    case QueueName.LLMAsJudgeExecution:
      return LLMAsJudgeExecutionQueue.getInstance();
    case QueueName.ExperimentCreate:
      return ExperimentCreateQueue.getInstance();
    case QueueName.TraceDelete:
      return TraceDeleteQueue.getInstance();
    case QueueName.ProjectDelete:
      return ProjectDeleteQueue.getInstance();
    case QueueName.PostHogIntegrationQueue:
      return PostHogIntegrationQueue.getInstance();
    case QueueName.PostHogIntegrationProcessingQueue:
      return PostHogIntegrationProcessingQueue.getInstance();
    case QueueName.MixpanelIntegrationQueue:
      return MixpanelIntegrationQueue.getInstance();
    case QueueName.MixpanelIntegrationProcessingQueue:
      return MixpanelIntegrationProcessingQueue.getInstance();
    case QueueName.BlobStorageIntegrationQueue:
      return BlobStorageIntegrationQueue.getInstance();
    case QueueName.BlobStorageIntegrationProcessingQueue:
      return BlobStorageIntegrationProcessingQueue.getInstance();
    case QueueName.IngestionSecondaryQueue:
      return SecondaryIngestionQueue.getInstance();
    case QueueName.CoreDataS3ExportQueue:
      return CoreDataS3ExportQueue.getInstance();
    case QueueName.MeteringDataPostgresExportQueue:
      return MeteringDataPostgresExportQueue.getInstance();
    case QueueName.DataRetentionQueue:
      return DataRetentionQueue.getInstance();
    case QueueName.DataRetentionProcessingQueue:
      return DataRetentionProcessingQueue.getInstance();
    case QueueName.BatchActionQueue:
      return BatchActionQueue.getInstance();
    case QueueName.CreateEvalQueue:
      return CreateEvalQueue.getInstance();
    case QueueName.ScoreDelete:
      return ScoreDeleteQueue.getInstance();
    case QueueName.DeadLetterRetryQueue:
      return DeadLetterRetryQueue.getInstance();
    case QueueName.WebhookQueue:
      return WebhookQueue.getInstance();
    case QueueName.EntityChangeQueue:
      return EntityChangeQueue.getInstance();
    case QueueName.EventPropagationQueue:
      return EventPropagationQueue.getInstance();
    case QueueName.NotificationQueue:
      return NotificationQueue.getInstance();
    default: {
      const _exhaustiveCheckDefault: never = queueName;
      throw new Error(`Queue ${queueName} not found`);
    }
  }
}
