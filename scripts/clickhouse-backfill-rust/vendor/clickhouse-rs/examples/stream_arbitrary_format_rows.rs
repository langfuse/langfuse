use tokio::io::AsyncBufReadExt;

use clickhouse::Client;

/// An example of streaming raw data in an arbitrary format leveraging the
/// [`AsyncBufReadExt`] helpers. In this case, the format is `JSONEachRow`.
/// Incoming data is then split into lines, and each line is deserialized into
/// `serde_json::Value`, a dynamic representation of JSON values.
///
/// Similarly, it can be used with other formats such as CSV, TSV, and others
/// that produce each row on a new line; the only difference will be in how the
/// data is parsed. See also: https://clickhouse.com/docs/en/interfaces/formats
///
/// Note: `lines()` produces a new `String` for each line, so it's not the
/// most performant way to interate over lines.
#[tokio::main]
async fn main() {
    let client = Client::default().with_url("http://localhost:8123");
    let mut lines = client
        .query(
            "SELECT number, hex(randomPrintableASCII(20)) AS hex_str
             FROM system.numbers
             LIMIT 100",
        )
        .fetch_bytes("JSONEachRow")
        .unwrap()
        .lines();

    while let Some(line) = lines.next_line().await.unwrap() {
        let value: serde_json::Value = serde_json::de::from_str(&line).unwrap();
        println!("JSONEachRow value: {value}");
    }
}
