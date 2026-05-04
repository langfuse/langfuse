# Intake — What Are We Actually Investigating?

Goal: extract every signal from the input *before* you touch Datadog. Cheap
to do, expensive to skip — the wrong time window or wrong service tag can
hide the real cause.

## Source-by-Source Recipes

### Linear issue (URL or `LFE-XXXX` ID)

1. Fetch the issue via the Linear MCP:
   `mcp__d39d26f2-…__get_issue` with `id: "LFE-XXXX"` and
   `includeRelations: true`.
2. Fetch comments separately:
   `mcp__d39d26f2-…__list_comments` with the same `issueId`.
3. Note: Langfuse triages **inside the issue description**. The description
   often grows reaction sections (`projectId: <one-line note>`) as oncall
   investigates. Treat both description and comments as authoritative state.
4. Pull `attachments` for linked PRs/commits — these show what's already been
   tried. Reading the diff of a half-merged fix often reveals the original
   theory of the bug.
5. Pull labels (`integration-posthog`, `feat-exports`, etc.) — they map
   directly to the subsystem clusters in `repo-debug-map.md`.

### GitHub issue

1. `gh issue view <url-or-number> --json title,body,labels,comments,assignees`.
2. If there's a stack trace in the issue body, copy the top frames into your
   notes — those frames usually map straight to a handler file.

### Pasted error / incident text

1. Treat as the issue description. If it's a stack trace, identify:
   - the throwing module (handler vs. SDK vs. infra),
   - whether it looks like a *user-input* failure (HTTP 4xx, validation, auth)
     or an *infra* failure (5xx, timeout, OOM, DNS, pool exhaustion),
   - the error class (`Error`, `TypeError`, `PrismaClientKnownRequestError`,
     etc.).
2. If a `projectId` appears, that's gold — anchor every Datadog query on it.
3. If a `traceId` (Datadog's, not Langfuse's) appears, jump straight to
   `get_datadog_trace`.

## Extract The Following Before Querying

Build a small notes block. If a value is missing, mark it `?` rather than
guessing — Datadog will tell you what's missing.

- **Subsystem.** PostHog integration, blob-storage export, evaluation
  execution, OTel ingestion, batch action, webhook delivery, etc. Map to
  `repo-debug-map.md`.
- **Region(s).** `prod-eu` / `prod-us` / `prod-hipaa` / `prod-jp`. If unknown,
  query both EU and US.
- **Service.** Most issues are `service:worker`; UI/API timeouts are
  `service:web`. Check for both when unsure.
- **Time window.** Default to 7 days back from the issue's `createdAt`. If
  the issue references a specific incident or alert, use that window ±1 day.
- **`projectId`(s).** Project IDs in Langfuse are `cuid`-shaped
  (`cl…` / `cm…`, 25 chars). The reaction blocks in Linear descriptions
  often *are* lists of affected project IDs.
- **Error message fragments.** Exact substrings to grep for in DD logs:
  `Header overflow`, `Timeout error.`, `HTTP 403`, `DNS lookup failed`,
  `Cannot write to canceled buffer`, `connection pool`, etc.
- **Already-attempted fixes.** Linked PRs/commits on the issue. Read their
  diffs — your analysis must not re-recommend something that's already
  shipped.

## Output Of The Intake Step

A short bullet list (not yet formatted as the final analysis) with each of
the above filled in. The remaining steps key off this — `datadog-playbook.md`
expects subsystem + region + window, `repo-debug-map.md` expects subsystem,
and the output template wants the affected projects.
