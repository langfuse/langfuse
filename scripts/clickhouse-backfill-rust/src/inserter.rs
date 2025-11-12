use anyhow::{Context, Result};
use clickhouse::Client;
use std::time::Duration;
use tokio::time::sleep;

use crate::types::Event;

/// Batch inserter with retry logic
pub struct EventInserter {
    client: Client,
    max_retries: usize,
    dry_run: bool,
}

impl EventInserter {
    pub fn new(client: Client, max_retries: usize, dry_run: bool) -> Self {
        Self {
            client,
            max_retries,
            dry_run,
        }
    }

    /// Insert a batch of events with retry logic
    pub async fn insert_batch(&self, events: Vec<Event>) -> Result<()> {
        if events.is_empty() {
            return Ok(());
        }

        if self.dry_run {
            tracing::info!("DRY RUN: Would insert {} events", events.len());
            return Ok(());
        }

        let mut attempt = 0;
        let mut last_error = None;

        while attempt < self.max_retries {
            match self.try_insert(&events).await {
                Ok(_) => {
                    tracing::debug!("Successfully inserted {} events", events.len());
                    return Ok(());
                }
                Err(e) => {
                    attempt += 1;
                    last_error = Some(e);

                    if attempt < self.max_retries {
                        let backoff_secs = 2u64.pow(attempt as u32);
                        tracing::warn!(
                            "Insert failed (attempt {}/{}), retrying in {}s: {:?}",
                            attempt,
                            self.max_retries,
                            backoff_secs,
                            last_error
                        );
                        sleep(Duration::from_secs(backoff_secs)).await;
                    }
                }
            }
        }

        // All retries exhausted
        Err(last_error
            .unwrap()
            .context(format!("Failed to insert batch after {} attempts", self.max_retries)))
    }

    /// Attempt to insert events (single try)
    async fn try_insert(&self, events: &[Event]) -> Result<()> {
        let mut insert = self.client.insert("events")?;

        for event in events {
            insert.write(event).await.context("Failed to write event")?;
        }

        insert.end().await.context("Failed to complete insert")?;

        Ok(())
    }

    /// Insert events with progress tracking and error samples
    pub async fn insert_with_tracking(
        &self,
        events: Vec<Event>,
        batch_number: usize,
    ) -> Result<()> {
        let event_count = events.len();

        // Sample event IDs for error reporting
        let sample_ids: Vec<String> = events
            .iter()
            .take(3)
            .map(|e| format!("{}:{}", e.project_id, e.span_id))
            .collect();

        match self.insert_batch(events).await {
            Ok(_) => {
                tracing::info!(
                    "Batch {} completed: {} events inserted",
                    batch_number,
                    event_count
                );
                Ok(())
            }
            Err(e) => {
                tracing::error!(
                    "Batch {} failed: {} events. Sample IDs: {}. Error: {:?}",
                    batch_number,
                    event_count,
                    sample_ids.join(", "),
                    e
                );
                Err(e)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exponential_backoff_calculation() {
        // Test that backoff calculation is correct
        for attempt in 1..=3 {
            let backoff_secs = 2u64.pow(attempt as u32);
            match attempt {
                1 => assert_eq!(backoff_secs, 2),
                2 => assert_eq!(backoff_secs, 4),
                3 => assert_eq!(backoff_secs, 8),
                _ => {}
            }
        }
    }
}
