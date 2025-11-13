use serde::{Deserialize, Serialize};

use clickhouse::Row;

#[tokio::test]
async fn u128() {
    let client = prepare_database!();

    #[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Row)]
    struct MyRow {
        id: u128,
        value: String,
    }

    client
        .query(
            "
            CREATE TABLE test(
                id UInt128,
                value String,
            ) ENGINE = MergeTree ORDER BY id
        ",
        )
        .execute()
        .await
        .unwrap();

    let ids = [0, 1, 1234567890, u128::MAX];

    let original_rows = ids
        .into_iter()
        .enumerate()
        .map(|(i, id)| MyRow {
            id,
            value: format!("test_{i}"),
        })
        .collect::<Vec<_>>();

    let mut insert = client.insert::<MyRow>("test").await.unwrap();
    for row in &original_rows {
        insert.write(row).await.unwrap();
    }
    insert.end().await.unwrap();

    // Test binding individual values
    for original in &original_rows {
        let row = client
            .query("SELECT ?fields FROM test WHERE id = ?")
            .bind(original.id)
            .fetch_one::<MyRow>()
            .await
            .unwrap();

        assert_eq!(row, *original);

        let row = client
            .query("SELECT ?fields FROM test WHERE id = {id:UInt128}")
            .param("id", original.id)
            .fetch_one::<MyRow>()
            .await
            .unwrap();

        assert_eq!(row, *original);
    }

    // Test binding arrays
    let rows = client
        .query("SELECT ?fields FROM test WHERE id IN ? ORDER BY value")
        .bind(ids)
        .fetch_all::<MyRow>()
        .await
        .unwrap();

    assert_eq!(rows, original_rows);

    // https://github.com/ClickHouse/clickhouse-rs/issues/290
    let rows = client
        .query("SELECT ?fields FROM test WHERE id IN {ids:Array(UInt128)} ORDER BY value")
        // FIXME(?): `impl Serialize for [T; N]` uses `serialize_tuple()`
        // but `Vec<T>` and `&[T]` use `serialize_seq()`
        .param("ids", &ids[..])
        .fetch_all::<MyRow>()
        .await
        .unwrap();

    assert_eq!(rows, original_rows);
}

#[tokio::test]
async fn i128() {
    let client = prepare_database!();

    #[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Row)]
    struct MyRow {
        id: i128,
        value: String,
    }

    client
        .query(
            "
            CREATE TABLE test(
                id Int128,
                value String,
            ) ENGINE = MergeTree ORDER BY id
        ",
        )
        .execute()
        .await
        .unwrap();

    let ids = [i128::MIN, -1234567890, -1, 0, 1, 1234567890, i128::MAX];

    let original_rows = ids
        .into_iter()
        .enumerate()
        .map(|(i, id)| MyRow {
            id,
            value: format!("test_{i}"),
        })
        .collect::<Vec<_>>();

    let mut insert = client.insert::<MyRow>("test").await.unwrap();
    for row in &original_rows {
        insert.write(row).await.unwrap();
    }
    insert.end().await.unwrap();

    // Test binding individual values
    for original in &original_rows {
        let row = client
            .query("SELECT ?fields FROM test WHERE id = ?")
            .bind(original.id)
            .fetch_one::<MyRow>()
            .await
            .unwrap();

        assert_eq!(row, *original);

        let row = client
            .query("SELECT ?fields FROM test WHERE id = {id:Int128}")
            .param("id", original.id)
            .fetch_one::<MyRow>()
            .await
            .unwrap();

        assert_eq!(row, *original);
    }

    // Test binding arrays
    let rows = client
        .query("SELECT ?fields FROM test WHERE id IN ? ORDER BY value")
        .bind(ids)
        .fetch_all::<MyRow>()
        .await
        .unwrap();

    assert_eq!(rows, original_rows);

    // https://github.com/ClickHouse/clickhouse-rs/issues/290
    let rows = client
        .query("SELECT ?fields FROM test WHERE id IN {ids:Array(Int128)} ORDER BY value")
        // FIXME(?): `impl Serialize for [T; N]` uses `serialize_tuple()`
        // but `Vec<T>` and `&[T]` use `serialize_seq()`
        .param("ids", &ids[..])
        .fetch_all::<MyRow>()
        .await
        .unwrap();

    assert_eq!(rows, original_rows);
}

#[tokio::test]
async fn issue_290() {
    let client = prepare_database!();

    client
        .query("CREATE OR REPLACE TABLE demo_ch_works(id UInt64) Engine=MergeTree ORDER BY id ASC")
        .execute()
        .await
        .unwrap();

    for i in &[1u64, 2, 3, 4, 5] {
        client
            .query("INSERT INTO demo_ch_works(id) VALUES({value:UInt64})")
            .param("value", i)
            .execute()
            .await
            .unwrap();
    }

    let rows: Vec<u64> = client
        .query("SELECT * FROM demo_ch_works WHERE id IN {ids:Array(UInt64)} ORDER BY id")
        .param("ids", vec![1u64, 2u64])
        .fetch_all()
        .await
        .unwrap();

    assert_eq!(*rows, [1, 2]);

    client
        .query("CREATE OR REPLACE TABLE demo_ch_bug(id UInt128) Engine=MergeTree ORDER BY id ASC")
        .execute()
        .await
        .unwrap();

    for i in &[1u128, 2, 3, 4, 5] {
        client
            .query("INSERT INTO demo_ch_bug(id) VALUES({value:UInt128})")
            .param("value", i)
            .execute()
            .await
            .unwrap();
    }

    let rows: Vec<u128> = client
        .query("SELECT * FROM demo_ch_bug WHERE id IN {ids:Array(UInt128)} ORDER BY id")
        .param("ids", vec![1u128, 2u128])
        .fetch_all()
        .await
        .unwrap();

    assert_eq!(*rows, [1, 2]);

    // Assert that client-side binds still work as expected.
    let rows: Vec<u128> = client
        .query("SELECT * FROM demo_ch_bug WHERE id IN ? ORDER BY id")
        .bind(vec![1u128, 2u128])
        .fetch_all()
        .await
        .unwrap();

    assert_eq!(*rows, [1, 2]);
}
