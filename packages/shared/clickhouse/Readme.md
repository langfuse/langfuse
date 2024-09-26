# Local clickhouse queries and load tests

How to execute

- Install clickhouse via [brew](https://clickhouse.com/docs/en/install#macos-only-install-with-homebrew)
- Execute queries via the following command:
  ```sh
  clickhouse client \
  --password "clickhouse" \
  -u 'clickhouse' \
  -q "select count(*) from observations;"
  ```
- For benchmarks, use the following command:

  ```sh
  clickhouse benchmark \
    --password "clickhouse" \
    -u 'clickhouse' \
    -i 100 \
    < ./packages/shared/clickhouse/load/queries.sql
  ```

  More info [here](https://clickhouse.com/docs/en/operations/utilities/clickhouse-benchmark).

- Our clickhouse credentials in dev are:
  - Database: default
  - User: clickhouse
  - Password: clickhouse
