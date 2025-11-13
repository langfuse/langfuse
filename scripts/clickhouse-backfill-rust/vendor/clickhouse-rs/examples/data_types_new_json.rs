use serde::{Deserialize, Serialize};

use clickhouse::sql::Identifier;
use clickhouse::{Client, Row, error::Result};

// Requires ClickHouse 24.10+, as the `input_format_binary_read_json_as_string` and `output_format_binary_write_json_as_string` settings were added in that version.
// Inserting and selecting a row with a JSON column as a string.
// See also: https://clickhouse.com/docs/en/sql-reference/data-types/newjson

#[tokio::main]
async fn main() -> Result<()> {
    let table_name = "chrs_data_types_new_json";
    let client = Client::default()
        .with_url("http://localhost:8123")
        // All these settings can instead be applied on the query or insert level with the same `with_option` method.
        // Enable new JSON type usage
        .with_option("allow_experimental_json_type", "1")
        // Enable inserting JSON columns as a string
        .with_option("input_format_binary_read_json_as_string", "1")
        // Enable selecting JSON columns as a string
        .with_option("output_format_binary_write_json_as_string", "1");

    client
        .query(
            "
            CREATE OR REPLACE TABLE ?
            (
                id   UInt64,
                data JSON
            ) ENGINE MergeTree ORDER BY id;
        ",
        )
        .bind(Identifier(table_name))
        .execute()
        .await?;

    let row = MyRow {
        id: 1,
        data: r#"
        {
            "name": "John Doe",
            "age": 42,
            "phones": [
                "+123 456 789",
                "+987 654 321"
            ]
        }"#
        .to_string(),
    };

    let mut insert = client.insert::<MyRow>(table_name).await?;
    insert.write(&row).await?;
    insert.end().await?;

    let db_row = client
        .query("SELECT ?fields FROM ? LIMIT 1")
        .bind(Identifier(table_name))
        .fetch_one::<MyRow>()
        .await?;

    println!("{db_row:#?}");

    // You can then use any JSON library to parse the JSON string, e.g., serde_json.
    let json_value: serde_json::Value = serde_json::from_str(&db_row.data).expect("Invalid JSON");
    println!("Extracted name from JSON: {}", json_value["name"]);

    Ok(())
}

#[derive(Debug, Row, Serialize, Deserialize)]
pub struct MyRow {
    id: u64,
    data: String,
}
