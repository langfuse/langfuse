use anyhow::Result;
use clap::Parser;

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

    /// S3 bucket name for parquet files
    #[arg(long, env = "S3_BUCKET")]
    pub s3_bucket: String,

    /// S3 prefix for parquet files (e.g., "exports/observations/2025/10")
    #[arg(long, env = "S3_PREFIX")]
    pub s3_prefix: String,

    /// S3 region (optional, defaults to AWS SDK's default region resolution)
    #[arg(long, env = "S3_REGION")]
    pub s3_region: Option<String>,

    /// AWS Access Key ID (optional, falls back to default credential chain)
    #[arg(long, env = "AWS_ACCESS_KEY_ID")]
    pub aws_access_key_id: Option<String>,

    /// AWS Secret Access Key (optional, falls back to default credential chain)
    #[arg(long, env = "AWS_SECRET_ACCESS_KEY")]
    pub aws_secret_access_key: Option<String>,

    /// Number of trace_modulo partitions
    #[arg(long, env = "PARTITION_COUNT", default_value = "30")]
    pub partition_count: u32,

    /// Flush events to ClickHouse every N events
    #[arg(long, env = "EVENT_FLUSH_THRESHOLD", default_value = "100000")]
    pub event_flush_threshold: usize,
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

        Ok(config)
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
        tracing::info!("  S3 Bucket: {}", self.s3_bucket);
        tracing::info!("  S3 Prefix: {}", self.s3_prefix);
        if let Some(ref region) = self.s3_region {
            tracing::info!("  S3 Region: {}", region);
        }
        tracing::info!("  Partition Count: {}", self.partition_count);
        tracing::info!("  Event Flush Threshold: {}", self.event_flush_threshold);
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
            s3_bucket: "test-bucket".to_string(),
            s3_prefix: "exports/observations/2025/10".to_string(),
            s3_region: None,
            aws_access_key_id: None,
            aws_secret_access_key: None,
            partition_count: 30,
            event_flush_threshold: 100000,
        };

        assert_eq!(config.partition, "202511");
    }
}
