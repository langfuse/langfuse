use clickhouse::{Client, Compression};

use crate::{SimpleRow, create_simple_table};

async fn check(client: Client, expected_ratio: f64) {
    create_simple_table(&client, "test").await;

    let mut insert = client.insert::<SimpleRow>("test").await.unwrap();
    for i in 0..1_000 {
        insert.write(&SimpleRow::new(i, "foobar")).await.unwrap();
    }
    insert.end().await.unwrap();

    let mut cursor = client
        .query("SELECT * FROM test")
        .fetch::<SimpleRow>()
        .unwrap();

    let mut received = cursor.received_bytes();
    let mut decoded = cursor.decoded_bytes();
    assert_eq!(received, 0);
    assert_eq!(decoded, 0);

    while cursor.next().await.unwrap().is_some() {
        assert!(cursor.received_bytes() >= received);
        assert!(cursor.decoded_bytes() >= decoded);
        received = cursor.received_bytes();
        decoded = cursor.decoded_bytes();
    }

    assert_eq!(decoded, 15000 + 23); // 23 extra bytes for the RBWNAT header.
    assert_eq!(cursor.received_bytes(), dbg!(received));
    assert_eq!(cursor.decoded_bytes(), dbg!(decoded));
    assert_eq!(
        (decoded as f64 / received as f64 * 10.).round() / 10.,
        expected_ratio
    );
}

#[tokio::test]
async fn none() {
    let client = prepare_database!().with_compression(Compression::None);
    check(client, 1.0).await;
}

#[cfg(feature = "lz4")]
#[tokio::test]
async fn lz4() {
    let client = prepare_database!().with_compression(Compression::Lz4);
    check(client, 3.7).await;
}
