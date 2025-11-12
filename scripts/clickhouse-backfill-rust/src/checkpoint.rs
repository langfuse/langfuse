use anyhow::{Context, Result};
use chrono::Utc;
use std::fs;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::types::{CheckpointState, Cursor};

/// Checkpoint manager for cursor state persistence
pub struct CheckpointManager {
    file_path: std::path::PathBuf,
    state: Arc<RwLock<CheckpointState>>,
}

impl CheckpointManager {
    /// Create a new checkpoint manager
    pub fn new(file_path: std::path::PathBuf, partition: String) -> Self {
        let state = CheckpointState {
            partition,
            cursor: Cursor::default(),
            rows_processed: 0,
            last_updated: Utc::now(),
        };

        Self {
            file_path,
            state: Arc::new(RwLock::new(state)),
        }
    }

    /// Load checkpoint from file if it exists
    pub async fn load(file_path: std::path::PathBuf, partition: String) -> Result<Self> {
        if file_path.exists() {
            tracing::info!("Loading checkpoint from: {:?}", file_path);

            let content = fs::read_to_string(&file_path)
                .context("Failed to read checkpoint file")?;

            let state: CheckpointState = serde_json::from_str(&content)
                .context("Failed to parse checkpoint file")?;

            // Verify partition matches
            if state.partition != partition {
                tracing::warn!(
                    "Checkpoint partition mismatch: expected {}, found {}. Starting fresh.",
                    partition,
                    state.partition
                );
                return Ok(Self::new(file_path, partition));
            }

            tracing::info!(
                "Loaded checkpoint: {} rows processed, cursor at ({}, {}, {}, {})",
                state.rows_processed,
                state.cursor.project_id,
                state.cursor.r#type,
                state.cursor.date,
                state.cursor.id
            );

            Ok(Self {
                file_path,
                state: Arc::new(RwLock::new(state)),
            })
        } else {
            tracing::info!("No existing checkpoint found, starting fresh");
            Ok(Self::new(file_path, partition))
        }
    }

    /// Get current cursor
    pub async fn get_cursor(&self) -> Cursor {
        self.state.read().await.cursor.clone()
    }

    /// Get rows processed count
    pub async fn get_rows_processed(&self) -> u64 {
        self.state.read().await.rows_processed
    }

    /// Update cursor and increment rows processed
    pub async fn update(&self, cursor: Cursor, rows_added: u64) -> Result<()> {
        let mut state = self.state.write().await;
        state.cursor = cursor;
        state.rows_processed += rows_added;
        state.last_updated = Utc::now();

        // Drop the write lock before saving
        drop(state);

        self.save().await
    }

    /// Save checkpoint to file (atomic write)
    pub async fn save(&self) -> Result<()> {
        let state = self.state.read().await;

        let content = serde_json::to_string_pretty(&*state)
            .context("Failed to serialize checkpoint state")?;

        // Atomic write: write to temp file, then rename
        let temp_path = self.file_path.with_extension("tmp");
        fs::write(&temp_path, content)
            .context("Failed to write checkpoint to temp file")?;

        fs::rename(&temp_path, &self.file_path)
            .context("Failed to rename temp checkpoint file")?;

        tracing::debug!(
            "Saved checkpoint: {} rows processed",
            state.rows_processed
        );

        Ok(())
    }

    // /// Get state for final summary
    // pub async fn get_state(&self) -> CheckpointState {
    //     self.state.read().await.clone()
    // }
    //
    // /// Clear checkpoint file
    // pub async fn clear(&self) -> Result<()> {
    //     if self.file_path.exists() {
    //         fs::remove_file(&self.file_path)
    //             .context("Failed to remove checkpoint file")?;
    //         tracing::info!("Cleared checkpoint file");
    //     }
    //     Ok(())
    // }
}

/// Signal handler for graceful shutdown
pub async fn setup_signal_handler(checkpoint_manager: Arc<CheckpointManager>) {
    tokio::spawn(async move {
        match tokio::signal::ctrl_c().await {
            Ok(()) => {
                tracing::warn!("Received interrupt signal, saving checkpoint...");
                if let Err(e) = checkpoint_manager.save().await {
                    tracing::error!("Failed to save checkpoint on interrupt: {}", e);
                } else {
                    tracing::info!("Checkpoint saved successfully");
                }
                std::process::exit(130); // Standard exit code for SIGINT
            }
            Err(err) => {
                tracing::error!("Failed to listen for interrupt signal: {}", err);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_checkpoint_save_and_load() {
        let temp_file = NamedTempFile::new().unwrap();
        let file_path = temp_file.path().to_path_buf();

        // Create and save checkpoint
        let manager = CheckpointManager::new(file_path.clone(), "202511".to_string());
        let cursor = Cursor::new(
            "project1".to_string(),
            "GENERATION".to_string(),
            chrono::NaiveDate::from_ymd_opt(2025, 11, 1).unwrap(),
            "obs-123".to_string(),
        );
        manager.update(cursor.clone(), 100).await.unwrap();

        // Load checkpoint
        let loaded = CheckpointManager::load(file_path, "202511".to_string())
            .await
            .unwrap();
        let loaded_cursor = loaded.get_cursor().await;
        let rows = loaded.get_rows_processed().await;

        assert_eq!(loaded_cursor.project_id, "project1");
        assert_eq!(loaded_cursor.r#type, "GENERATION");
        assert_eq!(rows, 100);
    }
}
