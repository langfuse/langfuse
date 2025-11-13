use std::time::Duration;

use hyper_util::client::legacy::Client as HyperClient;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;

use clickhouse::{Client, error::Result};

#[tokio::main]
async fn main() -> Result<()> {
    let connector = HttpConnector::new(); // or HttpsConnectorBuilder
    let hyper_client = HyperClient::builder(TokioExecutor::new())
        // For how long keep a particular idle socket alive on the client side (in milliseconds).
        // It is supposed to be a fair bit less that the ClickHouse server KeepAlive timeout,
        // which was by default 3 seconds for pre-23.11 versions, and 10 seconds after that.
        .pool_idle_timeout(Duration::from_millis(2_500))
        // Sets the maximum idle Keep-Alive connections allowed in the pool.
        .pool_max_idle_per_host(4)
        .build(connector);

    let client = Client::with_http_client(hyper_client).with_url("http://localhost:8123");

    let numbers = client
        .query("SELECT number FROM system.numbers LIMIT 1")
        .fetch_all::<u64>()
        .await?;
    println!("Numbers: {numbers:?}");

    Ok(())
}
