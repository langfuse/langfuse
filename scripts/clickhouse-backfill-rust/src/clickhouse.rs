use anyhow::{Context, Result};
use clickhouse::Client;

use crate::config::Config;

/// Create a ClickHouse client for reading
pub fn create_read_client(config: &Config) -> Result<Client> {
    let client = Client::default()
        .with_url(&config.clickhouse_url)
        .with_user(&config.clickhouse_user)
        .with_password(&config.clickhouse_password)
        .with_database(&config.clickhouse_db)
        .with_option("max_execution_time", "3600") // 1 hour timeout
        .with_option("max_block_size", &config.stream_block_size.to_string());

    tracing::debug!("Created ClickHouse read client");
    Ok(client)
}

/// Create a ClickHouse client for writing (with async insert settings)
pub fn create_write_client(config: &Config) -> Result<Client> {
    let client = Client::default()
        .with_url(&config.clickhouse_url)
        .with_user(&config.clickhouse_user)
        .with_password(&config.clickhouse_password)
        .with_database(&config.clickhouse_db)
        .with_option("async_insert", "1")
        .with_option("wait_for_async_insert", "1")
        .with_option("async_insert_max_data_size", "10485760") // 10MB
        .with_option("async_insert_busy_timeout_ms", "1000");

    tracing::debug!("Created ClickHouse write client with async insert settings");
    Ok(client)
}

/// Test ClickHouse connection
pub async fn test_connection(client: &Client) -> Result<()> {
    let result: String = client
        .query("SELECT version()")
        .fetch_one()
        .await
        .context("Failed to connect to ClickHouse")?;

    tracing::info!("Connected to ClickHouse version: {}", result);
    Ok(())
}

/// Check if tables exist
pub async fn verify_tables(client: &Client) -> Result<()> {
    let tables = vec!["observations", "traces", "events"];

    for table in tables {
        let exists: u8 = client
            .query(&format!(
                "SELECT 1 FROM system.tables WHERE database = currentDatabase() AND name = '{}' LIMIT 1",
                table
            ))
            .fetch_optional()
            .await
            .context(format!("Failed to check if table '{}' exists", table))?
            .unwrap_or(0);

        if exists == 0 {
            anyhow::bail!("Required table '{}' does not exist", table);
        }

        tracing::debug!("Verified table '{}' exists", table);
    }

    Ok(())
}

/// Get row count for a partition
pub async fn get_partition_row_count(
    client: &Client,
    table: &str,
    partition: &str,
) -> Result<u64> {
    let count: u64 = client
        .query(&format!(
            "SELECT count() FROM {} WHERE _partition_id = ? AND is_deleted = 0",
            table
        ))
        .bind(partition)
        .fetch_one()
        .await
        .context(format!(
            "Failed to get row count for partition {} in table {}",
            partition, table
        ))?;

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
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
            cursor_state_dir: std::path::PathBuf::from("."),
            cursor_file: "cursor_state.json".to_string(),
            parallel_workers: 4,
        };

        let read_client = create_read_client(&config);
        assert!(read_client.is_ok());

        let write_client = create_write_client(&config);
        assert!(write_client.is_ok());
    }
}
