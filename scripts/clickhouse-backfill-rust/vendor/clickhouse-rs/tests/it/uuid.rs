#![cfg(feature = "uuid")]

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use clickhouse::Row;

#[tokio::test]
async fn smoke() {
    let client = prepare_database!();

    #[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Row)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::uuid")]
        uuid: Uuid,
        #[serde(with = "clickhouse::serde::uuid::option")]
        uuid_opt: Option<Uuid>,
    }

    client
        .query(
            "
            CREATE TABLE test(
                uuid UUID,
                uuid_opt Nullable(UUID)
            ) ENGINE = MergeTree ORDER BY uuid
        ",
        )
        .execute()
        .await
        .unwrap();

    let uuid = Uuid::new_v4();
    println!("uuid: {uuid}");

    let original_row = MyRow {
        uuid,
        uuid_opt: Some(uuid),
    };

    let mut insert = client.insert::<MyRow>("test").await.unwrap();
    insert.write(&original_row).await.unwrap();
    insert.end().await.unwrap();

    let (row, row_uuid_str) = client
        .query("SELECT ?fields, toString(uuid) FROM test")
        .fetch_one::<(MyRow, String)>()
        .await
        .unwrap();

    assert_eq!(row, original_row);
    assert_eq!(row_uuid_str, original_row.uuid.to_string());
}

#[tokio::test]
async fn human_readable_smoke() {
    #[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Row)]
    struct OursRow {
        #[serde(with = "clickhouse::serde::uuid")]
        uuid: Uuid,
    }

    #[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Row)]
    struct TheirsRow {
        uuid: Uuid,
    }

    let uuid = Uuid::new_v4();

    let row = OursRow { uuid };

    let row2 = TheirsRow { uuid };

    let s1 = serde_json::to_string(&row).unwrap();
    let s2 = serde_json::to_string(&row2).unwrap();

    assert_eq!(s1, s2);

    let new_row2: TheirsRow = serde_json::from_str(&s2).unwrap();

    assert_eq!(new_row2, row2);
}
