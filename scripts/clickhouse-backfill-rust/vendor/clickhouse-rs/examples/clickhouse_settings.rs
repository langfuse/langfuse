use clickhouse::{Client, error::Result};

/// Besides [`Client::query`], it works similarly with [`Client::insert`] and [`Client::inserter`].
#[tokio::main]
async fn main() -> Result<()> {
    let client = Client::default()
        .with_url("http://localhost:8123")
        // This setting is global and will be applied to all queries.
        .with_option("limit", "100");

    let numbers = client
        .query("SELECT number FROM system.numbers")
        // This setting will be applied to this particular query only;
        // it will override the global client setting.
        .with_option("limit", "3")
        .fetch_all::<u64>()
        .await?;

    // note that it prints the first 3 numbers only (because of the setting override)
    println!("{numbers:?}");

    Ok(())
}
