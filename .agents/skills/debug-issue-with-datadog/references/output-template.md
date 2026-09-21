# Output Template

The analysis should be structured so it can be pasted directly as the first
investigative comment on the Linear issue. The example to anchor on is the
first comment on `LFE-9475` (PostHog Integration Processing Failures).

Findings come first, recommendations last. If the data doesn't support a
hypothesis, say so — do not invent root causes to fill the template.

## Section Order

1. **Header** — data source, time window, scope of sweep.
2. **Volume & error-rate split** — table by region (always).
3. **Hotspots** — table by `(projectId, dominant cause)` or by cluster.
4. **Root cause by error class** — one numbered subsection per cluster.
5. **Suggested patches** — P0 / P1 / P2, each with file paths and a short
   code sketch.
6. **Dashboards** — Datadog UI URLs for the queries you ran.

## Skeleton (fill in with your findings)

````markdown
## Datadog APM + log analysis (<N>-day window, <YYYY-MM-DD> → <YYYY-MM-DD>)

Source: APM spans with `resource_name:"process <queue-name>"` across EU and US.

### Volume & error rate — <one-line summary of regional split>

| Region | Total spans | Errors | Error rate |
|---|---|---|---|
| EU (`prod-eu`) | <n> | <n> | **<pct>%** |
| US (`prod-us`) | <n> | <n> | **<pct>%** |

<One sentence explaining where the noise actually lives.>

### Hotspots — concentrated on ~<N> <region> projects

<Region> errors break down by `(projectId, error.message)`:

| ProjectId | Errors | Dominant cause |
|---|---|---|
| `<projectId>` | <n> | `<error message>` (<n>) + others |
| ...           | ... | ...                              |

<Optional: contrast with another subsystem if relevant — e.g.
"Unlike blob storage, PostHog has multiple distinct root causes — not one
hotspot pattern.">

## Root cause by error class

### 1. `<error message>` — <n> errors, <n> projects
<2–4 sentences explaining what this error class actually is at the
implementation level (which library, which call site). Then list candidate
causes in order of likelihood. Mark which ones are confirmed by the data
vs. speculative.>

### 2. `<error message>` — <n> errors, mostly <n> projects
<Same pattern.>

### 3. <next class>
<...>

### <N>. <Symptom of upstream failure>
<Use this slot when a class is a *symptom* of another class rather than an
independent bug — call it out so suggested patches don't double-count.>

## Suggested patches

### P0 — <one-line summary, e.g. "Auto-disable integrations on persistent
auth failures">
<Why this is P0 — what noise it kills, what data it stops corrupting, what
unblocks downstream work.>

```ts
// <relative path from repo root>
// Short code sketch (5–20 lines). It does not need to compile —
// it must communicate the shape of the change.
```

### P0 — <next P0>
<...>

### P1 — <smaller / less urgent fix>
<Same shape.>

### P2 — <separate-but-surfaced finding>
<E.g. a Prisma pool sizing issue surfaced incidentally by this analysis but
not the original bug. Call it out with its own section so it doesn't get
lost.>

### Regional split explanation (only if relevant)
<One paragraph explaining why EU vs. US asymmetry exists — usually not an
infra bug, just where the affected tenants happen to live.>

Dashboards:
- EU APM: <url>
- US APM: <url>
- (logs / metrics / monitor links as relevant)
````

## Style Rules

- Lead with numbers, not adjectives. "23.5% error rate" beats "very noisy".
- Distinguish **primary causes** from **symptoms** explicitly. Symptoms
  shouldn't get their own P0 patch.
- Always cite specific files when proposing a code change. A patch
  recommendation without `worker/src/features/<…>/<file>.ts` is unfinished.
- Code sketches are illustrative — clearly mark them as sketches if they
  hand-wave types. The next agent / human will write the real diff.
- If the analysis surfaces a finding *outside* the original ticket scope
  (e.g. a Prisma pool issue while debugging PostHog), include it as a P2
  with a sentence explaining it's separate.
- If the data refuses to converge on a single root cause, say so. The
  template handles N classes — use as many subsections as the data warrants.

## When To Skip Sections

- **Single-region deployments:** if the issue clearly affects only one
  region, you can replace the "Volume & error rate" table with a single-row
  variant, but still note that the other region was checked and clean.
- **No code change recommended:** if the only finding is "the affected
  tenants have misconfigured credentials and we should reach out", the
  Suggested-patches section can be a single sentence — but still include
  the dashboards.
- **Aborted investigation:** if Datadog access fails or the data is
  insufficient, write what you tried, what was missing, and what would let
  the next investigator pick it up.
