#![cfg(feature = "time")]

use crate::common_select::{
    BenchmarkRow, WithAccessType, WithId, do_select_bench, print_header, print_results,
};
use clickhouse::{Client, Compression, Row};
use serde::Deserialize;
use serde_repr::Deserialize_repr;
use time::OffsetDateTime;

mod common_select;

#[derive(Debug, Clone, Deserialize_repr)]
#[repr(i8)]
pub enum PaymentType {
    CSH = 1,
    CRE = 2,
    NOC = 3,
    DIS = 4,
    UNK = 5,
}

/// Uses just `visit_seq` since the order of the fields matches the database schema.
#[derive(Row, Deserialize)]
#[allow(dead_code)]
struct TripSmallSeqAccess {
    trip_id: u32,
    #[serde(with = "clickhouse::serde::time::datetime")]
    pickup_datetime: OffsetDateTime,
    #[serde(with = "clickhouse::serde::time::datetime")]
    dropoff_datetime: OffsetDateTime,
    pickup_longitude: Option<f64>,
    pickup_latitude: Option<f64>,
    dropoff_longitude: Option<f64>,
    dropoff_latitude: Option<f64>,
    passenger_count: u8,
    trip_distance: f32,
    fare_amount: f32,
    extra: f32,
    tip_amount: f32,
    tolls_amount: f32,
    total_amount: f32,
    payment_type: PaymentType,
    pickup_ntaname: String,
    dropoff_ntaname: String,
}

/// Uses `visit_map` to deserialize instead of `visit_seq`,
/// since the fields definition is correct, but the order is wrong.
#[derive(Row, Deserialize)]
#[allow(dead_code)]
struct TripSmallMapAccess {
    pickup_ntaname: String,
    dropoff_ntaname: String,
    trip_id: u32,
    passenger_count: u8,
    trip_distance: f32,
    fare_amount: f32,
    extra: f32,
    tip_amount: f32,
    tolls_amount: f32,
    total_amount: f32,
    payment_type: PaymentType,
    #[serde(with = "clickhouse::serde::time::datetime")]
    pickup_datetime: OffsetDateTime,
    #[serde(with = "clickhouse::serde::time::datetime")]
    dropoff_datetime: OffsetDateTime,
    pickup_longitude: Option<f64>,
    pickup_latitude: Option<f64>,
    dropoff_longitude: Option<f64>,
    dropoff_latitude: Option<f64>,
}

impl_benchmark_row!(TripSmallSeqAccess, trip_id, "seq");
impl_benchmark_row!(TripSmallMapAccess, trip_id, "map");

// See https://clickhouse.com/docs/getting-started/example-datasets/nyc-taxi
async fn prepare_data() {
    let client = Client::default().with_url("http://localhost:8123");

    client
        .query("CREATE DATABASE IF NOT EXISTS nyc_taxi")
        .execute()
        .await
        .unwrap();
    client
        .query(
            r#"
            CREATE TABLE IF NOT EXISTS nyc_taxi.trips_small (
                trip_id             UInt32,
                pickup_datetime     DateTime,
                dropoff_datetime    DateTime,
                pickup_longitude    Nullable(Float64),
                pickup_latitude     Nullable(Float64),
                dropoff_longitude   Nullable(Float64),
                dropoff_latitude    Nullable(Float64),
                passenger_count     UInt8,
                trip_distance       Float32,
                fare_amount         Float32,
                extra               Float32,
                tip_amount          Float32,
                tolls_amount        Float32,
                total_amount        Float32,
                payment_type        Enum('CSH' = 1, 'CRE' = 2, 'NOC' = 3, 'DIS' = 4, 'UNK' = 5),
                pickup_ntaname      LowCardinality(String),
                dropoff_ntaname     LowCardinality(String)
            )
            ENGINE = MergeTree
            PRIMARY KEY (pickup_datetime, dropoff_datetime)
            "#,
        )
        .execute()
        .await
        .unwrap();

    let len = client
        .query("SELECT count() FROM nyc_taxi.trips_small")
        .fetch_one::<usize>()
        .await
        .unwrap();

    if len == 0 {
        client
        .query(
            "
            INSERT INTO nyc_taxi.trips_small
            SELECT
                trip_id,
                pickup_datetime,
                dropoff_datetime,
                pickup_longitude,
                pickup_latitude,
                dropoff_longitude,
                dropoff_latitude,
                passenger_count,
                trip_distance,
                fare_amount,
                extra,
                tip_amount,
                tolls_amount,
                total_amount,
                payment_type,
                pickup_ntaname,
                dropoff_ntaname
            FROM gcs(
                'https://storage.googleapis.com/clickhouse-public-datasets/nyc-taxi/trips_{0..2}.gz',
                'TabSeparatedWithNames'
            );
            ",
        )
        .execute()
        .await
        .unwrap();
    }
}

async fn bench<T: BenchmarkRow>(compression: Compression, validation: bool) {
    let stats = do_select_bench::<T>(
        "SELECT * FROM nyc_taxi.trips_small ORDER BY trip_id DESC",
        compression,
        validation,
    )
    .await;
    assert_eq!(stats.result, 3630387815532582);
    print_results::<T>(&stats, compression, validation);
}

#[tokio::main]
async fn main() {
    prepare_data().await;
    print_header(Some("  access"));
    bench::<TripSmallSeqAccess>(Compression::None, false).await;
    bench::<TripSmallSeqAccess>(Compression::None, true).await;
    bench::<TripSmallMapAccess>(Compression::None, true).await;
    #[cfg(feature = "lz4")]
    {
        bench::<TripSmallSeqAccess>(Compression::Lz4, false).await;
        bench::<TripSmallSeqAccess>(Compression::Lz4, true).await;
        bench::<TripSmallMapAccess>(Compression::Lz4, true).await;
    }
}
