use anyhow::{Context, Result};
use arrow::array::*;
use futures::StreamExt;
use object_store::{path::Path as ObjectPath, ObjectStore};
use parquet::arrow::async_reader::ParquetObjectReader;
use parquet::arrow::ParquetRecordBatchStreamBuilder;
use std::collections::HashSet;
use std::sync::Arc;

use crate::types::Observation;

/// Reads observations from S3 parquet files for a specific partition
pub struct ParquetPartitionReader {
    object_store: Arc<dyn ObjectStore>,
    prefix: String,
    partition_id: u32,
    dataset_run_items: Arc<HashSet<(String, String)>>,
    batch_size: usize,
}

impl ParquetPartitionReader {
    pub fn new(
        object_store: Arc<dyn ObjectStore>,
        prefix: String,
        partition_id: u32,
        dataset_run_items: Arc<HashSet<(String, String)>>,
        batch_size: usize,
    ) -> Self {
        Self {
            object_store,
            prefix,
            partition_id,
            dataset_run_items,
            batch_size,
        }
    }

    /// Read a single parquet file from S3 and convert to observations using streaming
    async fn read_parquet_file(&self) -> Result<Vec<Observation>> {
        // Construct object path
        let key = if self.prefix.ends_with('/') {
            format!("{}observations_{}.parquet", self.prefix, self.partition_id)
        } else {
            format!("{}/observations_{}.parquet", self.prefix, self.partition_id)
        };

        tracing::info!(
            partition_id = self.partition_id,
            key = %key,
            "Attempting to stream parquet file from S3"
        );

        let object_path = ObjectPath::from(key.clone());

        // Get object metadata to check if file exists
        let meta = match self.object_store.head(&object_path).await {
            Ok(meta) => {
                tracing::debug!(
                    partition_id = self.partition_id,
                    key = %key,
                    size = meta.size,
                    "Found parquet file in S3"
                );
                meta
            }
            Err(err) => {
                // Check if file doesn't exist (NotFound error)
                if err.to_string().contains("404") || err.to_string().contains("NoSuchKey") {
                    tracing::info!(
                        partition_id = self.partition_id,
                        key = %key,
                        "Parquet file does not exist, skipping partition"
                    );
                    return Ok(Vec::new());
                }

                tracing::error!(
                    partition_id = self.partition_id,
                    key = %key,
                    error = %err,
                    "Failed to get object metadata"
                );
                // TODO: Improve error handling - for now return empty to avoid blocking
                return Ok(Vec::new());
            }
        };

        // Check if file is empty
        if meta.size == 0 {
            tracing::info!(
                partition_id = self.partition_id,
                key = %key,
                "Parquet file is empty, skipping partition"
            );
            return Ok(Vec::new());
        }

        // Create ParquetObjectReader for streaming access
        let object_reader = ParquetObjectReader::new(Arc::clone(&self.object_store), meta);

        // Build async parquet stream
        let builder = ParquetRecordBatchStreamBuilder::new(object_reader)
            .await
            .context(format!(
                "Failed to create parquet stream builder for {}",
                key
            ))?;

        let mut stream = builder
            .with_batch_size(self.batch_size)
            .build()
            .context("Failed to build parquet stream")?;

        tracing::debug!(
            partition_id = self.partition_id,
            "Starting to stream parquet batches"
        );

        // Stream through record batches
        let mut observations = Vec::new();
        let mut filtered_count = 0usize;
        let mut batch_count = 0usize;

        while let Some(batch_result) = stream.next().await {
            batch_count += 1;
            let batch = batch_result.context("Failed to read record batch from stream")?;

            tracing::debug!(
                partition_id = self.partition_id,
                batch_num = batch_count,
                rows = batch.num_rows(),
                "Processing record batch"
            );

            // Convert arrow record batch to Observation structs
            let batch_observations = convert_record_batch_to_observations(&batch).context(
                format!("Failed to convert batch {} to observations", batch_count),
            )?;

            // Filter out dataset_run_items
            for obs in batch_observations {
                let filter_key = (obs.project_id.clone(), obs.trace_id.clone());
                if self.dataset_run_items.contains(&filter_key) {
                    filtered_count += 1;
                    continue;
                }
                observations.push(obs);
            }
        }

        tracing::info!(
            partition_id = self.partition_id,
            key = %key,
            batches = batch_count,
            observations = observations.len(),
            filtered = filtered_count,
            "Successfully streamed parquet file"
        );

        Ok(observations)
    }

    /// Stream all observations from all files in this partition
    pub async fn stream_all_observations(&self) -> Result<Vec<Vec<Observation>>> {
        tracing::debug!(
            partition_id = self.partition_id,
            "Starting stream_all_observations"
        );

        // Process files sequentially to avoid overwhelming memory
        // Each file is read in parallel with parquet decoding on thread pool
        let mut all_batches = Vec::new();

        let observations = self.read_parquet_file().await.context(format!(
            "Failed to read parquet file for partition {}",
            self.partition_id
        ))?;

        if !observations.is_empty() {
            tracing::debug!(
                partition_id = self.partition_id,
                observations = observations.len(),
                "Adding observations batch"
            );
            all_batches.push(observations);
        } else {
            tracing::info!(
                partition_id = self.partition_id,
                "No observations found for partition (file may not exist or is empty)"
            );
        }

        Ok(all_batches)
    }
}

