#![cfg(feature = "time")]

use std::ops::Range;

use rand::Rng;
use serde::{Deserialize, Serialize};
use time::{Date, OffsetDateTime, macros::datetime};

use clickhouse::Row;

#[tokio::test]
async fn datetime() {
    let client = prepare_database!();

    #[derive(Debug, PartialEq, Eq, Serialize, Deserialize, Row)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::time::datetime")]
        dt: OffsetDateTime,
        #[serde(with = "clickhouse::serde::time::datetime::option")]
        dt_opt: Option<OffsetDateTime>,
        #[serde(with = "clickhouse::serde::time::datetime64::secs")]
        dt64s: OffsetDateTime,
        #[serde(with = "clickhouse::serde::time::datetime64::secs::option")]
        dt64s_opt: Option<OffsetDateTime>,
        #[serde(with = "clickhouse::serde::time::datetime64::millis")]
        dt64ms: OffsetDateTime,
        #[serde(with = "clickhouse::serde::time::datetime64::millis::option")]
        dt64ms_opt: Option<OffsetDateTime>,
        #[serde(with = "clickhouse::serde::time::datetime64::micros")]
        dt64us: OffsetDateTime,
        #[serde(with = "clickhouse::serde::time::datetime64::micros::option")]
        dt64us_opt: Option<OffsetDateTime>,
        #[serde(with = "clickhouse::serde::time::datetime64::nanos")]
        dt64ns: OffsetDateTime,
        #[serde(with = "clickhouse::serde::time::datetime64::nanos::option")]
        dt64ns_opt: Option<OffsetDateTime>,
    }

    #[derive(Debug, Deserialize, Row)]
    struct MyRowStr {
        dt: String,
        dt64s: String,
        dt64ms: String,
        dt64us: String,
        dt64ns: String,
    }

    client
        .query(
            "
            CREATE TABLE test(
                dt          DateTime,
                dt_opt      Nullable(DateTime),
                dt64s       DateTime64(0),
                dt64s_opt   Nullable(DateTime64(0)),
                dt64ms      DateTime64(3),
                dt64ms_opt  Nullable(DateTime64(3)),
                dt64us      DateTime64(6),
                dt64us_opt  Nullable(DateTime64(6)),
                dt64ns      DateTime64(9),
                dt64ns_opt  Nullable(DateTime64(9))
            )
            ENGINE = MergeTree ORDER BY dt
        ",
        )
        .execute()
        .await
        .unwrap();

    let original_row = MyRow {
        dt: datetime!(2022-11-13 15:27:42 UTC),
        dt_opt: Some(datetime!(2022-11-13 15:27:42 UTC)),
        dt64s: datetime!(2022-11-13 15:27:42 UTC),
        dt64s_opt: Some(datetime!(2022-11-13 15:27:42 UTC)),
        dt64ms: datetime!(2022-11-13 15:27:42.123 UTC),
        dt64ms_opt: Some(datetime!(2022-11-13 15:27:42.123 UTC)),
        dt64us: datetime!(2022-11-13 15:27:42.123456 UTC),
        dt64us_opt: Some(datetime!(2022-11-13 15:27:42.123456 UTC)),
        dt64ns: datetime!(2022-11-13 15:27:42.123456789 UTC),
        dt64ns_opt: Some(datetime!(2022-11-13 15:27:42.123456789 UTC)),
    };

    let mut insert = client.insert::<MyRow>("test").await.unwrap();
    insert.write(&original_row).await.unwrap();
    insert.end().await.unwrap();

    let row = client
        .query("SELECT ?fields FROM test")
        .fetch_one::<MyRow>()
        .await
        .unwrap();

    let row_str = client
        .query(
            "
            SELECT toString(dt)     AS dt,
                   toString(dt64s)  AS dt64s,
                   toString(dt64ms) AS dt64ms,
                   toString(dt64us) AS dt64us,
                   toString(dt64ns) AS dt64ns
              FROM test
        ",
        )
        .fetch_one::<MyRowStr>()
        .await
        .unwrap();

    assert_eq!(row, original_row);
    assert_eq!(row_str.dt, &original_row.dt.to_string()[..19]);
    assert_eq!(row_str.dt64s, &original_row.dt64s.to_string()[..19]);
    assert_eq!(row_str.dt64ms, &original_row.dt64ms.to_string()[..23]);
    assert_eq!(row_str.dt64us, &original_row.dt64us.to_string()[..26]);
    assert_eq!(row_str.dt64ns, &original_row.dt64ns.to_string()[..29]);
}

