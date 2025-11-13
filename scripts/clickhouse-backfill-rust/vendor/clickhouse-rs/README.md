# clickhouse-rs

Official pure Rust typed client for ClickHouse DB.

[![Crates.io][crates-badge]][crates-url]
[![Documentation][docs-badge]][docs-url]
[![Build Status][actions-badge]][actions-url]
[![License][license-badge]][license-url]
[![Codecov][codecov-badge]][codecov-url]

[crates-badge]: https://img.shields.io/crates/v/clickhouse.svg
[crates-url]: https://crates.io/crates/clickhouse
[docs-badge]: https://docs.rs/clickhouse/badge.svg
[docs-url]: https://docs.rs/clickhouse
[license-badge]: https://img.shields.io/badge/license-MIT_OR_Apache--2.0-blue.svg
[license-url]: https://github.com/ClickHouse/clickhouse-rs/blob/main/LICENSE-MIT
[actions-badge]: https://github.com/ClickHouse/clickhouse-rs/actions/workflows/ci.yml/badge.svg
[actions-url]: https://github.com/ClickHouse/clickhouse-rs/actions/workflows/ci.yml
[codecov-badge]: https://codecov.io/gh/ClickHouse/clickhouse-rs/graph/badge.svg?token=3MBXXYL53L
[codecov-url]: https://codecov.io/gh/ClickHouse/clickhouse-rs

