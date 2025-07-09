# Replay failed ingestion events from S3

In case the Langfuse or ClickHouse processing fails in any way, we can replay messages from S3 using the access logs or similar.

## 1. Retrieve events to be replayed

The best way to identify the events to be replayed is to use the S3 access logs and query them using Athena.
Alternatively, you need to identify all events written within the relevant period and manually create a CSV file which matches
the S3 Access Logs via Athena format.
See [S3 docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-s3-access-logs-to-identify-requests.html) for more details.

Use the following query to generate a suitable CSV file:
```sql
select operation, key
from mybucket_logs
where operation = 'REST.PUT.OBJECT'
AND parse_datetime(requestdatetime,'dd/MMM/yyyy:HH:mm:ss Z')
    BETWEEN parse_datetime('2025-07-09:00:30:00','yyyy-MM-dd:HH:mm:ss')
    AND parse_datetime('2025-07-09:07:45:00','yyyy-MM-dd:HH:mm:ss')
    limit 50
```

Or provide your own file. It is expected that it adheres to the following format:
```csv
"operation","key"
"REST.PUT.OBJECT","projectId/type/eventBodyId/eventId.json"
...
```

Make sure to place the csv file as `./worker/events.csv` in the langfuse repo.

## 2. Connect to your Redis instances from your local machine

Create a suitable .env file in your repository root with Redis connection settings, e.g.
```
# Relevant
REDIS_CONNECTION_STRING=redis://:myredissecret@127.0.0.1:6379

# Necessary for parsing the file and starting the script
LANGFUSE_S3_EVENT_UPLOAD_BUCKET=langfuse
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=clickhouse
CLICKHOUSE_PASSWORD=clickhouse
```

## 3. Execute the migration

Run `pnpm run --filter=worker refill-ingestion-events` from the repository root.

In case the migration fails due to an invalid string length, you can split the events file into multiple parts using `split -l $(($(wc -l < events.csv) / 4)) events.csv part_`.
Rename the created parts and process them one by one.
Make sure to update the header for each.
Keep the total size around 150MB per events.csv.
