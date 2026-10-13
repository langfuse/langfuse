# Review questions for query-AST migrations

Answer each question by default on every migration PR. The `scan-diff.mjs`
categories are given in brackets.

## 1. Is the tenancy scope a single project? [multi-project]

`compileClickhouseQuery(query, { projectId })` injects
`project_id = {projectId}` into every tenanted relation, so call sites never
filter `project_id` themselves. A multi-project read (for example
`projectIds`, `project_id IN`) does not fit that contract. It needs a stated
reason and an org-id guard proving that every project belongs to the caller's
organization. A hand-written `project_id` predicate at a call site is either
redundant or an attempt to widen the scope. Find out which.

## 2. Are all golden queries identical, or is every change justified?

Answer from `golden-equivalence.mjs`, not from the committed snapshot diff.
That diff is only a proof when a baseline-only commit came first and both
commits used the CI formatter.

## 3. Is there raw SQL inside the builder? [raw-sql]

`` sql`...` ``, `sql.raw`, and `sql.ref` bypass schema typing and the
tenancy pass's relation checks. For each hit, ask why the typed builder
(`eb.ref`, `eb.fn`, `$call(...)` helpers, a registry column) cannot express it.
Acceptable reasons: a SELECT alias that is not a schema column (`sql.ref`), or
an expression derived from a shared builder map that must stay single-sourced.
Splicing an interpolated value through `sql.raw` is never acceptable. Use a
bind.

## 4. Are there TypeScript escape hatches? [ts-escape]

For each `as never`, `as unknown as`, `as any`, or non-null `!`, name what it
hides. `.select([...] as never)` usually hides a selection that the schema
types do not know about, which means a missing registry column. A `!` inside
`$if(cond, …)` is usually safe, but check that the condition really narrows
the same value.

## 5. Do call sites handle infrastructure concerns? [infra-at-call-site]

`is_deleted = 0`, `FINAL`/`LIMIT 1 BY`, date conversion
(`convertDateToClickhouseDateTime`, `toDateTime64`), time-window arithmetic,
and derived expressions belong in the table registry, the dedup spec, or a
compiler pass. They do not belong in every product call site. Before moving an
expression across that boundary, check that the move preserves value types:
moving `- toIntervalDay(2)` from SQL into JS changes the bind from a string to
a `Date`.

## 6. Do changed comments still describe the code? [comments]

Read every added and removed comment line. Look for comments that describe the
legacy implementation, mention review history, or were edited in passing
outside the migrated function.

## Copied expressions [copied-expression]

A SQL fragment in a string literal inside a repository function is usually
copied from a builder map (`EVENTS_AGGREGATION_FIELDS`, field-set select
maps). Copies miss later fixes to the map. This is how the point-reads
migration (LFE-15573, PR #17550) lost the trace-latency NULL guard (#18330)
and the canonical column order (#17556). Derive the expression from the map
instead.
