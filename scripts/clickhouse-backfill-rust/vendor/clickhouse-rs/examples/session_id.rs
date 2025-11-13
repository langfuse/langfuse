use serde::{Deserialize, Serialize};
use uuid::Uuid;

use clickhouse::sql::Identifier;
use clickhouse::{Client, Row, error::Result};

/// Besides [`Client::with_option`], which will be applied for all requests,
/// `session_id` (and other settings) can be set separately for a particular `query`, `insert`,
/// or when using the `inserter` feature.
///
/// This example uses temporary tables feature to demonstrate the `session_id` usage.
///
/// # Important
/// With clustered deployments, due to lack of "sticky sessions", you need to be connected
/// to a _particular cluster node_ in order to properly utilize this feature, cause, for example,
/// a round-robin load-balancer will not guarantee that the consequent requests will be processed
/// by the same ClickHouse node.
///
/// See also:
/// - https://clickhouse.com/docs/en/sql-reference/statements/create/table#temporary-tables
/// - https://github.com/ClickHouse/ClickHouse/issues/21748
/// - `examples/clickhouse_settings.rs`.
#[tokio::main]
async fn main() -> Result<()> {
    let table_name = "chrs_session_id";
    let session_id = Uuid::new_v4().to_string();

    let client = Client::default()
        .with_url("http://localhost:8123")
        .with_option("session_id", &session_id);

    client
        .query("CREATE TEMPORARY TABLE ? (i Int32)")
        .bind(Identifier(table_name))
        .execute()
        .await?;

    #[derive(Row, Serialize, Deserialize, Debug)]
    struct MyRow {
        i: i32,
    }

    let mut insert = client.insert::<MyRow>(table_name).await?;
    insert.write(&MyRow { i: 42 }).await?;
    insert.end().await?;

    let data = client
        .query("SELECT ?fields FROM ?")
        .bind(Identifier(table_name))
        .fetch_all::<MyRow>()
        .await?;

    println!("Temporary table data: {data:?}");
    Ok(())
}
