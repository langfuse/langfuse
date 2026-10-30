# Public ingestion

Public ingestion accepts a trace-create event on the project API and then
returns that trace from the read API.

## Sub-features

- `ingest-accept` returns HTTP 207 with the event in `successes`.
- `ingest-read` returns the same trace id from `GET /api/public/traces/:id`.

## How to get to it (user POV)

- `POST http://127.0.0.1:3000/api/public/ingestion` with HTTP basic auth.
- Username `pk-lf-1234567890`, password `sk-lf-1234567890`, the seeded key
  pair.
- `GET http://127.0.0.1:3000/api/public/traces/<traceId>` with the same auth.

## Driving it with the Langfuse harness

Preconditions:

- `scripts/doctor.sh` exited 0.
- The seeded API key exists. Worker health is `ok`, because the read path
  waits on ingestion processing.

- **Accept a trace.** POST a batch with one `trace-create`. Use a new id
  for both the event id and the trace id. HTTP status is 207,
  `successes` has one entry, and `errors` is empty.
- **Read it back.** GET `/api/public/traces/<traceId>` with the same basic
  auth. Poll for up to 30 seconds. The JSON `id` equals the trace id sent
  in the batch.
- **Proof.** Save both response bodies. The accept body shows 207 and an
  empty `errors` array. The read body shows the same id.

Example body, with ids replaced per run:

```json
{
  "batch": [
    {
      "id": "<event-uuid>",
      "type": "trace-create",
      "timestamp": "<ISO-8601>",
      "body": {
        "id": "<trace-uuid>",
        "timestamp": "<ISO-8601>",
        "name": "verify-changes"
      }
    }
  ]
}
```

```bash
curl --silent --show-error --write-out '\nhttp_status=%{http_code}\n' \
  --user 'pk-lf-1234567890:sk-lf-1234567890' \
  --header 'content-type: application/json' \
  --data @trace.json \
  http://127.0.0.1:3000/api/public/ingestion
```

## Gotchas

- Success is HTTP 207, not 200. A 207 with a non-empty `errors` array did
  not accept the event.
- The GET can 404 while the worker is still writing. Poll. A 207 with an
  empty `errors` array is acceptance; a still-404 after 30 seconds is a
  failed read-back, reported separately.
- Do not reuse a trace id from an earlier run. The read would pass even
  when this POST failed.
