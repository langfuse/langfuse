mod checkpoint;
mod clickhouse;
mod config;
mod dataset_run_item_loader;
mod inserter;
mod observation_streamer;
mod trace_loader;
mod transformer;
mod types;

use anyhow::{Context, Result};
use indicatif::{ProgressBar, ProgressStyle};
use std::sync::Arc;
use std::time::Instant;

use checkpoint::{setup_signal_handler, CheckpointManager};
use config::Config;
use dataset_run_item_loader::load_dataset_run_items;
use inserter::EventInserter;
use observation_streamer::ObservationStreamer;
use trace_loader::load_trace_attributes;
use transformer::transform_batch;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing/logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    // Load configuration
    let config = Config::load().context("Failed to load configuration")?;
    config.print_summary();

    // Create ClickHouse clients
    let read_client = clickhouse::create_read_client(&config)?;
    let write_client = clickhouse::create_write_client(&config)?;

    // Test connection
    clickhouse::test_connection(&read_client).await?;

    // Verify required tables exist
    clickhouse::verify_tables(&read_client).await?;

    // Get partition statistics
    let obs_count = clickhouse::get_partition_row_count(&read_client, "observations", &config.partition).await?;
    tracing::info!("Partition {} contains {} observations to backfill", config.partition, obs_count);

    if obs_count == 0 {
        tracing::warn!("No observations found in partition {}. Exiting.", config.partition);
        return Ok(());
    }

    // Load trace attributes into memory
    let trace_attrs = load_trace_attributes(&read_client, &config.partition).await?;

    // Load dataset run items into memory for filtering
    let dataset_run_items = load_dataset_run_items(&read_client).await?;

    // Set up checkpoint manager
    let checkpoint_path = config.partition_cursor_file_path();
    let checkpoint_manager = Arc::new(
        CheckpointManager::load(checkpoint_path, config.partition.clone()).await?,
    );

    // Set up signal handler for graceful shutdown
    setup_signal_handler(checkpoint_manager.clone()).await;

    // Get starting cursor
    let starting_cursor = checkpoint_manager.get_cursor().await;
    let starting_rows = checkpoint_manager.get_rows_processed().await;

    if starting_rows > 0 {
        tracing::info!(
            "Resuming from checkpoint: {} rows already processed",
            starting_rows
        );
    }

    // Create observation streamer
    let mut streamer = ObservationStreamer::new(
        read_client.clone(),
        config.partition.clone(),
        config.stream_block_size,
        starting_cursor,
        dataset_run_items,
    );

    // Create event inserter
    let inserter = EventInserter::new(
        write_client,
        config.max_retries,
        config.dry_run,
    );

    // Set up progress bar
    let pb = ProgressBar::new(obs_count);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("[{elapsed_precise}] {bar:40.cyan/blue} {pos}/{len} observations ({per_sec}) ETA: {eta}")
            .unwrap()
            .progress_chars("=>-"),
    );
    pb.set_position(starting_rows);

    // Main processing loop
    let start_time = Instant::now();
    let mut batch_number = 0;
    let mut total_processed = starting_rows;
    let mut batch_buffer = Vec::new();

    tracing::info!("Starting backfill process...");

    loop {
        // Stream next batch of observations
        match streamer.stream_batch().await? {
            Some((observations, cursor)) => {
                batch_number += 1;
                let obs_count = observations.len();

                tracing::debug!(
                    "Batch {}: Processing {} observations",
                    batch_number,
                    obs_count
                );

                // Transform observations to events
                let events = transform_batch(observations, &trace_attrs)
                    .context("Failed to transform observations to events")?;

                // Add to batch buffer
                batch_buffer.extend(events);

                // Insert when batch size is reached
                if batch_buffer.len() >= config.batch_size {
                    let to_insert = batch_buffer.split_off(0);
                    let insert_count = to_insert.len();

                    inserter
                        .insert_with_tracking(to_insert, batch_number)
                        .await?;

                    // Update checkpoint after successful insert
                    checkpoint_manager
                        .update(cursor.clone(), insert_count as u64)
                        .await?;

                    total_processed += insert_count as u64;
                    pb.set_position(total_processed);
                }
            }
            None => {
                // No more observations to process
                tracing::info!("No more observations to stream");
                break;
            }
        }
    }

    // Insert remaining events in buffer
    if !batch_buffer.is_empty() {
        let insert_count = batch_buffer.len();
        inserter
            .insert_with_tracking(batch_buffer, batch_number + 1)
            .await?;

        // Update checkpoint with final cursor
        let final_cursor = streamer.get_cursor().clone();
        checkpoint_manager
            .update(final_cursor, insert_count as u64)
            .await?;

        total_processed += insert_count as u64;
        pb.set_position(total_processed);
    }

    pb.finish_with_message("Backfill complete");

    // Print final statistics
    let elapsed = start_time.elapsed();
    let throughput = if elapsed.as_secs() > 0 {
        total_processed / elapsed.as_secs()
    } else {
        0
    };

    tracing::info!("=== Backfill Summary ===");
    tracing::info!("Partition: {}", config.partition);
    tracing::info!("Total observations processed: {}", total_processed);
    tracing::info!("Total time: {:.2}s", elapsed.as_secs_f64());
    tracing::info!("Throughput: {} observations/sec", throughput);
    tracing::info!("Dry run: {}", config.dry_run);

    if !config.dry_run {
        tracing::info!("Backfill completed successfully!");
        tracing::info!("Consider clearing checkpoint file after verification");
    }

    Ok(())
}
