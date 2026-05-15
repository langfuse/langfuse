# Public API Tenant Usage

Use this recipe when checking whether an org or project calls a public API
route, including legacy endpoints such as:

- `/api/public/traces`
- `/api/public/traces/<traceId>` (`/api/public/traces/[traceId]` in Next.js)
- `/api/public/observations`
- `/api/public/observations/<observationId>`
  (`/api/public/observations/[observationId]` in Next.js)
- `/api/public/metrics`

Migrated endpoints commonly include:

- `/api/public/v2/observations`
- `/api/public/v2/metrics`
- `/api/public/otel/v1/traces`

## Why Correlation Is Needed

Public API auth attaches tenant attributes to the `api-auth-verify` child span:

- `@langfuse.project.id`: project-scoped API key target.
- `@langfuse.org.id`: owning org or org-scoped key target.
- `@langfuse.org.plan`: plan when present.

The HTTP route is on the request root span, usually in `http.path_group`,
`http.route`, `http.target`, or `resource_name`.

Because tenant tags and route tags often live on different spans in the same
trace, do not expect this single-span query to work:

```text
@langfuse.project.id:<id> @http.path_group:/api/public/observations
```

## Per-Tenant Endpoint Recipe

1. Aggregate auth spans for the tenant to confirm the identifier and active
   projects.

```text
env:<env> @langfuse.org.id:<orgId> resource_name:api-auth-verify
env:<env> @langfuse.project.id:<projectId> resource_name:api-auth-verify
```

Group by `service`, `@langfuse.project.id`, and optionally a daily interval.

2. Fetch representative matching auth spans with `search_datadog_spans`.
   Include custom attributes such as `langfuse.*`, then copy representative
   `traceid` values.

3. Open those traces with `get_datadog_trace`. Request service-entry spans and
   include HTTP and Langfuse attributes:

```text
only_service_entry_spans: true
extra_fields: ["http.*", "next.*", "langfuse.*"]
```

4. Read the request root span's `http.path_group`, `http.route`,
   `http.target`, and `resource_name` to identify the endpoint.
   ID lookup routes may appear with the concrete ID in `http.target` or with
   the normalized Next.js route, such as
   `/api/public/traces/[traceId]` or
   `/api/public/observations/[observationId]`.

5. Repeat across all relevant prod environments and both Datadog sites when the
   user asks for a global answer.

Treat per-tenant endpoint results as sampled unless you have an unsampled
metric or log source with tenant and route on the same event.

## Fleet-Level Endpoint Volume

For endpoint volume without tenant scoping, aggregate request spans directly:

```text
env:<env> service:web resource_name:"GET /api/public/observations*"
env:<env> service:web resource_name:"GET /api/public/observations/*"
env:<env> service:web resource_name:"POST /api/public/traces*"
env:<env> service:web resource_name:"GET /api/public/traces/*"
env:<env> service:web resource_name:"POST /api/public/metrics*"
```

Use route facets where available:

```text
env:<env> service:web @http.path_group:/api/public/observations
env:<env> service:web @http.path_group:/api/public/observations/*
env:<env> service:web @http.path_group:/api/public/observations/[observationId]
env:<env> service:web @http.route:/api/public/observations
env:<env> service:web @http.route:/api/public/observations/[observationId]
env:<env> service:web @http.path_group:/api/public/traces/[traceId]
env:<env> service:web @http.route:/api/public/traces/[traceId]
```

If route facets and resource names disagree, fetch a few traces and inspect the
root span before reporting the result.
