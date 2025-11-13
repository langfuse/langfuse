# Benchmarks

All cases are run with `cargo bench --bench <case>`.

## With a mocked server

These benchmarks are run against a mocked server, which is a simple HTTP server that responds with a fixed response.
This is useful to measure the overhead of the client itself.

### Scenarios

* [mocked_select](mocked_select.rs) checks throughput of `Client::query()`.
* [mocked_insert](mocked_insert.rs) checks throughput of `Client::insert()` and `Client::inserter()`
  (requires `inserter` feature).

### How to collect perf data

The crate's code runs on the thread with the name `testee`:

```bash
cargo bench --bench <name> &
perf record -p `ps -AT | grep testee | awk '{print $2}'` --call-graph dwarf,65528 --freq 5000 -g -- sleep 5
perf script > perf.script
```

Then upload the `perf.script` file to [Firefox Profiler].

## With a running ClickHouse server

These benchmarks are run against a real ClickHouse server, so it must be started:

```bash
docker compose up -d
cargo bench --bench <case>
```

### Scenarios

* [select_numbers.rs](select_numbers.rs) measures time of running a big SELECT query to the `system.numbers_mt` table.
* [select_nyc_taxi_data.rs](select_nyc_taxi_data.rs) measures time of running a fairly large SELECT query (approximately
  3 million records) to the `nyc_taxi_data` table using the [NYC taxi dataset].

### How to collect perf data

```bash
cargo bench --bench <name> &
perf record -p `ps -AT | grep <name> | awk '{print $2}'` --call-graph dwarf,65528 --freq 5000 -g -- sleep 5
perf script > perf.script
```

Then upload the `perf.script` file to [Firefox Profiler].

<!-- links -->

[Firefox Profiler]: https://profiler.firefox.com

[NYC taxi dataset]: https://clickhouse.com/docs/getting-started/example-datasets/nyc-taxi#create-the-table-trips