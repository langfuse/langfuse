# Verify Clickhouse Records

This script is used to compare Clickhouse records to our Postgres records.
Per default, it draws a sample of observations, traces, and scores from the Postgres
tables and executes single queries on Clickhouse to compare the individual fields.
It is possible to overwrite the selection process using the overwriteIds per type.

## Usage

To compare the records configure the database environment variables and afterward
execute the script.
Modify the `DATE_START` setting in the script to a date after the clickhouse sync was in place.
Set `ITERATIONS` based on the number of records that you want to validate. We sample 100 records per kind
in each iteration.

```bash
# Insert postgres database URL
export DATABASE_URL=
export CLICKHOUSE_URL=
export CLICKHOUSE_USER=
export CLICKHOUSE_PASSWORD=

cd worker/src/scripts/verifyClickhouseRecords

npx ts-node index.ts
```

The script writes the objects and deltas into the `output` folder within the current working directory.
Use it to validate whether Clickhouse and Postgres produce equal results.

## Known Issues

### Numeric values

Postgres seems to retain a higher precision for floating point numeric numbers.
In the object comparisons this frequently leads to false positives in the 10^-8 range.