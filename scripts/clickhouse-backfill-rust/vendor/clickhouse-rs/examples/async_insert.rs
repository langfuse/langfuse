use std::time::{Duration, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use clickhouse::sql::Identifier;
use clickhouse::{Client, Row, error::Result};

// This example demonstrates how to use asynchronous inserts, avoiding client side batching of the incoming data.
// Suitable for ClickHouse Cloud, too. See https://clickhouse.com/docs/en/optimize/asynchronous-inserts

#[derive(Debug, Serialize, Deserialize, Row)]
struct Event {
    timestamp: i64,
    message: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let table_name = "chrs_async_insert";

    let client = Client::default()
        .with_url("http://localhost:8123")
        // https://clickhouse.com/docs/en/operations/settings/settings#async-insert
        .with_option("async_insert", "1")
        // https://clickhouse.com/docs/en/operations/settings/settings#wait-for-async-insert
        .with_option("wait_for_async_insert", "0");

    client
        .query(
            "
            CREATE OR REPLACE TABLE ? (
                timestamp DateTime64(9),
                message   String
            )
            ENGINE = MergeTree
            ORDER BY timestamp
            ",
        )
        .bind(Identifier(table_name))
        .execute()
        .await?;

    let mut insert = client.insert::<Event>(table_name).await?;
    insert
        .write(&Event {
            timestamp: now(),
            message: "one".into(),
        })
        .await?;
    insert.end().await?;

    loop {
        let events = client
            .query("SELECT ?fields FROM ?")
            .bind(Identifier(table_name))
            .fetch_all::<Event>()
            .await?;
        if !events.is_empty() {
            println!("Async insert was flushed");
            println!("{events:?}");
            break;
        }
        // If you change the `wait_for_async_insert` setting to 1, this line will never be printed;
        // however, without waiting, you will see it in the console output several times,
        // as the data will remain in the server buffer for a bit before the flush happens
        println!("Waiting for async insert flush...");
        tokio::time::sleep(Duration::from_millis(10)).await
    }

    Ok(())
}

fn now() -> i64 {
    UNIX_EPOCH
        .elapsed()
        .expect("invalid system time")
        .as_nanos() as i64
}
