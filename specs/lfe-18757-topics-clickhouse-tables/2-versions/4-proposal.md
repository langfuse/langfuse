# Version 4: proposal

Our alternative, compared against version 3, and the layout this evaluation recommends. DDL: [../1-migrations/4-proposal.up.sql](../1-migrations/4-proposal.up.sql). Queries use the version 2 fixes.

## Where it comes from

It started from the pre-review draft, `(project_id, facet_id, toDate(t), xxHash32 unit_hash, trace_id, ...)` for summaries and `(project_id, facet_id, rule_id, run, toStartOfHour(t), trace_id, ...)` for assignments. It keeps every review point that held up when measured:

- **Taken from the review:**
  - time first for summaries
  - the hash instead of the trace id at the end of the key (64-bit, so collisions don't merge rows)
  - `facet_version` before the hash
  - no projections
  - rule ids not LowCardinality
  - bloom granularity 1
  - a materialized view for lookups by trace
- **Changed against version 3, each measured:**
  - **A day bucket instead of a minute bucket.** One (day, facet) group spans many granules, so facet filters and the hash sample prune.
  - **The hash in the primary key.** `unit_hash < k` only prunes on primary key columns.
  - **Run (and topic) before time for assignments.** Every map read filters on one run, and a run's rows span the whole window.
  - **The MV serves trace to topic,** instead of summary pointers.
  - **No `rule_id` in the key, and bloom filters at 0.0001.** Both were tested after the call (see [../0-overview.md](../0-overview.md#follow-up-tests)).

## Tables

| Table | Primary key | Sort key | Extras |
|---|---|---|---|
| `topic_facet_summaries` | `(project_id, toDate(unit_start_time), facet_id, facet_version, unit_hash)` | same | blooms on `trace_id`, `session_id`; `rule_ids Array(String)`; no projection |
| `topic_assignments` | `(project_id, facet_id, clustering_run_id, topic_id, toStartOfHour(unit_start_time))` | adds `unit_hash` | blooms on `trace_id`, `session_id`; `rule_id` is a plain column |
| `topic_assignments_by_trace` | `(project_id, toStartOfMinute(unit_start_time), facet_id)` | adds `trace_id, session_id, rule_id, clustering_run_id` | bloom on `trace_id`; fed by `topic_assignments_by_trace_mv`; narrow (topic columns only) |

`unit_hash` is `UInt64 MATERIALIZED cityHash64(if(trace_id = '', session_id, trace_id))`. It covers traces and sessions, and it has to be a stored column: as a key expression it isn't used for pruning.

## Query rewrites on top of version 2

**Stable refit sample** (replaces "newest 16k"). This is a stable random sample over 7 or 30 days: deterministic per unit, so the same units are picked every night. Here `k = min(1, target / count) * 2^64`.

```sql
SELECT ... FROM topic_facet_summaries
WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
  AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}
  AND processing_state = 'complete' AND embedding_model = {embeddingModel:String} AND embedding.size0 = {embeddingDimensions:UInt32}
  AND unit_hash < {k:UInt64}
ORDER BY processed_at DESC LIMIT 1 BY trace_id, if(trace_id = '', session_id, '')
```

`unit_hash < k` reads less than `SAMPLE` (457 MiB vs 1.07 GiB in round 1), and `SAMPLE` would need `SAMPLE BY`.

No rule filter is needed on assignment reads: the run already implies the rule. With `rule_id` in the key and without, the same queries read the same or less (follow-up test).

<a id="tracing-table-topic-column"></a>**Tracing table topic column, latest placement in any run** (new semantics, see below):

```sql
SELECT trace_id, facet_id, topic_id, clustering_run_id FROM topic_assignments_by_trace
WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
  AND facet_id IN {facetIds:Array(String)} AND trace_id IN {traceIds:Array(String)} AND rule_id IN {ruleIds:Array(String)}
ORDER BY assigned_at DESC, origin DESC LIMIT 1 BY facet_id, rule_id, trace_id
```

Today's column reads only the current run, so a large project shows no topic for traces older than about a day: each nightly refit re-clusters a 0.4% sample. Reading the latest placement fixes that: 386 to 398 of the facet rows on a 100-trace page get a topic, against 0 from the current run on the 3-day-old page.

The lookup table keeps this cheap (28 MiB per page vs 199 MiB through the run-ordered table). It's a product decision; if we keep the current-run semantics, the lookup table can go.

## How it did (1M traces/day)

| Query | 1 main today | 3 review-call version | 4 proposal |
|---|---|---|---|
| Q07 / Q08 Topics page counts | 11.7 / 9.5 GiB | 11.7 / 2.1 GiB | 2.9 / 2.1 GiB |
| Q09 topic page candidates | 7.7 GiB | 1.75 GiB | 9 MiB |
| Q10 trace list resolve | 2.7 GiB | 151 MiB | 302 MiB |
| Q11 scatter summaries | 1.7 GiB | 3.0 GiB | 718 MiB |
| Q20 tracing table topic filter | 3.4 GiB | 845 MiB | 52 MiB |
| Q19L tracing table topic column, 100 traces | (current run: 25 MiB) | 33 MiB | 28 MiB |
| Q15 refit today | out of memory | 10.7 GiB | 4.7 GiB |
| Q15' stable 100k refit sample, 30 / 7 days | 258 / 61 GiB | 258 / 61 GiB | 1.4 GiB / 711 MiB |

**Costs:**
- Summary write time +12% against today.
- Assignments disk 12.9 GiB vs 8.1 GiB today: the stored hash, two bloom filters, and trace ids that compress worse when not sorted.
- The lookup table adds 6.4 GiB.

## Open before implementing

- The tracing table topic column semantics (above).
- How self-hosters with data in today's tables are handled (both migrations drop the tables).
- A calibration run of `main`'s queries on a read-only prod replica.
- **The implementation PR:**
  - writers: `rule_ids` on summaries, `rule_id` on assignments
  - the query fixes and rewrites
  - the refit sampling
  - the migration in `canonical/`