#[tokio::test]
async fn date() {
    let client = prepare_database!();

    #[derive(Debug, Serialize, Deserialize, Row)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::time::date")]
        date: Date,
        #[serde(with = "clickhouse::serde::time::date::option")]
        date_opt: Option<Date>,
    }

    client
        .query(
            "
            CREATE TABLE test(
                date        Date,
                date_opt    Nullable(Date)
            ) ENGINE = MergeTree ORDER BY date
        ",
        )
        .execute()
        .await
        .unwrap();

    let mut insert = client.insert::<MyRow>("test").await.unwrap();

    let dates = generate_dates(1970..2149, 100);
    for &date in &dates {
        let original_row = MyRow {
            date,
            date_opt: Some(date),
        };

        insert.write(&original_row).await.unwrap();
    }
    insert.end().await.unwrap();

    let actual = client
        .query("SELECT ?fields, toString(date) FROM test ORDER BY date")
        .fetch_all::<(MyRow, String)>()
        .await
        .unwrap();

    assert_eq!(actual.len(), dates.len());

    for ((row, date_str), expected) in actual.iter().zip(dates) {
        assert_eq!(row.date, expected);
        assert_eq!(row.date_opt, Some(expected));
        assert_eq!(date_str, &expected.to_string());
    }
}

#[tokio::test]
async fn date32() {
    let client = prepare_database!();

    #[derive(Debug, Serialize, Deserialize, Row)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::time::date32")]
        date: Date,
        #[serde(with = "clickhouse::serde::time::date32::option")]
        date_opt: Option<Date>,
    }

    client
        .query(
            "
            CREATE TABLE test(
                date        Date32,
                date_opt    Nullable(Date32)
            ) ENGINE = MergeTree ORDER BY date
        ",
        )
        .execute()
        .await
        .unwrap();

    let mut insert = client.insert::<MyRow>("test").await.unwrap();

    let dates = generate_dates(1925..2283, 100); // TODO: 1900..=2299 for newer versions.
    for &date in &dates {
        let original_row = MyRow {
            date,
            date_opt: Some(date),
        };

        insert.write(&original_row).await.unwrap();
    }
    insert.end().await.unwrap();

    let actual = client
        .query("SELECT ?fields, toString(date) FROM test ORDER BY date")
        .fetch_all::<(MyRow, String)>()
        .await
        .unwrap();

    assert_eq!(actual.len(), dates.len());

    for ((row, date_str), expected) in actual.iter().zip(dates) {
        assert_eq!(row.date, expected);
        assert_eq!(row.date_opt, Some(expected));
        assert_eq!(date_str, &expected.to_string());
    }
}

fn generate_dates(years: Range<i32>, count: usize) -> Vec<Date> {
    let mut rng = rand::rng();
    let mut dates: Vec<_> = (0..count)
        .map(|_| {
            let year = rng.random_range(years.clone());
            let month = rng.random_range(1..=12);
            let day = rng.random_range(1..=28); // Safe for all months
            Date::from_calendar_date(year, time::Month::try_from(month).unwrap(), day as u8)
                .unwrap()
        })
        .collect();

    dates.sort_unstable();
    dates
}

#[tokio::test]
async fn time_roundtrip() {
    let client = prepare_database!();

    #[derive(Debug, PartialEq, Serialize, Deserialize, Row)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::time::time")]
        t0: time::Duration,
        #[serde(with = "clickhouse::serde::time::time::option")]
        t1: Option<time::Duration>,
    }

    client
        .query(
            r#"
            CREATE TABLE test_time (
                t0  Time,
                t1  Nullable(Time)
            ) ENGINE = MergeTree ORDER BY tuple()
            SETTINGS enable_time_time64_type = 1;
            "#,
        )
        .execute()
        .await
        .unwrap();

    let positive_value = time::Duration::seconds(12 * 3600 + 34 * 60 + 56); // 12:34:56
    let row = MyRow {
        t0: positive_value,
        t1: Some(positive_value),
    };

    let mut insert = client.insert::<MyRow>("test_time").await.unwrap();
    insert.write(&row).await.unwrap();
    insert.end().await.unwrap();

    let fetched_rows: Vec<MyRow> = client
        .query("SELECT ?fields FROM test_time")
        .fetch_all()
        .await
        .unwrap();

    assert_eq!(fetched_rows.len(), 1);
    assert_eq!(fetched_rows[0], row);
}

