# Local clickhouse queries and load tests

How to execute

- Install clickhouse via [brew](https://clickhouse.com/docs/en/install#macos-only-install-with-homebrew)
- Execute queries via `./clickhouse local -q "select 1;"` or for benachmarks via `./clickhouse benchmark -p "clickhouse" -u 'clickhouse' -q "select 1" -i 100`. More info [here](https://clickhouse.com/docs/en/operations/utilities/clickhouse-benchmark)
- Our clickhouse credentials in dev are:

  - Database: default
  - User: clickhouse
  - Password: clickhouse

- Set
