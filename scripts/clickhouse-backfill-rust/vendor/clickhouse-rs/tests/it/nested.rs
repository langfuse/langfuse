use serde::{Deserialize, Serialize};

use clickhouse::Row;

#[tokio::test]
async fn smoke() {
    let client = prepare_database!();

    #[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Row)]
    struct MyRow {
        no: i32,
        #[serde(rename = "items.name")]
        items_name: Vec<String>,
        #[serde(rename = "items.count")]
        items_count: Vec<u32>,
    }

    client
        .query(
            "
        CREATE TABLE test(
            no      Int32,
            items   Nested(
                name    String,
                count   UInt32
            )
        )
        ENGINE = MergeTree ORDER BY no
    ",
        )
        .execute()
        .await
        .unwrap();

    let original_row = MyRow {
        no: 42,
        items_name: vec!["foo".into(), "bar".into()],
        items_count: vec![1, 5],
    };

    let mut insert = client.insert::<MyRow>("test").await.unwrap();
    insert.write(&original_row).await.unwrap();
    insert.end().await.unwrap();

    let row = client
        .query("SELECT ?fields FROM test")
        .fetch_one::<MyRow>()
        .await
        .unwrap();

    assert_eq!(row, original_row);
}
