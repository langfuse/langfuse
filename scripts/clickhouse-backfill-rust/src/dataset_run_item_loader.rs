use anyhow::{Context, Result};
use clickhouse::Client;
use indicatif::{ProgressBar, ProgressStyle};
use std::collections::HashSet;
use std::sync::Arc;

use crate::types::DatasetRunItem;

/// Load all dataset run items into memory
/// Returns a HashSet of (project_id, trace_id) tuples for efficient O(1) lookups
pub async fn load_dataset_run_items(
    client: &Client,
) -> Result<Arc<HashSet<(String, String)>>> {
    tracing::info!("Loading dataset run items...");

    let query = r#"
        SELECT DISTINCT
            project_id,
            trace_id
        FROM dataset_run_items_rmt
    "#;

    // Get total count first for progress bar
    let count_query = r#"
        SELECT count(DISTINCT (project_id, trace_id))
        FROM dataset_run_items_rmt
    "#;

    let total_items: u64 = client
        .query(count_query)
        .fetch_one()
        .await
        .context("Failed to get dataset run item count")?;

    tracing::info!("Loading {} dataset run items into memory...", total_items);

    // Create progress bar
    let pb = ProgressBar::new(total_items);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("[{elapsed_precise}] {bar:40.cyan/blue} {pos}/{len} dataset run items ({per_sec}) ETA: {eta}")
            .unwrap()
            .progress_chars("=>-"),
    );

    // Create the HashSet to store dataset run item identifiers
    let mut dataset_run_items: HashSet<(String, String)> = HashSet::new();

    // Stream dataset run items and populate the set
    let mut cursor = client.query(query).fetch::<DatasetRunItem>()?;

    let mut count = 0u64;
    while let Some(item) = cursor.next().await? {
        dataset_run_items.insert((item.project_id, item.trace_id));

        count += 1;
        if count % 10000 == 0 {
            pb.set_position(count);
        }
    }

    pb.finish_with_message(format!("Loaded {} dataset run items", count));

    tracing::info!(
        "Successfully loaded {} dataset run items into memory",
        dataset_run_items.len()
    );

    // Estimate memory usage (rough approximation)
    // Each entry is approximately: 2 x (String pointer + capacity) + hash overhead
    // Assuming average project_id + trace_id is ~80 bytes
    let estimated_bytes = dataset_run_items.len() * 80;
    let estimated_mb = estimated_bytes / 1024 / 1024;
    tracing::info!(
        "Estimated memory usage for dataset run items: ~{}MB",
        estimated_mb
    );

    Ok(Arc::new(dataset_run_items))
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_dataset_run_items_memory_estimate() {
        // Test that our memory estimation is reasonable
        let item_count = 1_000_000usize;
        let estimated_bytes = item_count * 80;
        let estimated_mb = estimated_bytes / 1024 / 1024;

        assert!(estimated_mb > 0);
        assert!(estimated_mb < 500); // Should be less than 500MB for 1M items
    }
}
