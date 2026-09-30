# Tracelift

Tracelift receives the observations for each completed project/trace pair from the
trace-batch reader.

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
