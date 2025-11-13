use clickhouse::Client;
use clickhouse::Row;
use clickhouse::sql::Identifier;
use serde::{Deserialize, Serialize};
use std::env;

// This example requires three environment variables with your instance credentials to be set
//
// - CLICKHOUSE_URL (e.g., https://myservice.clickhouse.cloud:8443)
// - CLICKHOUSE_USER
// - CLICKHOUSE_PASSWORD
//
// Works with either `rustls-tls` or `native-tls` cargo features.

#[tokio::main]
async fn main() -> clickhouse::error::Result<()> {
    let table_name = "chrs_cloud";

    let client = Client::default()
        .with_url(read_env_var("CLICKHOUSE_URL"))
        .with_user(read_env_var("CLICKHOUSE_USER"))
        .with_password(read_env_var("CLICKHOUSE_PASSWORD"));

    // `wait_end_of_query` is required in this case, as we want these DDLs to be executed
    // on the entire Cloud cluster before we receive the response.
    // See https://clickhouse.com/docs/en/interfaces/http/#response-buffering
    client
        .query("DROP TABLE IF EXISTS ?")
        .bind(Identifier(table_name))
        .with_option("wait_end_of_query", "1")
        .execute()
        .await?;

    // Note that you could just use MergeTree with CH Cloud, and omit the `ON CLUSTER` clause.
    // The same applies to other engines as well;
    // e.g., ReplacingMergeTree will become SharedReplacingMergeTree and so on.
    // See https://clickhouse.com/docs/en/cloud/reference/shared-merge-tree#enabling-sharedmergetree
    client
        .query("CREATE TABLE ? (id Int32, name String) ENGINE MergeTree ORDER BY id")
        .bind(Identifier(table_name))
        .with_option("wait_end_of_query", "1")
        .execute()
        .await?;

    let mut insert = client.insert::<MyRow>(table_name).await?;
    insert
        .write(&MyRow {
            id: 42,
            name: "foo".into(),
        })
        .await?;
    insert.end().await?;

    let data = client
        .query("SELECT ?fields FROM ?")
        .bind(Identifier(table_name))
        // This setting is optional; use it when you need strong consistency guarantees on the reads
        // See https://clickhouse.com/docs/en/cloud/reference/shared-merge-tree#consistency
        .with_option("select_sequential_consistency", "1")
        .fetch_all::<MyRow>()
        .await?;

    println!("Stored data: {data:?}");
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Row)]
struct MyRow {
    id: i32,
    name: String,
}

fn read_env_var(key: &str) -> String {
    env::var(key).unwrap_or_else(|_| panic!("{key} env variable should be set"))
}
