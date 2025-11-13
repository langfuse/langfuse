# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- next-header -->

## [Unreleased] - ReleaseDate

### Added
* Implement `Stream` for `RowCursor` ([#283], [#340])

### Fixed
* Optimize `RowCursor` by reusing buffer capacity where possible ([#340])
* All `Query::fetch*` methods will always use POST instead of GET. It is now allowed to change `readonly` value via 
  `Query::with_option`. ([#342])
* In case of a schema mismatch, the client now emits `clickhouse::error::Error::SchemaMismatch` instead of panicking. 
  ([#346])

[#283]: https://github.com/ClickHouse/clickhouse-rs/pull/283
[#340]: https://github.com/ClickHouse/clickhouse-rs/pull/340
[#342]: https://github.com/ClickHouse/clickhouse-rs/pull/342
[#346]: https://github.com/ClickHouse/clickhouse-rs/pull/346

## [0.14.0] - 2025-10-08

### Removed

- **BREAKING** watch: `Client::watch()` API is removed ([#245]).
- **BREAKING** mock: `watch()` and `watch_only_events()` are removed ([#245]).

### Changed

- **BREAKING** insert: the type of `Insert<_>` should now be specified when calling `client.insert::<_>()`. ([#247])
- **BREAKING** insert: `Client::insert()` is now async. ([#244])
- **BREAKING** inserter: `Inserter::write()` is now async. ([#244])
- **BREAKING** inserter: `Inserter::new()` return just `Self` instead of `Result<Self>`. ([#244])
- **BREAKING** query: `RowBinaryWithNamesAndTypes` is now used by default for query results. This may cause panics if
  the row struct definition does not match the database schema. Use `Client::with_validation(false)` to revert to the
  previous behavior which uses plain `RowBinary` format for fetching rows. ([#221], [#244])
- **BREAKING** mock: when using `test-util` feature, it is now required to use `Client::with_mock(&mock)` to set up the
  mock server, so it properly handles the response format and automatically disables parsing
  `RowBinaryWithNamesAndTypes` header parsing and validation. Additionally, it is not required to call `with_url`
  explicitly. See the [updated example](./examples/mock.rs).
- **BREAKING** query: `Query::fetch_bytes()` now expects `impl AsRef<str>` for `format` instead of `Into<String>`. 
  Most usages should not be affected, however, unless passing a custom type that implements the latter but not the former.
  ([#311])
- query: due to `RowBinaryWithNamesAndTypes` format usage, there might be an impact on fetch performance, which largely
  depends on how the dataset is defined. If you notice decreased performance, consider disabling validation by using
  `Client::with_validation(false)`.
- serde: it is now possible to deserialize Map ClickHouse type into `HashMap<K, V>` (or `BTreeMap`, `IndexMap`, 
  `DashMap`, etc.).
- tls: improved error messages in case of missing TLS features when using HTTPS ([#229]).
- crate: MSRV is now 1.79 due to borrowed rows support redesign in [#247].
- crate: bumped dependencies, see [#232], [#239] and [#280] for additional details.
- crate: starting from 0.3.0, `clickhouse-derive` is now published as [`clickhouse-macros` on crates.io](https://crates.io/crates/clickhouse-macros/0.3.0). The former `clickhouse-derive` crate is discontinued. ([#318]).

### Added

- types: added support for `Time` and `Time64` types ([#258]).
- client: added `Client::with_validation` builder method. Validation is enabled by default, meaning that
  `RowBinaryWithNamesAndTypes` format will be used to fetch rows from the database. If validation is disabled,
  `RowBinary` format will be used, similarly to the previous versions. ([#221]).
- types: a new crate `clickhouse-types` was added to the project workspace. This crate is required for
  `RowBinaryWithNamesAndTypes` struct definition validation, as it contains ClickHouse data types AST, as well as
  functions and utilities to parse the types out of the ClickHouse server response. ([#221]).
- query: support serializing `serde_bytes::Bytes` as hex string literals in query parameters ([#250]).
- derive: added `#[clickhouse(crate = "...")]` attribute for `#[derive(Row)]` ([#189], [#292])

### Fixed

- client: extract the exception code from `X-ClickHouse-Exception-Code` in case of incorrect 200 OK response 
  that could occur with ClickHouse server up to versions 24.x ([#256]).
- query: pass format as `?default_format` URL parameter instead of using `FORMAT` clause, allowing queries to have
  trailing comments and/or semicolons ([#267], [#269], [#311]).

[#189]: https://github.com/ClickHouse/clickhouse-rs/pull/189
[#221]: https://github.com/ClickHouse/clickhouse-rs/pull/221
[#229]: https://github.com/ClickHouse/clickhouse-rs/pull/229
[#232]: https://github.com/ClickHouse/clickhouse-rs/pull/232
[#239]: https://github.com/ClickHouse/clickhouse-rs/pull/239
[#244]: https://github.com/ClickHouse/clickhouse-rs/pull/244
[#245]: https://github.com/ClickHouse/clickhouse-rs/pull/245
[#247]: https://github.com/ClickHouse/clickhouse-rs/pull/247
[#250]: https://github.com/ClickHouse/clickhouse-rs/pull/250
[#256]: https://github.com/ClickHouse/clickhouse-rs/pull/256
[#258]: https://github.com/ClickHouse/clickhouse-rs/pull/258
[#267]: https://github.com/ClickHouse/clickhouse-rs/pull/267
[#269]: https://github.com/ClickHouse/clickhouse-rs/pull/269
[#280]: https://github.com/ClickHouse/clickhouse-rs/pull/280
[#292]: https://github.com/ClickHouse/clickhouse-rs/pull/292
[#311]: https://github.com/ClickHouse/clickhouse-rs/pull/311
[#318]: https://github.com/ClickHouse/clickhouse-rs/pull/318

## [0.13.3] - 2025-05-29
### Added
- client: added `Client::with_access_token` to support JWT authentication ClickHouse Cloud feature ([#215]).
- Identifier: added `Copy` and `Clone` derive ([#224]).

### Fixed
- query/cursor: detect more deferred errors ([#220]).
- query/bind: fixed `i128`/`u128` SQL serialization ([#209]).

[#209]: https://github.com/ClickHouse/clickhouse-rs/pull/209
[#215]: https://github.com/ClickHouse/clickhouse-rs/pull/215
[#220]: https://github.com/ClickHouse/clickhouse-rs/pull/220
[#224]: https://github.com/ClickHouse/clickhouse-rs/pull/224

## [0.13.2] - 2025-03-12
### Added
- query: added `Query::with_param` to support server-side parameters binding ([#159])
- derive: added [Variant data type](https://clickhouse.com/docs/en/sql-reference/data-types/variant) support ([#170]).
- query: added `Query::fetch_bytes` that allows streaming data in an arbitrary format ([#182])
- serde: added support for [chrono](https://docs.rs/chrono/latest/chrono/) ([#188])

### Changed
- MSRV is now 1.73 due to changes in `bstr` and `hyper-rustls` dependencies ([#180]).

### Fixed
- query/cursor: return `NotEnoughData` if a row is unparsed when the stream ends ([#185]).

[#159]: https://github.com/ClickHouse/clickhouse-rs/pull/159
[#170]: https://github.com/ClickHouse/clickhouse-rs/pull/170
[#180]: https://github.com/ClickHouse/clickhouse-rs/pull/180
[#182]: https://github.com/ClickHouse/clickhouse-rs/pull/182
[#185]: https://github.com/ClickHouse/clickhouse-rs/pull/185
[#188]: https://github.com/ClickHouse/clickhouse-rs/pull/188

## [0.13.1] - 2024-10-21
### Added
- query/cursor: add `RowCursor::{decoded_bytes,received_bytes}` methods ([#169]).

### Changed
- query/cursor: improve performance of `RowCursor::next()` ([#169]).

### Fixed
- mock: work with the advanced time via `tokio::time::advance()` ([#165]).

[#165]: https://github.com/ClickHouse/clickhouse-rs/pull/165
[#169]: https://github.com/ClickHouse/clickhouse-rs/pull/169

## [0.13.0] - 2024-09-27
### Added
- query: add `Query::sql_display()` ([#155]).
- client: add `Client::with_product_info()` ([#135]).
- client: add the `User-Agent` header to all requests ([#135]).

### Changed
- MSRV is now 1.70 due to changes in [hyper-rustls v0.27.3].
- tls: revise HTTPS-related features, see README for details ([#140],[#141],[#156]).
- query: support `??` for escaping the `?` symbol in SQL ([#154]).

### Fixed
- insert: don't panic on empty inserts ([#139]).
- uuid: serialization in human-readable formats ([#76]).

[#76]: https://github.com/ClickHouse/clickhouse-rs/pull/76
[#135]: https://github.com/ClickHouse/clickhouse-rs/pull/135
[#139]: https://github.com/ClickHouse/clickhouse-rs/pull/139
[#140]: https://github.com/ClickHouse/clickhouse-rs/pull/140
[#141]: https://github.com/ClickHouse/clickhouse-rs/pull/141
[#154]: https://github.com/ClickHouse/clickhouse-rs/pull/154
[#155]: https://github.com/ClickHouse/clickhouse-rs/pull/155
[#156]: https://github.com/ClickHouse/clickhouse-rs/pull/156
[hyper-rustls v0.27.3]: https://github.com/rustls/hyper-rustls/releases/tag/v%2F0.27.3

## [0.12.2] - 2024-08-20
### Changed
- Now this crate is pure Rust, no more C/C++ dependencies.
- insert: increase max size of frames to improve throughput ([#130]).
- compression: replace `lz4` sys binding with `lz4-flex` (pure Rust).
- compression: replace `clickhouse-rs-cityhash-sys` sys binding with `cityhash-rs` (pure Rust) ([#107]).

### Deprecated
- compression: `Compression::Lz4Hc` is deprecated and becomes an alias to `Compression::Lz4`.

[#130]: https://github.com/ClickHouse/clickhouse-rs/issues/130
[#107]: https://github.com/ClickHouse/clickhouse-rs/issues/107

## [0.12.1] - 2024-08-07
### Added
- query/bind: support `Option` in `query.bind(arg)` ([#119], [#120]).
- client: `Client::with_header()` to provide custom headers ([#98], [#108]).
- query: added `Query::with_option()` similar to `Client::with_option()` ([#123]).
- insert: added `Insert::with_option()` similar to `Client::with_option()` ([#123]).
- inserter: added `Inserter::with_option()` similar to `Client::with_option()` ([#123]).

### Changed
- insert: the outgoing request is now created after the first `Insert::write` call instead of `Insert::new` ([#123]).

[#123]: https://github.com/ClickHouse/clickhouse-rs/pull/123
[#120]: https://github.com/ClickHouse/clickhouse-rs/pull/120
[#119]: https://github.com/ClickHouse/clickhouse-rs/issues/119
[#108]: https://github.com/ClickHouse/clickhouse-rs/pull/108
[#98]: https://github.com/ClickHouse/clickhouse-rs/issues/98

## [0.12.0] - 2024-07-16
### Added
- derive: support `serde::skip_deserializing` ([#83]).
- insert: apply options set on the client ([#90]).
- inserter: can be limited by size, see `Inserter::with_max_bytes()`.
- inserter: `Inserter::pending()` to get stats about still being inserted data.
- inserter: `Inserter::force_commit()` to commit and insert immediately.
- mock: impl `Default` instance for `Mock`.

### Changed
- **BREAKING** bump MSRV to 1.67.
- **BREAKING** replace the `tls` feature with `native-tls` and `rustls-tls` that must be enabled explicitly now.
- **BREAKING** http: `HttpClient` API is changed due to moving to hyper v1.
- **BREAKING** inserter: move under the `inserter` feature.
- **BREAKING** inserter: there is no default limits anymore.
- **BREAKING** inserter: `Inserter::write` is synchronous now.
- **BREAKING** inserter: rename `entries` to `rows`.
- **BREAKING** drop the `wa-37420` feature.
- **BREAKING** remove deprecated items.
- **BREAKING** mock: `provide()`, `watch()` and `watch_only_events()` now accept iterators instead of streams.
- inserter: improve performance of time measurements by using `quanta`.
- inserter: improve performance if the time limit isn't used.
- derive: move to syn v2.
- mock: return a request if no handler is installed ([#89], [#91]).

### Fixed
- watch: support a new syntax.
- uuid: possible unsoundness.
- query: avoid panics during `Query::bind()` calls ([#103]).

[#103]: https://github.com/ClickHouse/clickhouse-rs/issues/103
[#102]: https://github.com/ClickHouse/clickhouse-rs/pull/102
[#91]: https://github.com/ClickHouse/clickhouse-rs/pull/91
[#90]: https://github.com/ClickHouse/clickhouse-rs/pull/90
[#89]: https://github.com/ClickHouse/clickhouse-rs/issues/89
[#83]: https://github.com/ClickHouse/clickhouse-rs/pull/83

## [0.11.6] - 2023-09-27
### Fixed
- client: accept HTTPs urls if `tls` feature is enabled ([#58]).

[#58]: https://github.com/ClickHouse/clickhouse-rs/issues/56

## [0.11.5] - 2023-06-12
### Changed
- inserter: start new insert only when the first row is provided ([#68], [#70]).

[#70]: https://github.com/ClickHouse/clickhouse-rs/pull/70
[#68]: https://github.com/ClickHouse/clickhouse-rs/pull/68

## [0.11.4] - 2023-05-14
### Added
- query: `Query::fetch_optional()`.

### Changed
- query: increase performance up to 40%.

## [0.11.3] - 2023-02-19
### Added
- client: support HTTPS ([#54]).

### Changed
- query: improve throughput (~8%).

### Fixed
- cursor: handle errors sent at the end of a response ([#56]).

[#56]: https://github.com/ClickHouse/clickhouse-rs/issues/56
[#54]: https://github.com/ClickHouse/clickhouse-rs/pull/54

## [0.11.2] - 2023-01-03
### Added
- insert: `with_timeouts` to manage timeouts.
- inserter: `with_timeouts` and `set_timeouts` to manage timeouts.

### Changed
- insert: improve throughput (~30%).
- inserter: set a default value of `max_entries` to 500_000.

## [0.11.1] - 2022-11-25
### Added
- ipv4: `serde::ipv4` for ser/de the `IPv4` type to/from `Ipv4Addr`. Note that `IPv6` requires no annotations.
- time: `serde::time::datetime(64)` for ser/de the [`time::OffsetDateTime`] type to/from `DateTime` and `DateTime64`.
- time: `serde::time::date(32)` for ser/de the [`time::Date`] type to/from `Date` and `Date32`.
- serde: add `::option` variants to support `Option<_>`.

### Changed
- uuid: move to the `serde` submodule.

[`time::OffsetDateTime`]: https://docs.rs/time/latest/time/struct.OffsetDateTime.html
[`time::Date`]: https://docs.rs/time/latest/time/struct.Date.html

## [0.11.0] - 2022-11-10
### Added
- compression: implement Lz4/Lz4Hc compression modes for `INSERT`s ([#39]).
- insert: the `wa-37420` feature to avoid [ClickHouse#37420].
- inserter: new method `Inserter::time_left()`.
- uuid: the `uuid` feature and a corresponding module to ser/de [`uuid::Uuid`] ([#26]).

### Changed
- **BREAKING** decompression: HTTP compression (gzip, zlib and brotli) isn't available anymore, only Lz4.
- inserter: skip timer ticks if `INSERT` is too long ([#20]).

[#39]: https://github.com/ClickHouse/clickhouse-rs/issues/39
[#26]: https://github.com/ClickHouse/clickhouse-rs/issues/26
[#20]: https://github.com/ClickHouse/clickhouse-rs/issues/20
[ClickHouse#37420]: https://github.com/ClickHouse/ClickHouse/issues/37420
[`uuid::Uuid`]: https://docs.rs/uuid/latest/uuid/struct.Uuid.html

## [0.10.0] - 2022-01-18
### Added
- client: `Client::with_http_client` to use custom `hyper::Client`, e.g. for https ([#27]).

### Changed
- watch: run `WATCH` queries with `max_execution_time=0`.
- bind: implement `Bind` for all `Serialize` instances ([#33]).

### Fixed
- Implement `Primitive` for `f64` ([#31]).

[#33]: https://github.com/ClickHouse/clickhouse-rs/issues/33
[#31]: https://github.com/ClickHouse/clickhouse-rs/issues/31
[#27]: https://github.com/ClickHouse/clickhouse-rs/pull/27

## [0.9.3] - 2021-12-21
### Added
- Implement `Primitive` for `f64` and `f32` ([#29]).

### Fixed
- Reset quantities on errors to support reusing `Inserter` after errors ([#30]).

[#30]: https://github.com/ClickHouse/clickhouse-rs/pull/30
[#29]: https://github.com/ClickHouse/clickhouse-rs/issues/29

## [0.9.2] - 2021-11-01
### Changed
- HTTP Keep-alive timeout is restricted to 2s explicitly.

### Fixed
- watch: make a cursor cancellation safe.

## [0.9.1] - 2021-10-25
### Added
- mock: add `record_ddl` handler to test DDL queries.
- mock: add `watch` and `watch_only_events` handlers to test WATCH queries.

## [0.9.0] - 2021-10-25
### Fixed
- query: support borrowed long strings ([#22]).
- query: read the whole response of DDL queries.

### Changed
- **BREAKING**: watch: require the `watch` feature.
- **BREAKING**: watch: only struct rows are allowed because JSON requires names.
- query: queries with invalid URLs fail with `Error::InvalidParams`.
- watch: use `JSONEachRowWithProgress` because of [ClickHouse#22996] ([#23]).

[#23]: https://github.com/ClickHouse/clickhouse-rs/issues/23
[#22]: https://github.com/ClickHouse/clickhouse-rs/issues/22
[ClickHouse#22996]: https://github.com/ClickHouse/ClickHouse/issues/22996

## [0.8.1] - 2021-08-26
### Fixed
- Support `?` inside bound arguments ([#18]).
- Use the `POST` method if a query is bigger than 8KiB ([#19]).

[#19]: https://github.com/ClickHouse/clickhouse-rs/issues/19
[#18]: https://github.com/ClickHouse/clickhouse-rs/issues/18

## [0.8.0] - 2021-07-28
### Fixed
- `RowBinarySerializer::is_human_readable()` returns `false`.

## [0.7.2] - 2021-05-07
### Added
- `Watch::refresh()` to specify `REFRESH` clause.

### Fixed
- `derive(Row)`: handle raw identifiers.

## [0.7.1] - 2021-06-29
### Fixed
- Get rid of "socket is not connected" errors.

### Changed
- Set TCP keepalive to 60 seconds.

## [0.7.0] - 2021-05-31
### Changed
- Replace `reflection::Reflection` with `clickhouse::Row`. It's enough to implement `Row` for top-level `struct`s only.

### Added
- `#[derive(Row)]`

## [0.6.8] - 2021-05-28
### Fixed
- docs: enable the `doc_cfg` feature.

## [0.6.7] - 2021-05-28
### Fixed
- docs: show features on docs.rs.
- Now `test-util` implies `hyper/server`.

## [0.6.6] - 2021-05-28
### Added
- `test` module (available with the `test-util` feature).
- `#[must_use]` for `Query`, `Watch`, `Insert` and `Inserter`.

## [0.6.5] - 2021-05-24
### Added
- `&String` values binding to SQL queries.

## [0.6.4] - 2021-05-14
### Fixed
- Depend explicitly on `tokio/macros`.

## [0.6.3] - 2021-05-11
### Added
- Support for `bool` values storage ([#9]).
- `array`s' binding to SQL queries — useful at `IN` operators, etc ([#9]).
- `String` values binding to SQL queries ([#9]).
- `Query::fetch_all()`
- `sql::Identifier`

### Changed
- Expose `query::Bind` ([#11]).
- Deprecate `Compression::encoding()`.

[#11]: https://github.com/ClickHouse/clickhouse-rs/pull/9
[#9]: https://github.com/ClickHouse/clickhouse-rs/pull/9

## [0.6.2] - 2021-04-12
### Fixed
- watch: bind fileds of the type param.

## [0.6.1] - 2021-04-09
### Fixed
- compression: decompress error messages ([#7]).

[#7]: https://github.com/ClickHouse/clickhouse-rs/pull/7

## [0.6.0] - 2021-03-24
### Changed
- Use tokio v1, hyper v0.14, bytes v1.

## [0.5.1] - 2020-11-22
### Added
- decompression: lz4.

## [0.5.0] - 2020-11-19
### Added
- decompression: gzip, zlib and brotli.

## [0.4.0] - 2020-11-17
### Added
- `Query::fetch_one()`, `Watch::fetch_one()`.
- `Query::fetch()` as a replacement for `Query::rows()`.
- `Watch::fetch()` as a replacement for `Watch::rows()`.
- `Watch::only_events().fetch()` as a replacement for `Watch::events()`.

### Changed
- `Error` is `StdError + Send + Sync + 'static` now.

## [0.3.0] - 2020-10-28
### Added
- Expose cursors (`query::RowCursor`, `watch::{RowCursor, EventCursor}`).

## [0.2.0] - 2020-10-14
### Added
- `Client::inserter()` for infinite inserting into tables.
- `Client::watch()` for `LIVE VIEW` related queries.

### Changed
- Renamed `Query::fetch()` to `Query::rows()`.
- Use `GET` requests for `SELECT` statements.

## [0.1.0] - 2020-10-14
### Added
- Support basic types.
- `Client::insert()` for inserting into tables.
- `Client::query()` for selecting from tables and DDL statements.

<!-- next-url -->
[Unreleased]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.14.0...HEAD
[0.14.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.13.3...v0.14.0
[0.13.3]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.13.2...v0.13.3
[0.13.2]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.13.1...v0.13.2
[0.13.1]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.12.2...v0.13.0
[0.12.2]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.11.6...v0.12.0
[0.11.6]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.11.5...v0.11.6
[0.11.5]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.11.4...v0.11.5
[0.11.4]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.11.3...v0.11.4
[0.11.3]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.11.2...v0.11.3
[0.11.2]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.11.1...v0.11.2
[0.11.1]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.9.3...v0.10.0
[0.9.3]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.7.2...v0.8.0
[0.7.2]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.6.8...v0.7.0
[0.6.8]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.6.7...v0.6.8
[0.6.7]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.6.6...v0.6.7
[0.6.6]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.6.5...v0.6.6
[0.6.5]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.6.4...v0.6.5
[0.6.4]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.6.3...v0.6.4
[0.6.3]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.6.2...v0.6.3
[0.6.2]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ClickHouse/clickhouse-rs/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ClickHouse/clickhouse-rs/releases/tag/v0.1.0
