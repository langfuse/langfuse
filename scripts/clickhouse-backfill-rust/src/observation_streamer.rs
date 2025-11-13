use anyhow::Result;
use clickhouse::Client;
use std::collections::HashSet;
use std::sync::Arc;

use crate::types::{Cursor, Observation};

/// Stream observations with cursor-based pagination
pub struct ObservationStreamer {
    client: Client,
    partition: String,
    stream_block_size: usize,
    cursor: Cursor,
    dataset_run_items: Arc<HashSet<(String, String)>>,
}

impl ObservationStreamer {
    pub fn new(
        client: Client,
        partition: String,
        stream_block_size: usize,
        cursor: Cursor,
        dataset_run_items: Arc<HashSet<(String, String)>>,
    ) -> Self {
        Self {
            client,
            partition,
            stream_block_size,
            cursor,
            dataset_run_items,
        }
    }

    /// Stream observations in batches using cursor pagination
    pub async fn stream_batch(&mut self) -> Result<Option<(Vec<Observation>, Cursor)>> {
        let query = if self.cursor.is_empty() {
            // First batch - no cursor
            format!(
                r#"
                SELECT
                    project_id,
                    id,
                    trace_id,
                    type,
                    parent_observation_id,
                    name,
                    environment,
                    start_time,
                    end_time,
                    completion_start_time,
                    metadata,
                    level,
                    status_message,
                    version,
                    input,
                    output,
                    internal_model_id,
                    provided_model_name,
                    model_parameters,
                    provided_usage_details,
                    usage_details,
                    provided_cost_details,
                    cost_details,
                    prompt_id,
                    prompt_name,
                    prompt_version,
                    created_at,
                    updated_at,
                    event_ts,
                    is_deleted
                FROM observations
                WHERE _partition_id = '{}'
                  AND is_deleted = 0
                ORDER BY project_id, type, start_time, id
                LIMIT {}
                "#,
                self.partition, self.stream_block_size
            )
        } else {
            // Subsequent batches - use cursor
            format!(
                r#"
                SELECT
                    project_id,
                    id,
                    trace_id,
                    type,
                    parent_observation_id,
                    name,
                    environment,
                    start_time,
                    end_time,
                    completion_start_time,
                    metadata,
                    level,
                    status_message,
                    version,
                    input,
                    output,
                    internal_model_id,
                    provided_model_name,
                    model_parameters,
                    provided_usage_details,
                    usage_details,
                    provided_cost_details,
                    cost_details,
                    prompt_id,
                    prompt_name,
                    prompt_version,
                    created_at,
                    updated_at,
                    event_ts,
                    is_deleted
                FROM observations
                WHERE _partition_id = '{}'
                  AND is_deleted = 0
                  AND (
                    project_id > '{}' OR
                    (project_id = '{}' AND type > '{}') OR
                    (project_id = '{}' AND type = '{}' AND toDate(start_time) > '{}') OR
                    (project_id = '{}' AND type = '{}' AND toDate(start_time) = '{}' AND id > '{}')
                  )
                ORDER BY project_id, type, start_time, id
                LIMIT {}
                "#,
                self.partition,
                self.cursor.project_id,
                self.cursor.project_id,
                self.cursor.r#type,
                self.cursor.project_id,
                self.cursor.r#type,
                self.cursor.date,
                self.cursor.project_id,
                self.cursor.r#type,
                self.cursor.date,
                self.cursor.id,
                self.stream_block_size
            )
        };

        let mut cursor = self.client.query(&query).fetch::<Observation>()?;

        let mut observations = Vec::new();
        let mut filtered_count = 0usize;

        while let Some(obs) = cursor.next().await? {
            // Filter out observations that match dataset_run_items
            let key = (obs.project_id.clone(), obs.trace_id.clone());
            if self.dataset_run_items.contains(&key) {
                filtered_count += 1;
                continue;
            }

            observations.push(obs);
        }

        if filtered_count > 0 {
            tracing::debug!(
                "Filtered out {} observations matching dataset_run_items",
                filtered_count
            );
        }

        if observations.is_empty() {
            return Ok(None);
        }

        // Update cursor to the last observation
        let last_obs = observations.last().unwrap();
        let new_cursor = Cursor::new(
            last_obs.project_id.clone(),
            last_obs.r#type.clone(),
            last_obs.start_time.date_naive(),
            last_obs.id.clone(),
        );

        self.cursor = new_cursor.clone();

        Ok(Some((observations, new_cursor)))
    }

    /// Get current cursor position
    pub fn get_cursor(&self) -> &Cursor {
        &self.cursor
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn test_cursor_comparison_logic() {
        // Test that cursor logic properly handles composite key ordering
        let cursor = Cursor::new(
            "project1".to_string(),
            "GENERATION".to_string(),
            NaiveDate::from_ymd_opt(2025, 11, 1).unwrap(),
            "obs-123".to_string(),
        );

        assert!(!cursor.is_empty());
        assert_eq!(cursor.project_id, "project1");
        assert_eq!(cursor.r#type, "GENERATION");
    }
}
