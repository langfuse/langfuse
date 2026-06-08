# Production Environments

Langfuse production deploys cover these environments and services. The deploy
matrix is defined in `.github/workflows/deploy.yml`.

| Environment | Primary Datadog site | Common services |
| --- | --- | --- |
| `prod-us` | US, `datadoghq.com` | `web`, `web-ingestion`, `web-iso`, `worker`, `worker-cpu` |
| `prod-eu` | EU, `datadoghq.eu` | `web`, `web-ingestion`, `web-iso`, `worker`, `worker-cpu` |
| `prod-hipaa` | US, `datadoghq.com` | `web`, `web-ingestion`, `web-iso`, `worker`, `worker-cpu` |
| `prod-jp` | US, `datadoghq.com` | `web`, `web-ingestion`, `web-iso`, `worker`, `worker-cpu` |

The site mapping is a starting point, not proof. For cross-region research, run
a small count or facet query on both Datadog sites before saying an environment
has no data.

## Starter Filters

Use these as first-pass filters, then add the subsystem-specific route, queue,
tenant, or error facets.

```text
env:prod-us
env:prod-eu
env:prod-hipaa
env:prod-jp
```

```text
env:<env> (service:web OR service:web-ingestion OR service:web-iso)
env:<env> (service:worker OR service:worker-cpu)
```

For HTTP routes, start with `service:web` or `service:web-ingestion` depending
on the endpoint. For queue consumers, start with `service:worker` and
`service:worker-cpu`.

## Cross-Site Rule

When a query returns zero:

1. Check the time window and spelling of `env`, `service`, and route/resource.
2. Query facets on the same site for `env` and `service`.
3. Repeat a small count query on the other Datadog site.
4. Only then report "No measurements found".
