use clickhouse::{Client, query::BytesCursor};
use std::time::Instant;
use tokio::{fs::File, io::AsyncWriteExt};

// Examples of streaming the result of a query in an arbitrary format into a
// file. In this case, `CSVWithNamesAndTypes` format is used.
// Check also other formats in https://clickhouse.com/docs/en/interfaces/formats.
//
// Note: there is no need to wrap `File` into `BufWriter` because `BytesCursor`
// is buffered internally already and produces chunks of data.

const NUMBERS: u32 = 100_000;

fn query(numbers: u32) -> BytesCursor {
    let client = Client::default().with_url("http://localhost:8123");

    client
        .query(
            "SELECT number, hex(randomPrintableASCII(20)) AS hex_str
             FROM system.numbers
             LIMIT {limit: Int32}",
        )
        .param("limit", numbers)
        .fetch_bytes("CSVWithNamesAndTypes")
        .unwrap()
}

// Pattern 1: use the `tokio::io::copy_buf` helper.
//
// It shows integration with `tokio::io::AsyncBufWriteExt` trait.
async fn tokio_copy_buf(filename: &str) {
    let mut cursor = query(NUMBERS);
    let mut file = File::create(filename).await.unwrap();
    tokio::io::copy_buf(&mut cursor, &mut file).await.unwrap();
}

// Pattern 2: use `BytesCursor::next()`.
async fn cursor_next(filename: &str) {
    let mut cursor = query(NUMBERS);
    let mut file = File::create(filename).await.unwrap();

    while let Some(bytes) = cursor.next().await.unwrap() {
        file.write_all(&bytes).await.unwrap();
        println!("chunk of {}B written to {filename}", bytes.len());
    }
}

// Pattern 3: use the `futures_util::(Try)StreamExt` traits.
#[cfg(feature = "futures03")]
async fn futures03_stream(filename: &str) {
    use futures_util::TryStreamExt;

    let mut cursor = query(NUMBERS);
    let mut file = File::create(filename).await.unwrap();

    while let Some(bytes) = cursor.try_next().await.unwrap() {
        file.write_all(&bytes).await.unwrap();
        println!("chunk of {}B written to {filename}", bytes.len());
    }
}

#[tokio::main]
async fn main() {
    let start = Instant::now();
    tokio_copy_buf("output-1.csv").await;
    println!("written to output-1.csv in {:?}", start.elapsed());

    let start = Instant::now();
    cursor_next("output-2.csv").await;
    println!("written to output-2.csv in {:?}", start.elapsed());

    #[cfg(feature = "futures03")]
    {
        let start = Instant::now();
        futures03_stream("output-3.csv").await;
        println!("written to output-3.csv in {:?}", start.elapsed());
    }
}
