# Tracelift

Tracelift receives the observations for each completed project/trace pair from the
trace-batch reader.

Enabled traces run through `detectTraceIssues` once, using raw observation fields
without transcript parsing or normalization. Each detected enum is written as a
trace-level issue by `writeTraceliftIssues`; traces with no detected issues write
no rows. The timestamp records detection time. Reprocessing a trace appends another
set of detections. Processing failures are caught by the batch hook so transcript
processing can continue.

## Enablement

Set these variables on the worker and restart it:

```sh
LANGFUSE_TRACELIFT_ENABLED=true
LANGFUSE_TRACELIFT_ENABLED_PROJECT_IDS=project-a,project-b
```

- `LANGFUSE_TRACELIFT_ENABLED` defaults to `false`.
- `LANGFUSE_TRACELIFT_ENABLED_PROJECT_IDS` is a comma-separated allowlist. Entries
  are trimmed and empty entries ignored. An unset or empty list admits no projects.

Both conditions must pass before Tracelift processes a trace. Disabling Tracelift
or removing a project from its allowlist skips Tracelift while the batch continues.
