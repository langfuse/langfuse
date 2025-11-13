use clickhouse::{Client, Compression};

#[tokio::test]
async fn wait_end_of_query() {
    let client = prepare_database!();
    let scenarios = vec![
        // wait_end_of_query=?, expected_rows
        (false, 3), // server returns some rows before throwing an error
        (true, 0),  // server throws an error immediately
    ];
    for (wait_end_of_query, expected_rows) in scenarios {
        let result = max_execution_time(client.clone(), wait_end_of_query).await;
        assert_eq!(
            result, expected_rows,
            "wait_end_of_query: {wait_end_of_query}, expected_rows: {expected_rows}"
        );
    }
}

async fn max_execution_time(mut client: Client, wait_end_of_query: bool) -> u8 {
    if wait_end_of_query {
        client = client.with_option("wait_end_of_query", "1")
    }

    // TODO: check different `timeout_overflow_mode`
    let mut cursor = client
        .with_compression(Compression::None)
        // fails on the 4th row
        .with_option("max_execution_time", "0.1")
        // force streaming one row in a chunk
        .with_option("max_block_size", "1")
        .query("SELECT sleepEachRow(0.03) AS s FROM system.numbers LIMIT 5")
        .fetch::<u8>()
        .unwrap();

    let mut i = 0;
    let err = loop {
        match cursor.next().await {
            Ok(Some(_)) => i += 1,
            Ok(None) => panic!("DB exception hasn't been found"),
            Err(err) => break err,
        }
    };
    assert!(err.to_string().contains("TIMEOUT_EXCEEDED"));
    i
}

#[cfg(feature = "lz4")]
#[tokio::test]
async fn deferred_lz4() {
    let client = prepare_database!().with_compression(Compression::Lz4);

    client
        .query("CREATE TABLE test(no UInt32) ENGINE = MergeTree ORDER BY no")
        .execute()
        .await
        .unwrap();

    #[derive(serde::Serialize, clickhouse::Row)]
    struct Row {
        no: u32,
    }

    let part_count = 100;
    let part_size = 100_000;

    // Due to compression we need more complex test here: write a lot of big parts.
    for i in 0..part_count {
        let mut insert = client.insert::<Row>("test").await.unwrap();

        for j in 0..part_size {
            let row = Row {
                no: i * part_size + j,
            };

            insert.write(&row).await.unwrap();
        }

        insert.end().await.unwrap();
    }

    let mut cursor = client
        .with_option("max_execution_time", "0.1")
        .query("SELECT no FROM test")
        .fetch::<u32>()
        .unwrap();

    let mut i = 0;

    let err = loop {
        match cursor.next().await {
            Ok(Some(_)) => i += 1,
            Ok(None) => panic!("DB exception hasn't been found"),
            Err(err) => break err,
        }
    };

    assert_ne!(i, 0); // we're interested only in errors during processing
    assert!(err.to_string().contains("TIMEOUT_EXCEEDED"));
}
