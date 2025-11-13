use serde::{Deserialize, Serialize};

use clickhouse::{Client, Row, error::Result, sql};

#[derive(Debug, Row, Serialize, Deserialize)]
struct MyRow<'a> {
    no: u32,
    name: &'a str,
}

#[derive(Debug, Row, Serialize, Deserialize)]
struct MyRowOwned {
    no: u32,
    name: String,
}

async fn ddl(client: &Client) -> Result<()> {
    client.query("DROP TABLE IF EXISTS some").execute().await?;
    client
        .query(
            "
            CREATE TABLE some(no UInt32, name LowCardinality(String))
            ENGINE = MergeTree
            ORDER BY no
        ",
        )
        .execute()
        .await
}

async fn insert(client: &Client) -> Result<()> {
    let mut insert = client.insert::<MyRow<'_>>("some").await?;
    for i in 0..1000 {
        insert.write(&MyRow { no: i, name: "foo" }).await?;
    }

    insert.end().await
}

// This is a very basic example of using the `inserter` feature.
// See `inserter.rs` for real-world patterns.
#[cfg(feature = "inserter")]
async fn inserter(client: &Client) -> Result<()> {
    let mut inserter = client
        .inserter::<MyRow<'_>>("some")
        .with_max_rows(100_000)
        .with_period(Some(std::time::Duration::from_secs(15)));

    for i in 0..1000 {
        inserter.write(&MyRow { no: i, name: "foo" }).await?;
        inserter.commit().await?;
    }

    inserter.end().await?;
    Ok(())
}

async fn fetch(client: &Client) -> Result<()> {
    let mut cursor = client
        .query("SELECT ?fields FROM some WHERE name = ? AND no BETWEEN ? AND ?")
        .bind("foo")
        .bind(500)
        .bind(504)
        .fetch::<MyRow<'_>>()?;

    while let Some(row) = cursor.next().await? {
        println!("{row:?}");
    }

    Ok(())
}

#[cfg(feature = "futures03")]
async fn fetch_stream(client: &Client) -> Result<()> {
    use futures_util::TryStreamExt;

    client
        .query("SELECT ?fields FROM some WHERE name = ? AND no BETWEEN ? AND ?")
        .bind("foo")
        .bind(500)
        .bind(504)
        .fetch::<MyRowOwned>()?
        .try_for_each(|row| {
            println!("{row:?}");
            futures_util::future::ready(Ok(()))
        })
        .await?;

    Ok(())
}

async fn fetch_all(client: &Client) -> Result<()> {
    let vec = client
        .query("SELECT ?fields FROM ? WHERE no BETWEEN ? AND ?")
        .bind(sql::Identifier("some"))
        .bind(500)
        .bind(504)
        .fetch_all::<MyRowOwned>()
        .await?;

    println!("{vec:?}");

    Ok(())
}

async fn delete(client: &Client) -> Result<()> {
    client
        .clone()
        .with_option("mutations_sync", "1")
        .query("ALTER TABLE some DELETE WHERE no >= ?")
        .bind(500)
        .execute()
        .await?;

    Ok(())
}

async fn select_count(client: &Client) -> Result<()> {
    let count = client
        .query("SELECT count() FROM some")
        .fetch_one::<u64>()
        .await?;

    println!("count() = {count}");

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let client = Client::default().with_url("http://localhost:8123");

    ddl(&client).await?;
    insert(&client).await?;
    #[cfg(feature = "inserter")]
    inserter(&client).await?;
    select_count(&client).await?;
    fetch(&client).await?;
    #[cfg(feature = "futures03")]
    {
        fetch_stream(&client).await?;
    }
    fetch_all(&client).await?;
    delete(&client).await?;
    select_count(&client).await?;

    Ok(())
}
