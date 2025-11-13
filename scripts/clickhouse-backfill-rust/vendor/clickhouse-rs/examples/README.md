# ClickHouse Rust client examples

## Overview

We aim to cover various scenarios of client usage with these examples. You should be able to run any of these examples, see [How to run](#how-to-run) section below.

If something is missing, or you found a mistake in one of these examples, please open an issue or a pull request.

### General usage

- [usage.rs](usage.rs) - creating tables, executing other DDLs, inserting the data, and selecting it back. Optional cargo features: `inserter`.
- [mock.rs](mock.rs) - writing tests with `mock` feature. Cargo features: requires `test-util`.
- [inserter.rs](inserter.rs) - using the client-side batching via the `inserter` feature. Cargo features: requires `inserter`.
- [async_insert.rs](async_insert.rs) - using the server-side batching via the [asynchronous inserts](https://clickhouse.com/docs/en/optimize/asynchronous-inserts) ClickHouse feature
- [clickhouse_cloud.rs](clickhouse_cloud.rs) - using the client with ClickHouse Cloud, highlighting a few relevant settings (`wait_end_of_query`, `select_sequential_consistency`). Cargo features: requires `rustls-tls`; the code also works with `native-tls`.
- [clickhouse_settings.rs](clickhouse_settings.rs) - applying various ClickHouse settings on the query level
- [server_side_params.rs](server_side_params.rs) - parametrized queries with server-side parameters

### Data types

- [data_types_derive_simple.rs](data_types_derive_simple.rs) - deriving simpler ClickHouse data types in a struct. Required cargo features: `time`, `uuid`.
- [data_types_derive_containers.rs](data_types_derive_containers.rs) - deriving container-like (Array, Tuple, Map, Nested, Geo) ClickHouse data types in a struct.
- [data_types_variant.rs](data_types_variant.rs) - working with the [Variant data type](https://clickhouse.com/docs/en/sql-reference/data-types/variant).
- [data_types_new_json.rs](data_types_new_json.rs) - working with the [new JSON data type](https://clickhouse.com/docs/en/sql-reference/data-types/newjson) as a String.

### Special cases

- [custom_http_client.rs](custom_http_client.rs) - using a custom Hyper client, tweaking its connection pool settings
- [custom_http_headers.rs](custom_http_headers.rs) - setting additional HTTP headers to the client, or overriding the generated ones
- [query_id.rs](query_id.rs) - setting a specific `query_id` on the query level
- [session_id.rs](session_id.rs) - using the client in the session context with temporary tables
- [stream_into_file.rs](stream_into_file.rs) - streaming the query result as raw bytes into a file in an arbitrary format. Required cargo features: `futures03`.
- [stream_arbitrary_format_rows.rs](stream_arbitrary_format_rows.rs) - streaming the query result in an arbitrary format, row by row. Required cargo features: `futures03`.

## How to run

### Prerequisites

* An [up-to-date Rust installation](https://www.rust-lang.org/tools/install)
* ClickHouse server (see below)

### Running the examples

The examples will require a running ClickHouse server on your machine. 

You could [install it directly](https://clickhouse.com/docs/en/install), or run it via Docker:

```sh
docker run -d -p 8123:8123 -p 9000:9000 --name chrs-clickhouse-server --ulimit nofile=262144:262144 clickhouse/clickhouse-server
```

Then, you should be able to run a particular example via the command-line with:

```sh
cargo run --package clickhouse --example async_insert
```

If a particular example requires a cargo feature, you could run it as follows:

```sh
cargo run --package clickhouse --example usage --features inserter
```

Additionally, the individual examples should be runnable via the IDE such as CLion or RustRover.