/// Convert Arrow record batch to vector of Observation structs
fn convert_record_batch_to_observations(
    batch: &arrow::record_batch::RecordBatch,
) -> Result<Vec<Observation>> {
    let num_rows = batch.num_rows();
    let mut observations = Vec::with_capacity(num_rows);

    // Extract all columns
    let project_id_col = get_string_array(batch, "project_id")?;
    let id_col = get_string_array(batch, "id")?;
    let trace_id_col = get_string_array(batch, "trace_id")?;
    let type_col = get_string_array(batch, "type")?;
    let parent_observation_id_col = get_optional_string_array(batch, "parent_observation_id")?;
    let name_col = get_string_array(batch, "name")?;
    let environment_col = get_string_array(batch, "environment")?;
    let start_time_col = get_timestamp_array(batch, "start_time")?;
    let end_time_col = get_optional_timestamp_array(batch, "end_time")?;
    let completion_start_time_col = get_optional_timestamp_array(batch, "completion_start_time")?;
    let metadata_col = get_map_array(batch, "metadata")?;
    let level_col = get_string_array(batch, "level")?;
    let status_message_col = get_optional_string_array(batch, "status_message")?;
    let version_col = get_optional_string_array(batch, "version")?;
    let input_col = get_optional_string_array(batch, "input")?;
    let output_col = get_optional_string_array(batch, "output")?;
    let internal_model_id_col = get_optional_string_array(batch, "internal_model_id")?;
    let provided_model_name_col = get_optional_string_array(batch, "provided_model_name")?;
    let model_parameters_col = get_optional_string_array(batch, "model_parameters")?;
    let provided_usage_details_col = get_map_u64_array(batch, "provided_usage_details")?;
    let usage_details_col = get_map_u64_array(batch, "usage_details")?;
    let provided_cost_details_col = get_map_decimal_array(batch, "provided_cost_details")?;
    let cost_details_col = get_map_decimal_array(batch, "cost_details")?;
    let prompt_id_col = get_optional_string_array(batch, "prompt_id")?;
    let prompt_name_col = get_optional_string_array(batch, "prompt_name")?;
    let prompt_version_col = get_optional_u16_array(batch, "prompt_version")?;
    let created_at_col = get_timestamp_array(batch, "created_at")?;
    let updated_at_col = get_timestamp_array(batch, "updated_at")?;
    let event_ts_col = get_timestamp_array(batch, "event_ts")?;
    let is_deleted_col = get_u8_array(batch, "is_deleted")?;

    for row_idx in 0..num_rows {
        observations.push(Observation {
            project_id: project_id_col.value(row_idx).to_string(),
            id: id_col.value(row_idx).to_string(),
            trace_id: trace_id_col.value(row_idx).to_string(),
            r#type: type_col.value(row_idx).to_string(),
            parent_observation_id: parent_observation_id_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    Some(arr.value(row_idx).to_string())
                }
            }),
            name: name_col.value(row_idx).to_string(),
            environment: environment_col.value(row_idx).to_string(),
            start_time: timestamp_millis_to_datetime(start_time_col.value(row_idx))
                .context("Invalid start_time")?,
            end_time: end_time_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    timestamp_millis_to_datetime(arr.value(row_idx)).ok()
                }
            }),
            completion_start_time: completion_start_time_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    timestamp_millis_to_datetime(arr.value(row_idx)).ok()
                }
            }),
            metadata: metadata_col.get(row_idx).cloned().unwrap_or_default(),
            level: level_col.value(row_idx).to_string(),
            status_message: status_message_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    Some(arr.value(row_idx).to_string())
                }
            }),
            version: version_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    Some(arr.value(row_idx).to_string())
                }
            }),
            input: input_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    Some(arr.value(row_idx).to_string())
                }
            }),
            output: output_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    Some(arr.value(row_idx).to_string())
                }
            }),
            internal_model_id: internal_model_id_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    Some(arr.value(row_idx).to_string())
                }
            }),
            provided_model_name: provided_model_name_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    Some(arr.value(row_idx).to_string())
                }
            }),
            model_parameters: model_parameters_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    Some(arr.value(row_idx).to_string())
                }
            }),
            provided_usage_details: provided_usage_details_col
                .get(row_idx)
                .cloned()
                .unwrap_or_default(),
            usage_details: usage_details_col.get(row_idx).cloned().unwrap_or_default(),
            provided_cost_details: provided_cost_details_col
                .get(row_idx)
                .cloned()
                .unwrap_or_default(),
            cost_details: cost_details_col.get(row_idx).cloned().unwrap_or_default(),
            prompt_id: prompt_id_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    Some(arr.value(row_idx).to_string())
                }
            }),
            prompt_name: prompt_name_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    Some(arr.value(row_idx).to_string())
                }
            }),
            prompt_version: prompt_version_col.as_ref().and_then(|arr| {
                if arr.is_null(row_idx) {
                    None
                } else {
                    Some(arr.value(row_idx))
                }
            }),
            created_at: timestamp_millis_to_datetime(created_at_col.value(row_idx))
                .context("Invalid created_at")?,
            updated_at: timestamp_millis_to_datetime(updated_at_col.value(row_idx))
                .context("Invalid updated_at")?,
            event_ts: timestamp_millis_to_datetime(event_ts_col.value(row_idx))
                .context("Invalid event_ts")?,
            is_deleted: is_deleted_col.value(row_idx),
        });
    }

    Ok(observations)
}

