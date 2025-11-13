use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::{
    sync::mpsc::{self, Receiver, error::TryRecvError},
    time::timeout,
};

use clickhouse::{Client, Row, error::Result, sql::Identifier};

const TABLE_NAME: &str = "chrs_inserter";

#[derive(Debug, Row, Serialize, Deserialize)]
struct MyRow {
    no: u32,
}

// Pattern 1: dense streams
// ------------------------
// This pattern is useful when the stream is dense, i.e. with no/small pauses
// between rows. For instance, when reading from a file or another database.
// In other words, this pattern is applicable for ETL-like tasks.
async fn dense(client: &Client, mut rx: Receiver<u32>) -> Result<()> {
    let mut inserter = client
        .inserter::<MyRow>(TABLE_NAME)
        // We limit the number of rows to be inserted in a single `INSERT` statement.
        // We use small value (100) for the example only.
        // See documentation of `with_max_rows` for details.
        .with_max_rows(100)
        // You can also use other limits. For instance, limit by the size.
        // First reached condition will end the current `INSERT`.
        .with_max_bytes(1_048_576);

    while let Some(no) = rx.recv().await {
        inserter.write(&MyRow { no }).await?;
        inserter.commit().await?;
    }

    inserter.end().await?;
    Ok(())
}

// Pattern 2: sparse streams
// -------------------------
// This pattern is useful when the stream is sparse, i.e. with pauses between
// rows. For instance, when streaming a real-time stream of events into CH.
// Some rows are arriving one by one with delay, some batched.
async fn sparse(client: &Client, mut rx: Receiver<u32>) -> Result<()> {
    let mut inserter = client
        .inserter::<MyRow>(TABLE_NAME)
        // Slice the stream into chunks (one `INSERT` per chunk) by time.
        // See documentation of `with_period` for details.
        .with_period(Some(Duration::from_millis(100)))
        // If you have a lot of parallel inserters (e.g. on multiple nodes),
        // it's reasonable to add some bias to the period to spread the load.
        .with_period_bias(0.1)
        // We also can use other limits. This is useful when the stream is
        // recovered after a long time of inactivity (e.g. restart of service or CH).
        .with_max_rows(500_000);

    loop {
        let no = match rx.try_recv() {
            Ok(event) => event,
            Err(TryRecvError::Empty) => {
                // If there is no available events, we should wait for the next one.
                // However, we don't know when the next event will arrive.
                // So, we should wait no longer than the left time of the current period.
                let time_left = inserter.time_left().expect("with_period is set");

                // Note: `rx.recv()` must be cancel safe for your channel.
                // This is true for popular `tokio`, `futures-channel`, `flume` channels.
                match timeout(time_left, rx.recv()).await {
                    Ok(Some(event)) => event,
                    // The stream is closed.
                    Ok(None) => break,
                    // Timeout
                    Err(_) => {
                        // If the period is over, we allow the inserter to end the current `INSERT`
                        // statement. If no `INSERT` is in progress, this call is no-op.
                        inserter.commit().await?;
                        continue;
                    }
                }
            }
            Err(TryRecvError::Disconnected) => break,
        };

        inserter.write(&MyRow { no }).await?;
        inserter.commit().await?;

        // You can use result of `commit()` to get the number of rows inserted.
        // It's useful not only for statistics but also to implement
        // at-least-once delivery by sending this info back to the sender,
        // where all unacknowledged events should be stored in this case.
    }

    inserter.end().await?;
    Ok(())
}

fn spawn_data_generator(n: u32, sparse: bool) -> Receiver<u32> {
    let (tx, rx) = mpsc::channel(1000);

    tokio::spawn(async move {
        for no in 0..n {
            if sparse {
                let delay_ms = if no % 100 == 0 { 20 } else { 2 };
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }

            tx.send(no).await.unwrap();
        }
    });

    rx
}

async fn fetch_batches(client: &Client) -> Result<Vec<(String, u64)>> {
    client
        .query(
            "SELECT toString(insertion_time), count()
             FROM ?
             GROUP BY insertion_time
             ORDER BY insertion_time",
        )
        .bind(Identifier(TABLE_NAME))
        .fetch_all::<(String, u64)>()
        .await
}

#[tokio::main]
async fn main() -> Result<()> {
    let client = Client::default().with_url("http://localhost:8123");

    client
        .query(
            "CREATE OR REPLACE TABLE ? (
                 no UInt32,
                 insertion_time DateTime64(6) DEFAULT now64(6)
             )
             ENGINE = MergeTree
             ORDER BY no",
        )
        .bind(Identifier(TABLE_NAME))
        .execute()
        .await?;

    println!("Pattern 1: dense streams");
    let rx = spawn_data_generator(1000, false);
    dense(&client, rx).await?;

    // Prints 10 batches with 100 rows in each.
    for (insertion_time, count) in fetch_batches(&client).await? {
        println!("{insertion_time}: {count} rows");
    }

    client
        .query("TRUNCATE TABLE ?")
        .bind(Identifier(TABLE_NAME))
        .execute()
        .await?;

    println!("\nPattern 2: sparse streams");
    let rx = spawn_data_generator(1000, true);
    sparse(&client, rx).await?;

    // Prints batches every 100±10ms.
    for (insertion_time, count) in fetch_batches(&client).await? {
        println!("{insertion_time}: {count} rows");
    }

    Ok(())
}
