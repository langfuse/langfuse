use clickhouse::{Client, error::Result};
use uuid::Uuid;

/// Besides [`Client::query`], it works similarly with [`Client::insert`] and [`Client::inserter`].
#[tokio::main]
async fn main() -> Result<()> {
    let client = Client::default().with_url("http://localhost:8123");

    let query_id = Uuid::new_v4().to_string();

    let numbers = client
        .query("SELECT number FROM system.numbers LIMIT 1")
        .with_option("query_id", &query_id)
        .fetch_all::<u64>()
        .await?;
    println!("Numbers: {numbers:?}");

    // For the sake of this example, force flush the records into the system.query_log table,
    // so we can immediately fetch the query information using the query_id
    client.query("SYSTEM FLUSH LOGS").execute().await?;

    let logged_query = client
        .query("SELECT query FROM system.query_log WHERE query_id = ?")
        .bind(&query_id)
        .fetch_one::<String>()
        .await?;
    println!("Query from system.query_log: {logged_query}");

    Ok(())
}
