use clickhouse::{Client, error::Result};

/// An example of using server-side query parameters.
///
/// In most cases, this is the preferred method over the client-side binding
/// via [`clickhouse::query::Query::bind`].
///
/// See also: https://clickhouse.com/docs/sql-reference/syntax#defining-and-using-query-parameters

#[tokio::main]
async fn main() -> Result<()> {
    let client = Client::default().with_url("http://localhost:8123");

    let result = client
        .query(
            "
                SELECT {tbl:Identifier}.{col:Identifier}
                FROM {db:Identifier}.{tbl:Identifier}
                WHERE {col:Identifier} < {val:UInt64}
            ",
        )
        .param("db", "system")
        .param("tbl", "numbers")
        .param("col", "number")
        .param("val", 3u64)
        .fetch_all::<u64>()
        .await?;

    println!("Parametrized query output: {:?}", result);
    Ok(())
}
