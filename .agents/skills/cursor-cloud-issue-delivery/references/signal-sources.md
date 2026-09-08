# Signal sources for investigation

During Phase 1, sweep **every read-only MCP tool** that is available in the run.
Do not stop at the issue text or Linear thread if other sources may hold evidence.

Use `GetMcpTools` to discover what is connected in this environment; tool lists
change with Cursor team configuration.

## Default sweep order

1. **Issue text** — GitHub issue, pasted report, or Cloud Agent task prompt.
2. **Linear** — originating issue, comments, linked issues, labels, attachments.
3. **GitHub** — related issues/PRs, CI logs, release notes if linked.
4. **Datadog EU / US** — logs, traces, metrics, monitors for the affected
   window. Follow `debug-issue-with-datadog` for production failures.
5. **incident.io** — incidents, alerts, follow-ups tied to the symptom. See
   `incident-alert-tickets` when an alert identity is known.
6. **Pylon** — customer threads, support context, reproduction notes.
7. **Slack** — channel history/search for internal reports or deploy chatter.
8. **PostHog** — product usage, funnels, or feature-flag exposure around the
   failure window.
9. **Sentry** — frontend error groups, release/regression context (when a Sentry
   MCP or issue link is available).
10. **Metabase** — cost or usage marts when the symptom is spend- or volume-related
    (`analyze-cloud-costs`).
11. **ClickHouse Cloud** — query/status reads when the symptom is datastore-
    specific in cloud environments.
12. **Google Drive / Circleback** — specs, RFCs, meeting notes, or customer
    write-ups linked from the ticket.
13. **Langfuse Docs MCP** — confirm intended product behavior before calling
    something a bug.

## Routing by symptom

| Symptom shape | Start with | Also check |
| --- | --- | --- |
| Production API / worker failure | Datadog + `debug-issue-with-datadog` | incident.io, Linear, Pylon |
| Frontend-only / layout bug | Code route + narrowest `AGENTS.md` | Sentry, PostHog, Slack |
| Customer report | Pylon + Linear | Datadog, Slack |
| Alert / page | incident.io + Datadog | `incident-alert-tickets`, Linear |
| Usage / cost spike | Metabase + Datadog | PostHog |
| "Works in docs" dispute | Langfuse Docs MCP | Linear, GitHub |

## Rules

- **Read-only only** — use MCP tools approved for search/read; do not post,
  comment, or mutate external systems during investigation (Linear handoff comes
  in Phase 7).
- **Record what you checked** — note each source queried and whether it returned
  signal or `none found`. Missing sweeps are investigation gaps.
- **No customer data in public artifacts** — support excerpts stay in the agent
  thread and Linear handoff; do not paste into GitHub PR bodies or commits.
