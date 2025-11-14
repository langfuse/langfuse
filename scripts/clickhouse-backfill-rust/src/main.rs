mod clickhouse;
mod config;
mod dataset_run_item_loader;
mod inserter;
mod parquet_reader;
mod trace_loader;
mod transformer;
mod types;

use anyhow::{Context, Result};
use futures::StreamExt;
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use object_store::aws::AmazonS3Builder;
use object_store::ObjectStore;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::mpsc;

use config::Config;
use dataset_run_item_loader::load_dataset_run_items;
use inserter::EventInserter;
use parquet_reader::ParquetPartitionReader;
use trace_loader::load_trace_attributes;
use transformer::transform_batch;
use types::Event;

/// Message type sent from readers to flush coordinator
enum CoordinatorMessage {
    Events(Vec<Event>),
    PartitionComplete(u32),
    Error(anyhow::Error),
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing/logging with stderr output to avoid progress bar interference
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr) // Ensure logs go to stderr, separate from progress bars
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

    // Load trace attributes into memory
    tracing::info!(
        "Loading trace attributes for partition {}...",
        config.partition
    );
    let trace_attrs = load_trace_attributes(&read_client, &config.partition).await?;
    tracing::info!("Loaded {} trace attributes into memory", trace_attrs.len());

    // Load dataset run items into memory for filtering
    tracing::info!("Loading dataset run items for filtering...");
    let dataset_run_items = load_dataset_run_items(&read_client).await?;
    tracing::info!(
        "Loaded {} dataset run items for filtering",
        dataset_run_items.len()
    );

    // Create ObjectStore for streaming parquet access
    tracing::info!("Creating ObjectStore for streaming S3 access...");
    let mut s3_builder = AmazonS3Builder::new().with_bucket_name(&config.s3_bucket);
    if let Some(ref region) = config.s3_region {
        s3_builder = s3_builder.with_region(region);
    }

    // Add explicit credentials if provided
    if let (Some(ref access_key), Some(ref secret_key)) =
        (&config.aws_access_key_id, &config.aws_secret_access_key) {
        tracing::info!("Using explicit AWS credentials from config");
        s3_builder = s3_builder
            .with_access_key_id(access_key)
            .with_secret_access_key(secret_key);
    } else {
        tracing::info!("Using default AWS credential chain");
    }

    let object_store: Arc<dyn ObjectStore> = Arc::new(s3_builder.build()?);

    // Set up signal handler for graceful shutdown
    let shutdown_flag = Arc::new(AtomicBool::new(false));
    let shutdown_flag_clone = shutdown_flag.clone();
    tokio::spawn(async move {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
        tracing::warn!("Received Ctrl+C, initiating graceful shutdown...");
        shutdown_flag_clone.store(true, Ordering::SeqCst);
    });

    // Create event inserter
    let inserter = EventInserter::new(write_client, config.max_retries, config.dry_run);

    // Set up progress bars (one per partition + one overall)
    let multi_progress = Arc::new(MultiProgress::new());
    let overall_pb = multi_progress.add(ProgressBar::new(0));
    overall_pb.set_style(
        ProgressStyle::default_bar()
            .template(
                "[{elapsed_precise}] {bar:40.cyan/blue} {pos} events flushed ({per_sec}) {msg}",
            )
            .unwrap()
            .progress_chars("=>-"),
    );

    // Shared counters for progress tracking
    let total_events_generated = Arc::new(AtomicU64::new(0));
    let total_events_flushed = Arc::new(AtomicU64::new(0));

    // Create channel for readers → coordinator communication
    let (tx, mut rx) = mpsc::channel::<CoordinatorMessage>(50_000); // Bounded channel for backpressure

    // Spawn reader tasks for all partitions
    tracing::info!(
        "Spawning {} partition reader tasks...",
        config.partition_count
    );
    let mut reader_handles = Vec::new();

    for partition_id in 0..config.partition_count {
        let object_store = Arc::clone(&object_store);
        let trace_attrs = Arc::clone(&trace_attrs);
        let dataset_run_items = Arc::clone(&dataset_run_items);
        let tx = tx.clone();
        let shutdown_flag = Arc::clone(&shutdown_flag);
        let total_events_generated = Arc::clone(&total_events_generated);
        let config = config.clone();

        // Create progress bar for this partition
        let partition_pb = multi_progress.add(ProgressBar::new(0));
        partition_pb.set_style(
            ProgressStyle::default_spinner()
                .template(&format!("[P{:02}] {{spinner}} {{msg}}", partition_id))
                .unwrap(),
        );

        let handle = tokio::spawn(async move {
            partition_pb.set_message("Starting...");

            tracing::debug!(partition_id = partition_id, "Partition reader task started");

            let reader = ParquetPartitionReader::new(
                object_store,
                config.s3_prefix.clone(),
                partition_id,
                dataset_run_items,
                config.stream_block_size,
            );

            // Stream observations from this partition incrementally
            tracing::debug!(
                partition_id = partition_id,
                bucket = %config.s3_bucket,
                prefix = %config.s3_prefix,
                "Starting to stream observations from S3"
            );

            let mut stream = reader.stream_observations();
            let mut batch_idx = 0usize;

            // Process each batch as it arrives from the stream
            while let Some(result) = stream.next().await {
                // Check shutdown flag
                if shutdown_flag.load(Ordering::SeqCst) {
                    partition_pb.finish_with_message("Interrupted");
                    return Ok(());
                }

                match result {
                    Ok(observations) => {
                        batch_idx += 1;

                        partition_pb.set_message(format!(
                            "Batch {}: transforming {} observations",
                            batch_idx,
                            observations.len()
                        ));

                        // Transform observations to events
                        let events = match transform_batch(observations, &trace_attrs) {
                            Ok(events) => events,
                            Err(e) => {
                                let _ = tx.send(CoordinatorMessage::Error(e)).await;
                                partition_pb.finish_with_message("Failed");
                                return Err(anyhow::anyhow!("Transform failed"));
                            }
                        };

                        let event_count = events.len();
                        total_events_generated.fetch_add(event_count as u64, Ordering::SeqCst);

                        // Send events to coordinator
                        if let Err(e) = tx.send(CoordinatorMessage::Events(events)).await {
                            partition_pb.finish_with_message("Channel error");
                            return Err(anyhow::anyhow!("Failed to send events: {}", e));
                        }

                        partition_pb.set_message(format!(
                            "Batch {} complete ({} events)",
                            batch_idx, event_count
                        ));
                    }
                    Err(e) => {
                        // Log with full error chain for debugging
                        let error_chain = format!("{:#}", e);
                        tracing::error!(
                            partition_id = partition_id,
                            batch_num = batch_idx,
                            bucket = %config.s3_bucket,
                            prefix = %config.s3_prefix,
                            error = %error_chain,
                            "Partition failed to process - full error details above"
                        );
                        partition_pb.finish_with_message(format!("Failed: {}", e));
                        let _ = tx.send(CoordinatorMessage::Error(e)).await;
                        return Err(anyhow::anyhow!("Partition {} failed", partition_id));
                    }
                }
            }

            // All batches processed successfully - signal completion
            let _ = tx
                .send(CoordinatorMessage::PartitionComplete(partition_id))
                .await;
            partition_pb.finish_with_message("Complete");
            Ok(())
        });

        reader_handles.push(handle);
    }

    // Drop the original sender so coordinator knows when all readers are done
    drop(tx);

    // Spawn flush coordinator task
    tracing::info!("Starting flush coordinator...");
    let coordinator_handle = tokio::spawn({
        let total_events_flushed = Arc::clone(&total_events_flushed);
        let overall_pb = overall_pb.clone();
        let shutdown_flag = Arc::clone(&shutdown_flag);
        let event_flush_threshold = config.event_flush_threshold;

        async move {
            let mut event_buffer = Vec::new();
            let mut partitions_completed = 0u32;
            let mut flush_count = 0usize;
            let start_time = Instant::now();

            while let Some(message) = rx.recv().await {
                // Check shutdown flag
                if shutdown_flag.load(Ordering::SeqCst) {
                    tracing::warn!("Coordinator received shutdown signal");
                    break;
                }

                match message {
                    CoordinatorMessage::Events(events) => {
                        event_buffer.extend(events);

                        // Flush when threshold is reached
                        if event_buffer.len() >= event_flush_threshold {
                            flush_count += 1;
                            let to_flush = event_buffer.split_off(0);
                            let flush_size = to_flush.len();

                            tracing::info!(
                                "Flush #{}: Inserting {} events to ClickHouse",
                                flush_count,
                                flush_size
                            );

                            if let Err(e) =
                                inserter.insert_with_tracking(to_flush, flush_count).await
                            {
                                tracing::error!("Insert failed: {}", e);
                                return Err(e);
                            }

                            total_events_flushed.fetch_add(flush_size as u64, Ordering::SeqCst);
                            overall_pb.set_position(total_events_flushed.load(Ordering::SeqCst));

                            let elapsed = start_time.elapsed().as_secs_f64();
                            let throughput = if elapsed > 0.0 {
                                total_events_flushed.load(Ordering::SeqCst) as f64 / elapsed
                            } else {
                                0.0
                            };
                            overall_pb.set_message(format!("{:.0} events/sec", throughput));
                        }
                    }
                    CoordinatorMessage::PartitionComplete(partition_id) => {
                        partitions_completed += 1;
                        tracing::info!(
                            "Partition {} complete ({}/{} partitions done)",
                            partition_id,
                            partitions_completed,
                            config.partition_count
                        );
                    }
                    CoordinatorMessage::Error(e) => {
                        tracing::error!("Reader error: {}", e);
                        return Err(e);
                    }
                }
            }

            // Flush remaining events
            if !event_buffer.is_empty() {
                flush_count += 1;
                let flush_size = event_buffer.len();

                tracing::info!(
                    "Final flush: Inserting {} remaining events to ClickHouse",
                    flush_size
                );

                inserter
                    .insert_with_tracking(event_buffer, flush_count)
                    .await?;

                total_events_flushed.fetch_add(flush_size as u64, Ordering::SeqCst);
                overall_pb.set_position(total_events_flushed.load(Ordering::SeqCst));
            }

            overall_pb.finish_with_message("All events flushed");
            Ok::<(), anyhow::Error>(())
        }
    });

    // Wait for all readers to complete
    tracing::info!("Waiting for partition readers to complete...");
    let mut reader_error = None;
    for (idx, handle) in reader_handles.into_iter().enumerate() {
        match handle.await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                tracing::error!("Reader {} failed: {}", idx, e);
                reader_error = Some(e);
                break;
            }
            Err(e) => {
                tracing::error!("Reader {} panicked: {}", idx, e);
                reader_error = Some(anyhow::anyhow!("Reader {} panicked", idx));
                break;
            }
        }
    }

    // Check for reader errors (fail fast)
    if let Some(e) = reader_error {
        tracing::error!("Processing failed due to reader error, shutting down...");
        shutdown_flag.store(true, Ordering::SeqCst);
        return Err(e);
    }

    // Wait for coordinator to finish
    tracing::info!("Waiting for coordinator to flush remaining events...");
    match coordinator_handle.await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            tracing::error!("Coordinator failed: {}", e);
            return Err(e);
        }
        Err(e) => {
            tracing::error!("Coordinator panicked: {}", e);
            return Err(anyhow::anyhow!("Coordinator panicked"));
        }
    }

    // Print final statistics
    let elapsed = Instant::now().elapsed();
    let events_generated = total_events_generated.load(Ordering::SeqCst);
    let events_flushed = total_events_flushed.load(Ordering::SeqCst);
    let throughput = if elapsed.as_secs() > 0 {
        events_flushed / elapsed.as_secs()
    } else {
        0
    };

    tracing::info!("=== Backfill Summary ===");
    tracing::info!("Partition: {}", config.partition);
    tracing::info!("Partitions processed: {}", config.partition_count);
    tracing::info!("Total events generated: {}", events_generated);
    tracing::info!("Total events flushed: {}", events_flushed);
    tracing::info!("Total time: {:.2}s", elapsed.as_secs_f64());
    tracing::info!("Throughput: {} events/sec", throughput);
    tracing::info!("Dry run: {}", config.dry_run);

    if !config.dry_run {
        tracing::info!("Backfill completed successfully!");
    }

    Ok(())
}
