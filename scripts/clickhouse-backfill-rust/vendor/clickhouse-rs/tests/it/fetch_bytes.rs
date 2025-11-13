use clickhouse::error::Error;
use std::str::from_utf8;
use tokio::io::{AsyncBufReadExt, AsyncReadExt};

#[tokio::test]
async fn single_chunk() {
    let client = prepare_database!();

    let mut cursor = client
        .query("SELECT number FROM system.numbers LIMIT 3")
        .fetch_bytes("CSV")
        .unwrap();

    let mut total_chunks = 0;
    let mut buffer = Vec::<u8>::new();
    while let Some(chunk) = cursor.next().await.unwrap() {
        buffer.extend(chunk);
        total_chunks += 1;
    }

    assert_eq!(from_utf8(&buffer).unwrap(), "0\n1\n2\n");
    assert_eq!(total_chunks, 1);
    assert_eq!(cursor.decoded_bytes(), 6);
}

#[tokio::test]
async fn multiple_chunks() {
    let client = prepare_database!();

    let mut cursor = client
        .query("SELECT number FROM system.numbers LIMIT 3")
        // each number will go into a separate chunk
        .with_option("max_block_size", "1")
        .fetch_bytes("CSV")
        .unwrap();

    let mut total_chunks = 0;
    let mut buffer = Vec::<u8>::new();
    while let Some(data) = cursor.next().await.unwrap() {
        buffer.extend(data);
        total_chunks += 1;
    }

    assert_eq!(from_utf8(&buffer).unwrap(), "0\n1\n2\n");
    assert_eq!(total_chunks, 3);
    assert_eq!(cursor.decoded_bytes(), 6);
}

#[tokio::test]
async fn error() {
    let client = prepare_database!();

    let mut bytes_cursor = client
        .query("SELECT sleepEachRow(0.05) AS s FROM system.numbers LIMIT 30")
        .with_option("max_block_size", "1")
        .with_option("max_execution_time", "0.01")
        .fetch_bytes("JSONEachRow")
        .unwrap();

    let err = bytes_cursor.next().await;
    println!("{err:?}");
    assert!(matches!(err, Err(Error::BadResponse(_))));
}

#[tokio::test]
async fn lines() {
    let client = prepare_database!();
    let expected = ["0", "1", "2"];

    for n in 0..4 {
        let mut lines = client
            .query("SELECT number FROM system.numbers LIMIT {limit: Int32}")
            .param("limit", n)
            // each number will go into a separate chunk
            .with_option("max_block_size", "1")
            .fetch_bytes("CSV")
            .unwrap()
            .lines();

        let mut actual = Vec::<String>::new();
        while let Some(data) = lines.next_line().await.unwrap() {
            actual.push(data);
        }

        assert_eq!(actual, &expected[..n]);
    }
}

#[tokio::test]
async fn collect() {
    let client = prepare_database!();
    let expected = b"0\n1\n2\n3\n";

    for n in 0..4 {
        let mut cursor = client
            .query("SELECT number FROM system.numbers LIMIT {limit: Int32}")
            .param("limit", n)
            // each number will go into a separate chunk
            .with_option("max_block_size", "1")
            .fetch_bytes("CSV")
            .unwrap();

        let data = cursor.collect().await.unwrap();
        assert_eq!(&data[..], &expected[..n * 2]);

        // The cursor is fused.
        assert_eq!(&cursor.collect().await.unwrap()[..], b"");
    }
}

#[tokio::test]
async fn async_read() {
    let client = prepare_database!();
    let limit = 1000;

    let mut cursor = client
        .query("SELECT number, number FROM system.numbers LIMIT {limit: Int32}")
        .param("limit", limit)
        .with_option("max_block_size", "3")
        .fetch_bytes("CSV")
        .unwrap();

    #[allow(clippy::format_collect)]
    let expected = (0..limit)
        .map(|n| format!("{n},{n}\n"))
        .collect::<String>()
        .into_bytes();

    let mut actual = vec![0; expected.len()];
    let mut index = 0;
    while index < actual.len() {
        let step = (1 + index % 10).min(actual.len() - index);
        let buf = &mut actual[index..(index + step)];
        assert_eq!(cursor.read_exact(buf).await.unwrap(), step);
        index += step;
    }

    assert_eq!(cursor.read(&mut [0]).await.unwrap(), 0); // EOF
    assert_eq!(cursor.decoded_bytes(), expected.len() as u64);
    assert_eq!(actual, expected);
}