* Uses `serde` for encoding/decoding rows.
* Supports `serde` attributes: `skip_serializing`, `skip_deserializing`, `rename`.
* Uses `RowBinaryWithNamesAndTypes` or `RowBinary` formats over HTTP transport.
    * By default, `RowBinaryWithNamesAndTypes` with database schema validation is used.
    * It is possible to switch to `RowBinary`, which can potentially lead to increased performance ([see below](#validation)).
    * There are plans to implement `Native` format over TCP.
* Supports TLS (see `native-tls` and `rustls-tls` features below).
* Supports compression and decompression (LZ4 and LZ4HC).
* Provides API for selecting.
* Provides API for inserting.
* Provides API for infinite transactional (see below) inserting.
* Provides mocks for unit testing.

Note: [ch2rs](https://github.com/ClickHouse/ch2rs) is useful to generate a row type from ClickHouse.

## Validation

Starting from 0.14.0, the crate uses `RowBinaryWithNamesAndTypes` format by default, which allows row types validation
against the ClickHouse schema. This enables clearer error messages in case of schema mismatch at the cost of
performance. Additionally, with enabled validation, the crate supports structs with correct field names and matching
types, but incorrect order of the fields, with an additional slight (5-10%) performance penalty.

If you are looking to maximize performance, you could disable validation using `Client::with_validation(false)`. When
validation is disabled, the client switches to `RowBinary` format usage instead.

The downside with plain `RowBinary` is that instead of clearer error messages, a mismatch between `Row` and database
schema will result in a `NotEnoughData` error without specific details.

However, depending on the dataset, there might be x1.1 to x3 performance improvement, but that highly depends on the
shape and volume of the dataset.

It is always recommended to measure the performance impact of validation in your specific use case. Additionally,
writing smoke tests to ensure that the row types match the ClickHouse schema is highly recommended, if you plan to
disable validation in your application.

## Usage

To use the crate, add this to your `Cargo.toml`:

```toml
[dependencies]
clickhouse = "0.14.0"

[dev-dependencies]
clickhouse = { version = "0.14.0", features = ["test-util"] }
```

<details>
<summary>

### Create a client

</summary>

```rust,no_run
use clickhouse::Client;

let client = Client::default()
    .with_url("http://localhost:8123")
    .with_user("name")
    .with_password("123")
    .with_database("test");
```

* Reuse created clients or clone them in order to reuse a connection pool.

</details>
<details>
<summary>

### Select rows

</summary>

```rust,no_run
use serde::Deserialize;
use clickhouse::Row;

#[derive(Row, Deserialize)]
struct MyRow<'a> {
    no: u32,
    name: &'a str,
}

async fn example(client: clickhouse::Client) -> clickhouse::error::Result<()> {
    let mut cursor = client
        .query("SELECT ?fields FROM some WHERE no BETWEEN ? AND ?")
        .bind(500)
        .bind(504)
        .fetch::<MyRow<'_>>()?;

    while let Some(row) = cursor.next().await? {
        println!("no: {}, name: {}", row.no, row.name);
    }
    
    Ok(())
}
```

* Placeholder `?fields` is replaced with `no, name` (fields of `Row`).
* Placeholder `?` is replaced with values in following `bind()` calls.
* Convenient `fetch_one::<Row>()` and `fetch_all::<Row>()` can be used to get a first row or all rows correspondingly.
* `sql::Identifier` can be used to bind table names.

Note that cursors can return an error even after producing some rows. To avoid this, use `client.with_option("wait_end_of_query", "1")` in order to enable buffering on the server-side. [More details](https://clickhouse.com/docs/en/interfaces/http/#response-buffering). The `buffer_size` option can be useful too.

</details>
<details>
<summary>

### Insert a batch

</summary>

```rust,no_run
use serde::Serialize;
use clickhouse::Row;

#[derive(Row, Serialize)]
struct MyRow {
    no: u32,
    name: String,
}

async fn example(client: clickhouse::Client) -> clickhouse::error::Result<()> {
    let mut insert = client.insert::<MyRow>("some").await?;
    insert.write(&MyRow { no: 0, name: "foo".into() }).await?;
    insert.write(&MyRow { no: 1, name: "bar".into() }).await?;
    insert.end().await?;
    Ok(())
}
```

* If `end()` isn't called, the `INSERT` is aborted.
* Rows are being sent progressively to spread network load.
* ClickHouse inserts batches atomically only if all rows fit in the same partition and their number is less [`max_insert_block_size`](https://clickhouse.com/docs/en/operations/settings/settings#max_insert_block_size).

</details>
<details>
<summary>

### Infinite inserting

</summary>

Requires the `inserter` feature.

```rust,no_run
use serde::Serialize;
use clickhouse::Row;
use clickhouse::inserter::Inserter;
use std::time::Duration;

#[derive(Row, Serialize)]
struct MyRow {
    no: u32,
    name: String,
}

async fn example(client: clickhouse::Client) -> clickhouse::error::Result<()> {
    let mut inserter = client.inserter::<MyRow>("some")
        .with_timeouts(Some(Duration::from_secs(5)), Some(Duration::from_secs(20)))
        .with_max_bytes(50_000_000)
        .with_max_rows(750_000)
        .with_period(Some(Duration::from_secs(15)));
    
    inserter.write(&MyRow { no: 0, name: "foo".into() }).await?;
    inserter.write(&MyRow { no: 1, name: "bar".into() }).await?;
    let stats = inserter.commit().await?;
    if stats.rows > 0 {
        println!(
            "{} bytes, {} rows, {} transactions have been inserted",
            stats.bytes, stats.rows, stats.transactions,
        );
    }
    Ok(())
}
```

Please, read [examples](https://github.com/ClickHouse/clickhouse-rs/tree/main/examples/inserter.rs) to understand how to use it properly in different real-world cases.

* `Inserter` ends an active insert in `commit()` if thresholds (`max_bytes`, `max_rows`, `period`) are reached.
* The interval between ending active `INSERT`s can be biased by using `with_period_bias` to avoid load spikes by parallel inserters.
* `Inserter::time_left()` can be used to detect when the current period ends. Call `Inserter::commit()` again to check limits if your stream emits items rarely.
* Time thresholds implemented by using [quanta](https://docs.rs/quanta) crate to speed the inserter up. Not used if `test-util` is enabled (thus, time can be managed by `tokio::time::advance()` in custom tests).
* All rows between `commit()` calls are inserted in the same `INSERT` statement.
* Do not forget to flush if you want to terminate inserting:
```rust,ignore
inserter.end().await?;
```

</details>
<details>
<summary>

### Perform DDL

</summary>

```rust,no_run
async fn example(client: clickhouse::Client) -> clickhouse::error::Result<()> {
    client.query("DROP TABLE IF EXISTS some").execute().await?;
    Ok(())
}
```

</details>

## Feature Flags
* `lz4` (enabled by default) — enables `Compression::Lz4`. If enabled, `Compression::Lz4` is used by default for all queries.
* `inserter` — enables `client.inserter()`.
* `test-util` — adds mocks. See [the example](https://github.com/ClickHouse/clickhouse-rs/tree/main/examples/mock.rs). Use it only in `dev-dependencies`.
* `uuid` — adds `serde::uuid` to work with [uuid](https://docs.rs/uuid) crate.
* `time` — adds `serde::time` to work with [time](https://docs.rs/time) crate.
* `chrono` — adds `serde::chrono` to work with [chrono](https://docs.rs/chrono) crate.

### TLS
By default, TLS is disabled and one or more following features must be enabled to use HTTPS urls:
* `native-tls` — uses [native-tls], utilizing dynamic linking (e.g. against OpenSSL).
* `rustls-tls` — enables `rustls-tls-aws-lc` and `rustls-tls-webpki-roots` features.
* `rustls-tls-aws-lc` — uses [rustls] with the `aws-lc` cryptography implementation.
* `rustls-tls-ring` — uses [rustls] with the `ring` cryptography implementation.
* `rustls-tls-webpki-roots` — uses [rustls] with certificates provided by the [webpki-roots] crate.
* `rustls-tls-native-roots` — uses [rustls] with certificates provided by the [rustls-native-certs] crate.

If multiple features are enabled, the following priority is applied:
* `native-tls` > `rustls-tls-aws-lc` > `rustls-tls-ring`
* `rustls-tls-native-roots` > `rustls-tls-webpki-roots`

How to choose between all these features? Here are some considerations:
* A good starting point is `rustls-tls`, e.g. if you use ClickHouse Cloud.
* To be more environment-agnostic, prefer `rustls-tls` over `native-tls`.
* Enable `rustls-tls-native-roots` or `native-tls` if you want to use self-signed certificates.

[native-tls]: https://docs.rs/native-tls
[rustls]: https://docs.rs/rustls
[webpki-roots]: https://docs.rs/webpki-roots
[rustls-native-certs]: https://docs.rs/rustls-native-certs

## Data Types
* `(U)Int(8|16|32|64|128)` maps to/from corresponding `(u|i)(8|16|32|64|128)` types or newtypes around them.
* `(U)Int256` aren't supported directly, but there is [a workaround for it](https://github.com/ClickHouse/clickhouse-rs/issues/48).
* `Float(32|64)` maps to/from corresponding `f(32|64)` or newtypes around them.
* `Decimal(32|64|128)` maps to/from corresponding `i(32|64|128)` or newtypes around them. It's more convenient to use [fixnum](https://github.com/loyd/fixnum) or another implementation of signed fixed-point numbers.
* `Boolean` maps to/from `bool` or newtypes around it.
* `String` maps to/from any string or bytes types, e.g. `&str`, `&[u8]`, `String`, `Vec<u8>` or [`SmartString`](https://docs.rs/smartstring/latest/smartstring/struct.SmartString.html). Newtypes are also supported. To store bytes, consider using [serde_bytes](https://docs.rs/serde_bytes/latest/serde_bytes/), because it's more efficient.
    <details>
    <summary>Example</summary>

    ```rust,no_run
    use serde::{Serialize, Deserialize};
    use clickhouse::Row;

    #[derive(Row, Debug, Serialize, Deserialize)]
    struct MyRow<'a> {
        str: &'a str,
        string: String,
        #[serde(with = "serde_bytes")]
        bytes: Vec<u8>,
        #[serde(with = "serde_bytes")]
        byte_slice: &'a [u8],
    }
    ```
    </details>
* `FixedString(N)` is supported as an array of bytes, e.g. `[u8; N]`.
    <details>
    <summary>Example</summary>
  
    ```rust,no_run
    use clickhouse::Row;
    use serde::{Serialize, Deserialize};
    #[derive(Row, Debug, Serialize, Deserialize)]
    struct MyRow {
        fixed_str: [u8; 16], // FixedString(16)
    }
    ```
    </details>
* `Enum(8|16)` are supported using [serde_repr](https://docs.rs/serde_repr/latest/serde_repr/). You could use
  `#[repr(i8)]` for `Enum8` and `#[repr(i16)]` for `Enum16`.
    <details>
    <summary>Example</summary>

    ```rust,no_run
    use clickhouse::Row;
    use serde::{Serialize, Deserialize};
    use serde_repr::{Deserialize_repr, Serialize_repr};

    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        level: Level,
    }

    #[derive(Debug, Serialize_repr, Deserialize_repr)]
    #[repr(i8)]
    enum Level {
        Debug = 1,
        Info = 2,
        Warn = 3,
        Error = 4,
    }
    ```
    </details>
* `UUID` maps to/from [`uuid::Uuid`](https://docs.rs/uuid/latest/uuid/struct.Uuid.html) by using `serde::uuid`. Requires the `uuid` feature.
    <details>
    <summary>Example</summary>

    ```rust,no_run
    use serde::{Serialize, Deserialize};
    use clickhouse::Row;

    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::uuid")]
        uuid: uuid::Uuid,
    }
    ```
    </details>
* `IPv6` maps to/from [`std::net::Ipv6Addr`](https://doc.rust-lang.org/stable/std/net/struct.Ipv6Addr.html).
* `IPv4` maps to/from [`std::net::Ipv4Addr`](https://doc.rust-lang.org/stable/std/net/struct.Ipv4Addr.html) by using `serde::ipv4`.
    <details>
    <summary>Example</summary>

    ```rust,no_run
    use serde::{Serialize, Deserialize};
    use clickhouse::Row;

    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::ipv4")]
        ipv4: std::net::Ipv4Addr,
    }
    ```
    </details>
* `Date` maps to/from `u16` or a newtype around it and represents a number of days elapsed since `1970-01-01`. The following external types are supported: 
    * [`time::Date`](https://docs.rs/time/latest/time/struct.Date.html) is supported by using `serde::time::date`, requiring the `time` feature. 
    * [`chrono::NaiveDate`](https://docs.rs/chrono/latest/chrono/struct.NaiveDate.html) is supported by using `serde::chrono::date`, requiring the `chrono` feature. 
    <details>
    <summary>Example</summary>

    ```rust,no_run
    use serde::{Serialize, Deserialize};
    use clickhouse::Row;
    use time::Date;
    use chrono::NaiveDate;

    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        days: u16,
        #[serde(with = "clickhouse::serde::time::date")]
        date: Date,
        // if you prefer using chrono:
        #[serde(with = "clickhouse::serde::chrono::date")]
        date_chrono: NaiveDate,
    }

    ```
    </details>
* `Date32` maps to/from `i32` or a newtype around it and represents a number of days elapsed since `1970-01-01`. The following external types are supported: 
    * [`time::Date`](https://docs.rs/time/latest/time/struct.Date.html) is supported by using `serde::time::date32`, requiring the `time` feature. 
    * [`chrono::NaiveDate`](https://docs.rs/chrono/latest/chrono/struct.NaiveDate.html) is supported by using `serde::chrono::date32`, requiring the `chrono` feature. 
    <details>
    <summary>Example</summary>

    ```rust,no_run
    use serde::{Serialize, Deserialize};
    use clickhouse::Row;
    use time::Date;
    use chrono::NaiveDate;

    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        days: i32,
        #[serde(with = "clickhouse::serde::time::date32")]
        date: Date,
        // if you prefer using chrono:
        #[serde(with = "clickhouse::serde::chrono::date32")]
        date_chrono: NaiveDate,

    }

    ```
    </details>
* `DateTime` maps to/from `u32` or a newtype around it and represents a number of seconds elapsed since UNIX epoch. The following external types are supported:
    * [`time::OffsetDateTime`](https://docs.rs/time/latest/time/struct.OffsetDateTime.html) is supported by using `serde::time::datetime`, requiring the `time` feature. 
    * [`chrono::DateTime<Utc>`](https://docs.rs/chrono/latest/chrono/struct.DateTime.html) is supported by using `serde::chrono::datetime`, requiring the `chrono` feature. 
    <details>
    <summary>Example</summary>

    ```rust,no_run
    use serde::{Serialize, Deserialize};
    use clickhouse::Row;
    use time::OffsetDateTime;
    use chrono::{DateTime, Utc};
    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        ts: u32,
        #[serde(with = "clickhouse::serde::time::datetime")]
        dt: OffsetDateTime,
        // if you prefer using chrono:
        #[serde(with = "clickhouse::serde::chrono::datetime")]
        dt_chrono: DateTime<Utc>,        
    }
    ```
    </details>
* `DateTime64(_)` maps to/from `i64` or a newtype around it and represents a time elapsed since UNIX epoch. The following external types are supported:
    * [`time::OffsetDateTime`](https://docs.rs/time/latest/time/struct.OffsetDateTime.html) is supported by using `serde::time::datetime64::*`, requiring the `time` feature. 
    * [`chrono::DateTime<Utc>`](https://docs.rs/chrono/latest/chrono/struct.DateTime.html) is supported by using `serde::chrono::datetime64::*`, requiring the `chrono` feature. 
    <details>
    <summary>Example</summary>

    ```rust,no_run
    use serde::{Serialize, Deserialize};
    use clickhouse::Row;
    use time::OffsetDateTime;
    use chrono::{DateTime, Utc};

    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        ts: i64, // elapsed s/us/ms/ns depending on `DateTime64(X)`
        #[serde(with = "clickhouse::serde::time::datetime64::secs")]
        dt64s: OffsetDateTime,  // `DateTime64(0)`
        #[serde(with = "clickhouse::serde::time::datetime64::millis")]
        dt64ms: OffsetDateTime, // `DateTime64(3)`
        #[serde(with = "clickhouse::serde::time::datetime64::micros")]
        dt64us: OffsetDateTime, // `DateTime64(6)`
        #[serde(with = "clickhouse::serde::time::datetime64::nanos")]
        dt64ns: OffsetDateTime, // `DateTime64(9)`
        // if you prefer using chrono:
        #[serde(with = "clickhouse::serde::chrono::datetime64::secs")]
        dt64s_chrono: DateTime<Utc>,  // `DateTime64(0)`
        #[serde(with = "clickhouse::serde::chrono::datetime64::millis")]
        dt64ms_chrono: DateTime<Utc>, // `DateTime64(3)`
        #[serde(with = "clickhouse::serde::chrono::datetime64::micros")]
        dt64us_chrono: DateTime<Utc>, // `DateTime64(6)`
        #[serde(with = "clickhouse::serde::chrono::datetime64::nanos")]
        dt64ns_chrono: DateTime<Utc>, // `DateTime64(9)`
    }


    ```
    </details>
* `Time` maps to/from i32 or a newtype around it. The Time data type is used to store a time value independent of any calendar date. It is ideal for representing daily schedules, event times, or any situation where only the time component (hours, minutes, seconds) is important.
    * [`time:Duration`](https://docs.rs/time/latest/time/struct.Duration.html) is is supported by using `serde::time::*`, requiring the `time` feature.
    * [`chrono::Duration`](https://docs.rs/chrono/latest/chrono/type.Duration.html) is supported by using `serde::chrono::*`, which is an alias to `TimeDelta`, requiring the `chrono` feature
    <details>
    <summary>Example</summary>

    ```rust,no_run
    use serde::{Serialize, Deserialize};
    use clickhouse::Row;
    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::chrono::time64::secs")]
        t0: chrono::Duration,
        #[serde(with = "clickhouse::serde::chrono::time64::secs::option")]
        t0_opt: Option<chrono::Duration>,
    }

    ```
    </details>
* `Time64(_)` maps to/from i64 or a newtype around it. The Time data type is used to store a time value independent of any calendar date. It is ideal for representing daily schedules, event times, or any situation where only the time component (hours, minutes, seconds) is important.
    * [`time:Duration`](https://docs.rs/time/latest/time/struct.Duration.html) is is supported by using `serde::time::*`, requiring the `time` feature.
    * [`chrono::Duration`](https://docs.rs/chrono/latest/chrono/type.Duration.html) is supported by using `serde::chrono::*`, requiring the `chrono` feature
    <details>
    <summary>Example</summary>

    ```rust,ignore
    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::time::time")]
        t0: Time,
    }

    ```
    </details>
* `Tuple(A, B, ...)` maps to/from `(A, B, ...)` or a newtype around it.
* `Array(_)` maps to/from any slice, e.g. `Vec<_>`, `&[_]`. Newtypes are also supported.
* `Map(K, V)` can be deserialized as `HashMap<K, V>` or `Vec<(K, V)>`.
* `LowCardinality(_)` is supported seamlessly.
* `Nullable(_)` maps to/from `Option<_>`. For `clickhouse::serde::*` helpers add `::option`.
    <details>
    <summary>Example</summary>

    ```rust,no_run
    use clickhouse::Row;
    use serde::{Serialize, Deserialize};
    use std::net::Ipv4Addr;
    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        #[serde(with = "clickhouse::serde::ipv4::option")]
        ipv4_opt: Option<Ipv4Addr>,
    }
    ```
    </details>
* `Nested` is supported by providing multiple arrays with renaming.
    <details>
    <summary>Example</summary>

    ```rust,no_run
    // CREATE TABLE test(items Nested(name String, count UInt32))
    use clickhouse::Row;
    use serde::{Serialize, Deserialize};
    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        #[serde(rename = "items.name")]
        items_name: Vec<String>,
        #[serde(rename = "items.count")]
        items_count: Vec<u32>,
    }
    ```
    </details>
* `Geo` types are supported. `Point` behaves like a tuple `(f64, f64)`, and the rest of the types are just slices of
  points.
    <details>
    <summary>Example</summary>

    ```rust,no_run
    use clickhouse::Row;
    use serde::{Serialize, Deserialize};

    type Point = (f64, f64);
    type Ring = Vec<Point>;
    type Polygon = Vec<Ring>;
    type MultiPolygon = Vec<Polygon>;
    type LineString = Vec<Point>;
    type MultiLineString = Vec<LineString>;
  
    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        point: Point,
        ring: Ring,
        polygon: Polygon,
        multi_polygon: MultiPolygon,
        line_string: LineString,
        multi_line_string: MultiLineString,
    }
    ```
    </details>
* `Variant` data type is supported as a Rust enum. As the inner Variant types are _always_ sorted alphabetically, Rust enum variants should be defined in the _exactly_ same order as it is in the data type; their names are irrelevant, only the order of the types matters. This following example has a column defined as `Variant(Array(UInt16), Bool, Date, String, UInt32)`:
    <details>
    <summary>Example</summary>
    
    ```rust,no_run
    use clickhouse::Row;
    use serde::{Serialize, Deserialize};
    use time::Date;
    #[derive(Serialize, Deserialize)]
    enum MyRowVariant {
        Array(Vec<i16>),
        Boolean(bool),
        #[serde(with = "clickhouse::serde::time::date")]
        Date(time::Date),
        String(String),
        UInt32(u32),
    }
    
    #[derive(Row, Serialize, Deserialize)]
    struct MyRow {
        id: u64,
        var: MyRowVariant,
    }
    ```
    </details>
* [New `JSON` data type](https://clickhouse.com/docs/en/sql-reference/data-types/newjson) is currently supported as a string when using ClickHouse 24.10+. See [this example](examples/data_types_new_json.rs) for more details.
* `Dynamic` data type is not supported for now.

See also the additional examples:

* [Simpler ClickHouse data types](examples/data_types_derive_simple.rs)
* [Container-like ClickHouse data types](examples/data_types_derive_containers.rs)
* [Variant data type](examples/data_types_variant.rs)

## Mocking
The crate provides utils for mocking CH server and testing DDL, `SELECT` and `INSERT` queries.

The functionality can be enabled with the `test-util` feature. Use it **only** in dev-dependencies.

See [the example](https://github.com/ClickHouse/clickhouse-rs/tree/main/examples/mock.rs).

## Support Policies

### Minimum Supported Rust Version (MSRV)

This project's MSRV is the second-to-last stable release as of the beginning of the current release cycle (`0.x.0`),
where it will remain until the beginning of the _next_ release cycle (`0.{x+1}.0`).

The MSRV for the `0.14.x` release cycle is `1.89.0`.

This guarantees that `clickhouse-rs` will compile with a Rust version that is at _least_ six weeks old, 
which should be plenty of time for it to make it through any packaging system that is being actively kept up to date.

Beware when installing Rust through operating system package managers, as it can often be a year or more
out-of-date. For example, Debian Bookworm (released 10 June 2023) shipped with Rust 1.63.0 (released 11 August 2022).

### ClickHouse Versions

The supported versions of the ClickHouse database server coincide with the versions currently receiving security
updates.

For the list of currently supported versions, see <https://github.com/ClickHouse/ClickHouse/blob/master/SECURITY.md#security-change-log-and-support>.