#[tokio::test]
async fn time_negative_roundtrip() {
    let client = prepare_database!();

    #[derive(Debug, PartialEq, Serialize, Deserialize, Row)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::time::time")]
        t0: time::Duration,
        #[serde(with = "clickhouse::serde::time::time::option")]
        t1: Option<time::Duration>,
    }

    client
        .query(
            r#"
            CREATE TABLE test_time_negative (
                t0  Time,
                t1  Nullable(Time)
            ) ENGINE = MergeTree ORDER BY tuple()
            SETTINGS enable_time_time64_type = 1;
            "#,
        )
        .execute()
        .await
        .unwrap();

    let negative_value = time::Duration::seconds(-2 * 3600 - 15 * 60 - 30); // -02:15:30
    let row = MyRow {
        t0: negative_value,
        t1: Some(negative_value),
    };

    let mut insert = client.insert::<MyRow>("test_time_negative").await.unwrap();
    insert.write(&row).await.unwrap();
    insert.end().await.unwrap();

    let fetched_rows: Vec<MyRow> = client
        .query("SELECT ?fields FROM test_time_negative")
        .fetch_all()
        .await
        .unwrap();

    assert_eq!(fetched_rows.len(), 1);
    assert_eq!(fetched_rows[0], row);
}

#[tokio::test]
async fn time64_roundtrip() {
    let client = prepare_database!();

    client
        .query(
            r#"
            CREATE TABLE test_time64 (
                t0      Time64(0),
                t0_opt  Nullable(Time64(0)),
                t3      Time64(3),
                t6      Time64(6),
                t9      Time64(9)
            ) ENGINE = MergeTree
            ORDER BY tuple()
            SETTINGS enable_time_time64_type = 1;
            "#,
        )
        .execute()
        .await
        .unwrap();

    #[derive(Debug, PartialEq, Serialize, Deserialize, Row)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::time::time64::secs")]
        t0: time::Duration,
        #[serde(with = "clickhouse::serde::time::time64::secs::option")]
        t0_opt: Option<time::Duration>,
        #[serde(with = "clickhouse::serde::time::time64::millis")]
        t3: time::Duration,
        #[serde(with = "clickhouse::serde::time::time64::micros")]
        t6: time::Duration,
        #[serde(with = "clickhouse::serde::time::time64::nanos")]
        t9: time::Duration,
    }

    let base_seconds = 12 * 3600 + 34 * 60 + 56; // 45296 seconds
    let row = MyRow {
        t0: time::Duration::seconds(base_seconds),
        t0_opt: Some(time::Duration::seconds(base_seconds)),
        t3: time::Duration::milliseconds(base_seconds * 1000 + 789),
        t6: time::Duration::microseconds(base_seconds * 1_000_000 + 789_123),
        t9: time::Duration::nanoseconds(base_seconds * 1_000_000_000 + 789_123_456),
    };

    let mut insert = client.insert::<MyRow>("test_time64").await.unwrap();
    insert.write(&row).await.unwrap();
    insert.end().await.unwrap();

    let fetched_rows: Vec<MyRow> = client
        .query("SELECT ?fields FROM test_time64")
        .fetch_all()
        .await
        .unwrap();

    assert_eq!(fetched_rows.len(), 1);
    assert_eq!(fetched_rows[0], row);
}

#[tokio::test]
async fn time64_negative_roundtrip() {
    let client = prepare_database!();

    client
        .query(
            r#"
            CREATE TABLE test_time64_negative (
                t0      Time64(0),
                t0_opt  Nullable(Time64(0)),
                t3      Time64(3),
                t6      Time64(6),
                t9      Time64(9)
            ) ENGINE = MergeTree
            ORDER BY tuple()
            SETTINGS enable_time_time64_type = 1;
            "#,
        )
        .execute()
        .await
        .unwrap();

    #[derive(Debug, PartialEq, Serialize, Deserialize, Row)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::time::time64::secs")]
        t0: time::Duration,
        #[serde(with = "clickhouse::serde::time::time64::secs::option")]
        t0_opt: Option<time::Duration>,
        #[serde(with = "clickhouse::serde::time::time64::millis")]
        t3: time::Duration,
        #[serde(with = "clickhouse::serde::time::time64::micros")]
        t6: time::Duration,
        #[serde(with = "clickhouse::serde::time::time64::nanos")]
        t9: time::Duration,
    }

    let neg_base_seconds = -5 * 3600 - 15 * 60 - 30; // -18930 seconds
    let row = MyRow {
        t0: time::Duration::seconds(neg_base_seconds),
        t0_opt: Some(time::Duration::seconds(neg_base_seconds)),
        t3: time::Duration::milliseconds(neg_base_seconds * 1000 - 123),
        t6: time::Duration::microseconds(neg_base_seconds * 1_000_000 - 123_456),
        t9: time::Duration::nanoseconds(neg_base_seconds * 1_000_000_000 - 123_456_789),
    };

    let mut insert = client
        .insert::<MyRow>("test_time64_negative")
        .await
        .unwrap();
    insert.write(&row).await.unwrap();
    insert.end().await.unwrap();

    let fetched_rows: Vec<MyRow> = client
        .query("SELECT ?fields FROM test_time64_negative")
        .fetch_all()
        .await
        .unwrap();

    assert_eq!(fetched_rows.len(), 1);
    assert_eq!(fetched_rows[0], row);
}
