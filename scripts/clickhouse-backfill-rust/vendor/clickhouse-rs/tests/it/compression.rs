use clickhouse::{Client, Compression};

use crate::{SimpleRow, create_simple_table};

async fn check(client: Client) {
    create_simple_table(&client, "test").await;

    let mut insert = client.insert::<SimpleRow>("test").await.unwrap();
    for i in 0..200_000 {
        insert.write(&SimpleRow::new(i, "foo")).await.unwrap();
    }
    insert.end().await.unwrap();

    // Check data.

    let (sum_no, sum_len) = client
        .query("SELECT sum(id), sum(length(data)) FROM test")
        .fetch_one::<(u64, u64)>()
        .await
        .unwrap();

    assert_eq!(sum_no, 19_999_900_000);
    assert_eq!(sum_len, 600_000);
}

#[tokio::test]
async fn none() {
    let client = prepare_database!().with_compression(Compression::None);
    check(client).await;
}

#[cfg(feature = "lz4")]
#[tokio::test]
async fn lz4() {
    let client = prepare_database!().with_compression(Compression::Lz4);
    check(client).await;
}