// Helper functions to extract typed arrays from record batch

fn get_string_array<'a>(
    batch: &'a arrow::record_batch::RecordBatch,
    column_name: &str,
) -> Result<&'a StringArray> {
    let column = batch
        .column_by_name(column_name)
        .context(format!("Column {} not found", column_name))?;
    column
        .as_any()
        .downcast_ref::<StringArray>()
        .context(format!("Column {} is not a StringArray", column_name))
}

fn get_optional_string_array<'a>(
    batch: &'a arrow::record_batch::RecordBatch,
    column_name: &str,
) -> Result<Option<&'a StringArray>> {
    match batch.column_by_name(column_name) {
        Some(column) => Ok(Some(
            column
                .as_any()
                .downcast_ref::<StringArray>()
                .context(format!("Column {} is not a StringArray", column_name))?,
        )),
        None => Ok(None),
    }
}

fn get_timestamp_array<'a>(
    batch: &'a arrow::record_batch::RecordBatch,
    column_name: &str,
) -> Result<&'a TimestampMillisecondArray> {
    let column = batch
        .column_by_name(column_name)
        .context(format!("Column {} not found", column_name))?;
    column
        .as_any()
        .downcast_ref::<TimestampMillisecondArray>()
        .context(format!(
            "Column {} is not a TimestampMillisecondArray",
            column_name
        ))
}

fn get_optional_timestamp_array<'a>(
    batch: &'a arrow::record_batch::RecordBatch,
    column_name: &str,
) -> Result<Option<&'a TimestampMillisecondArray>> {
    match batch.column_by_name(column_name) {
        Some(column) => Ok(Some(
            column
                .as_any()
                .downcast_ref::<TimestampMillisecondArray>()
                .context(format!(
                    "Column {} is not a TimestampMillisecondArray",
                    column_name
                ))?,
        )),
        None => Ok(None),
    }
}

fn get_u8_array<'a>(
    batch: &'a arrow::record_batch::RecordBatch,
    column_name: &str,
) -> Result<&'a UInt8Array> {
    let column = batch
        .column_by_name(column_name)
        .context(format!("Column {} not found", column_name))?;
    column
        .as_any()
        .downcast_ref::<UInt8Array>()
        .context(format!("Column {} is not a UInt8Array", column_name))
}

fn get_optional_u16_array<'a>(
    batch: &'a arrow::record_batch::RecordBatch,
    column_name: &str,
) -> Result<Option<&'a UInt16Array>> {
    match batch.column_by_name(column_name) {
        Some(column) => Ok(Some(
            column
                .as_any()
                .downcast_ref::<UInt16Array>()
                .context(format!("Column {} is not a UInt16Array", column_name))?,
        )),
        None => Ok(None),
    }
}

// Map/complex type extractors (simplified - these need actual implementation based on parquet schema)
fn get_map_array(
    batch: &arrow::record_batch::RecordBatch,
    column_name: &str,
) -> Result<Vec<Vec<(String, String)>>> {
    // TODO: Implement based on actual parquet map encoding
    // For now, return empty vectors as placeholder
    Ok(vec![Vec::new(); batch.num_rows()])
}

fn get_map_u64_array(
    batch: &arrow::record_batch::RecordBatch,
    column_name: &str,
) -> Result<Vec<Vec<(String, u64)>>> {
    // TODO: Implement based on actual parquet map encoding
    Ok(vec![Vec::new(); batch.num_rows()])
}

fn get_map_decimal_array(
    batch: &arrow::record_batch::RecordBatch,
    column_name: &str,
) -> Result<Vec<Vec<(String, crate::types::Decimal18_12)>>> {
    // TODO: Implement based on actual parquet map encoding
    Ok(vec![Vec::new(); batch.num_rows()])
}

// Helper function for timestamp conversion
fn timestamp_millis_to_datetime(millis: i64) -> Result<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::from_timestamp_millis(millis)
        .ok_or_else(|| anyhow::anyhow!("Invalid timestamp milliseconds: {}", millis))
}
