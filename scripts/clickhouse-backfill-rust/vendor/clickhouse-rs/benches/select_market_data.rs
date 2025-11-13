use crate::common_select::{
    BenchmarkRow, WithAccessType, WithId, do_select_bench, print_header, print_results,
};
use clickhouse::{Client, Compression, Row};
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

mod common_select;

#[derive(Row, Serialize, Deserialize)]
struct L2Update {
    instrument_id: u32,
    received_time: Timestamp,
    exchange_time: Option<Timestamp>,
    sequence_no: Option<u64>,
    trace_id: TraceId,
    side: Side,
    price: f64,
    amount: f64,
    is_eot: bool,
}

#[derive(Serialize, Deserialize)]
struct Timestamp(i64);

#[derive(Serialize, Deserialize)]
struct TraceId(u64);

#[derive(Serialize_repr, Deserialize_repr)]
#[repr(i8)]
enum Side {
    Bid = 0,
    Ask = 1,
}

impl_benchmark_row_no_access_type!(L2Update, instrument_id);

async fn prepare_data() {
    let client = Client::default().with_url("http://localhost:8123");

    client
        .query(
            r#"
                CREATE TABLE IF NOT EXISTS l2_book_log
                (
                    `instrument_id` UInt32                      CODEC(T64,         Default),
                    `received_time` DateTime64(9)               CODEC(DoubleDelta, Default),
                    `exchange_time` Nullable(DateTime64(9))     CODEC(DoubleDelta, Default),
                    `sequence_no`   Nullable(UInt64)            CODEC(DoubleDelta, Default),
                    `trace_id`      UInt64                      CODEC(DoubleDelta, Default),
                    `side`          Enum8('Bid' = 0, 'Ask' = 1),
                    `price`         Float64,
                    `amount`        Float64,
                    `is_eot`        Bool
                )
                ENGINE = MergeTree
                PRIMARY KEY (instrument_id, received_time)
            "#,
        )
        .execute()
        .await
        .unwrap();

    let len = client
        .query("SELECT count() FROM l2_book_log")
        .fetch_one::<usize>()
        .await
        .unwrap();

    if len > 0 {
        return;
    }

    let mut insert = client.insert::<L2Update>("l2_book_log").await.unwrap();

    for i in 0..10_000_000 {
        insert
            .write(&L2Update {
                instrument_id: 42,
                received_time: Timestamp(1749888780458000000 + 11_111 * i as i64),
                exchange_time: Some(Timestamp(1749888780458000000 + 10_101 * i as i64)),
                trace_id: TraceId(1749888780458000000 + i),
                sequence_no: Some(i),
                side: if i % 10 >= 5 { Side::Bid } else { Side::Ask },
                price: 54321. + 100. * (i as f64).sin(),
                amount: 100. + 100. * (i as f64).sin(),
                is_eot: i % 10 == 0,
            })
            .await
            .unwrap();
    }

    insert.end().await.unwrap();
}

async fn bench(compression: Compression, validation: bool) {
    let stats =
        do_select_bench::<L2Update>("SELECT * FROM l2_book_log", compression, validation).await;
    assert_eq!(stats.result, 420000000);
    print_results::<L2Update>(&stats, compression, validation);
}

#[tokio::main]
async fn main() {
    prepare_data().await;
    print_header(None);
    #[cfg(feature = "lz4")]
    bench(Compression::Lz4, false).await;
    #[cfg(feature = "lz4")]
    bench(Compression::Lz4, true).await;
    bench(Compression::None, false).await;
    bench(Compression::None, true).await;
}
