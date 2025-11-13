use anyhow::{Context, Result};
use clickhouse::Client;
use indicatif::{ProgressBar, ProgressStyle};
use std::collections::HashMap;
use std::sync::Arc;

use crate::types::TraceAttrs;

/// Load all trace attributes for a partition into memory
pub async fn load_trace_attributes(
    client: &Client,
    partition: &str,
) -> Result<Arc<HashMap<(String, String), TraceAttrs>>> {
    tracing::info!("Loading trace attributes for partition {}...", partition);

    let query = r#"
        SELECT
            project_id,
            id,
            user_id,
            session_id,
            mapFilter((k, v) -> k != 'attributes', metadata) AS metadata,
            tags,
            public,
            bookmarked,
            version,
            release
        FROM traces
        WHERE _partition_id = ?
          AND is_deleted = 0
    "#;

    // Get total count first for progress bar
    let count_query = r#"
        SELECT count()
        FROM traces
        WHERE _partition_id = ?
          AND is_deleted = 0
    "#;

    let total_traces: u64 = client
        .query(count_query)
        .bind(partition)
        .fetch_one()
        .await
        .context("Failed to get trace count")?;

    tracing::info!("Loading {} traces into memory...", total_traces);

    // Create progress bar
    let pb = ProgressBar::new(total_traces);
    pb.set_style(
        ProgressStyle::default_bar()
            .template(
                "[{elapsed_precise}] {bar:40.cyan/blue} {pos}/{len} traces ({per_sec}) ETA: {eta}",
            )
            .unwrap()
            .progress_chars("=>-"),
    );

    // Create the HashMap to store trace attributes
    let mut trace_attrs: HashMap<(String, String), TraceAttrs> =
        HashMap::with_capacity(total_traces as usize);

    // Stream traces and populate the map
    let mut cursor = client.query(query).bind(partition).fetch::<TraceAttrs>()?;

    let mut count = 0u64;
    while let Some(trace) = cursor.next().await? {
        let key = (trace.project_id.clone(), trace.id.clone());

        let attrs = TraceAttrs {
            project_id: trace.project_id,
            id: trace.id,
            user_id: trace.user_id,
            session_id: trace.session_id,
            metadata: trace.metadata,
            tags: trace.tags,
            public: trace.public,
            bookmarked: trace.bookmarked,
            version: trace.version,
            release: trace.release,
        };

        trace_attrs.insert(key, attrs);

        count += 1;
        if count % 10000 == 0 {
            pb.set_position(count);
        }
    }

    pb.finish_with_message(format!("Loaded {} traces", count));

    tracing::info!(
        "Successfully loaded {} trace attributes into memory",
        trace_attrs.len()
    );

    // Estimate memory usage (rough approximation)
    let estimated_bytes = trace_attrs.len() * 100; // ~100 bytes per trace on average
    let estimated_mb = estimated_bytes / 1024 / 1024;
    tracing::info!(
        "Estimated memory usage for trace attributes: ~{}MB",
        estimated_mb
    );

    Ok(Arc::new(trace_attrs))
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_trace_attrs_memory_estimate() {
        // Test that our memory estimation is reasonable
        let trace_count = 1_000_000u64;
        let estimated_bytes = trace_count as usize * 100;
        let estimated_mb = estimated_bytes / 1024 / 1024;

        assert!(estimated_mb > 0);
        assert!(estimated_mb < 1000); // Should be less than 1GB for 1M traces
    }
}
