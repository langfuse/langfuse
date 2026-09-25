import type {
  BlobStorageFileLogInsertType,
  ObservationRecordInsertType,
  ObservationBatchStagingRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
  TraceNullRecordInsertType,
  DatasetRunItemRecordInsertType,
  EventRecordInsertType,
} from "@langfuse/shared/src/server";

export enum TableName {
  Traces = "traces",
  TracesNull = "traces_null",
  Scores = "scores",
  Observations = "observations",
  ObservationsBatchStaging = "observations_batch_staging",
  BlobStorageFileLog = "blob_storage_file_log",
  DatasetRunItems = "dataset_run_items_rmt",
  EventsFull = "events_full", // Primary write target - MV auto-populates events_core
}

export type RecordInsertType<T extends TableName> = T extends TableName.Scores
  ? ScoreRecordInsertType
  : T extends TableName.Observations
    ? ObservationRecordInsertType
    : T extends TableName.ObservationsBatchStaging
      ? ObservationBatchStagingRecordInsertType
      : T extends TableName.Traces
        ? TraceRecordInsertType
        : T extends TableName.TracesNull
          ? TraceNullRecordInsertType
          : T extends TableName.BlobStorageFileLog
            ? BlobStorageFileLogInsertType
            : T extends TableName.DatasetRunItems
              ? DatasetRunItemRecordInsertType
              : T extends TableName.EventsFull
                ? EventRecordInsertType
                : never;
