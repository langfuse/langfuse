use anyhow::{Context, Result};
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug, Clone)]
#[command(name = "clickhouse-backfill-rust")]
#[command(about = "High-performance ClickHouse backfill tool for observations → events migration")]
pub struct Config {
    /// Partition to backfill (YYYYMM format, e.g., 202511)
    #[arg(long, env = "PARTITION")]
    pub partition: String,

    /// ClickHouse URL
    #[arg(long, env = "CLICKHOUSE_URL", default_value = "http://localhost:8123")]
    pub clickhouse_url: String,

    /// ClickHouse user
    #[arg(long, env = "CLICKHOUSE_USER", default_value = "clickhouse")]
    pub clickhouse_user: String,

    /// ClickHouse password
    #[arg(long, env = "CLICKHOUSE_PASSWORD", default_value = "clickhouse")]
    pub clickhouse_password: String,

    /// ClickHouse database
    #[arg(long, env = "CLICKHOUSE_DB", default_value = "default")]
    pub clickhouse_db: String,

    /// Number of events per insert batch
    #[arg(long, env = "BATCH_SIZE", default_value = "10000")]
    pub batch_size: usize,

    /// Number of observations to fetch per stream block
    #[arg(long, env = "STREAM_BLOCK_SIZE", default_value = "50000")]
    pub stream_block_size: usize,

    /// Dry run mode (no inserts)
    #[arg(long, env = "DRY_RUN", default_value = "false")]
    pub dry_run: bool,

    /// Maximum number of retries for failed inserts
    #[arg(long, env = "MAX_RETRIES", default_value = "3")]
    pub max_retries: usize,

    /// Directory for cursor state file
    #[arg(long, env = "CURSOR_STATE_DIR", default_value = ".")]
    pub cursor_state_dir: PathBuf,

    /// Cursor state filename
    #[arg(long, env = "CURSOR_FILE", default_value = "cursor_state.json")]
    pub cursor_file: String,

    /// Number of parallel workers for processing
    #[arg(long, env = "PARALLEL_WORKERS", default_value = "4")]
    pub parallel_workers: usize,
}

impl Config {
    /// Load configuration from environment and CLI arguments
    pub fn load() -> Result<Self> {
        // Load .env file if present (ignore if not found)
        let _ = dotenvy::dotenv();

        let config = Self::parse();

        // Validate partition format
        if config.partition.len() != 6 || !config.partition.chars().all(|c| c.is_ascii_digit()) {
            anyhow::bail!(
                "Invalid partition format: {}. Expected YYYYMM (e.g., 202511)",
                config.partition
            );
        }

        // Ensure cursor state directory exists
        if !config.cursor_state_dir.exists() {
            std::fs::create_dir_all(&config.cursor_state_dir).context(format!(
                "Failed to create cursor state directory: {:?}",
                config.cursor_state_dir
            ))?;
        }

        Ok(config)
    }

    // /// Get full path to cursor state file
    // pub fn cursor_file_path(&self) -> PathBuf {
    //     self.cursor_state_dir.join(&self.cursor_file)
    // }

    /// Get partition-specific cursor file path
    pub fn partition_cursor_file_path(&self) -> PathBuf {
        let filename = format!("cursor_state_{}.json", self.partition);
        self.cursor_state_dir.join(filename)
    }

    /// Print configuration summary
    pub fn print_summary(&self) {
        tracing::info!("Configuration:");
        tracing::info!("  Partition: {}", self.partition);
        tracing::info!("  ClickHouse URL: {}", self.clickhouse_url);
        tracing::info!("  ClickHouse DB: {}", self.clickhouse_db);
        tracing::info!("  Batch Size: {}", self.batch_size);
        tracing::info!("  Stream Block Size: {}", self.stream_block_size);
        tracing::info!("  Dry Run: {}", self.dry_run);
        tracing::info!("  Max Retries: {}", self.max_retries);
        tracing::info!("  Parallel Workers: {}", self.parallel_workers);
        tracing::info!("  Cursor File: {:?}", self.partition_cursor_file_path());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_partition_validation() {
        let config = Config {
            partition: "202511".to_string(),
            clickhouse_url: "http://localhost:8123".to_string(),
            clickhouse_user: "test".to_string(),
            clickhouse_password: "test".to_string(),
            clickhouse_db: "default".to_string(),
            batch_size: 10000,
            stream_block_size: 50000,
            dry_run: false,
            max_retries: 3,
            cursor_state_dir: PathBuf::from("."),
            cursor_file: "cursor_state.json".to_string(),
            parallel_workers: 4,
        };

        assert_eq!(config.partition, "202511");
    }
}
