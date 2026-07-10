# Evaluator Setup v2 — Data Model & Migration Plan

Working document for the schema evolution behind the v2 evaluator setup UX
(gallery → unified setup screen → shared run scopes). Two approaches are laid
out in full so we can iterate: **C** (minimal: shared scopes via dual-write)
and **D** (entity collapse: `eval_templates` becomes `evaluators`).

Naming used throughout:

| UX term          | Meaning                                                        |
| ---------------- | -------------------------------------------------------------- |
| Catalog          | Langfuse/partner-maintained evaluator definitions (gallery)    |
| Evaluator        | A project's configured, runnable evaluator (prompt/code + mapping + model + score output + name/description) |
| Run scope        | Reusable targeting: data source (trace/observation/experiment) + filter + sampling, shared across evaluators |
| Attachment       | The link "this evaluator runs on this scope" (+ status)        |

---

## 0. Production schema today (before any of this)

```
worker/src/constants/managed-evaluators.json
   │  seeded by upsertManagedEvaluators (fixed IDs, updated in place!)
   ▼
eval_templates                              job_configurations
┌──────────────────────────┐               ┌────────────────────────────────────┐
│ id, project_id (NULL =   │  1         N  │ id, project_id, status, job_type   │
│   Langfuse/partner row)  │◄──────────────│ eval_template_id (SetNull FK)      │
│ name, version            │               │                                    │
│ type LLM_AS_JUDGE|CODE   │               │ definition-ish:                    │
│ prompt, vars             │               │   score_name                       │
│ model, provider,         │               │   variable_mapping  ← mixed in     │
│   model_params           │               │                                    │
│ output_schema            │               │ targeting:                         │
│ source_code(+language)   │               │   target_object, filter,           │
└──────────────────────────┘               │   sampling, delay, time_scope      │
  mutable: versions, clone/                └───────────────┬────────────────────┘
  upgrade flows, in-place                                  │ 1..N
  managed updates                          ┌───────────────▼───────────┐
                                           │ job_executions (history)  │
                                           └───────────────────────────┘

WORKER READS (both from job_configurations):
  scheduling (per ingested trace): filter, sampling, target_object, status
  execution  (per job):            variable_mapping + joined template row
                                   (prompt/model/output — join exists today)
```

Problems this model causes for the v2 UX:

- One `job_configurations` row mixes three concerns (definition, targeting,
  attachment). No sharing of targeting across evaluators.
- Templates are N:1-referenced and mutable (version upgrades, in-place managed
  updates) → template↔config breakage class (block/remap machinery exists to
  cope with it).
- `variable_mapping` sits on the config although it is conceptually part of
  the evaluator definition.

---

## Approach C — minimal: shared run scopes via dual-write

*Status: implemented on this branch (prototype).*

### Schema changes (all additive)

```sql
CREATE TABLE eval_run_scopes (
  id, project_id FK, name (unique per project),
  target_object, filter JSONB, sampling, delay, time_scope,
  created_at, updated_at
);
ALTER TABLE job_configurations ADD COLUMN run_scope_id TEXT NULL
  REFERENCES eval_run_scopes ON DELETE SET NULL;
ALTER TABLE job_configurations ADD COLUMN description TEXT NULL;
```

### Diagram

```
eval_templates (unchanged)          job_configurations                    eval_run_scopes  (NEW)
┌──────────────────┐               ┌───────────────────────────────┐     ┌─────────────────────────┐
│ catalog rows +    │  1        N  │ eval_template_id              │ N   │ id, project_id          │
│ user templates    │◄─────────────│ score_name, description (NEW) │────►│ name (unique/project)   │
│ (copy-on-write    │              │ variable_mapping              │0..1 │ target_object           │
│  forks from v2 UI)│              │ target_object, filter,        │     │ filter, sampling,       │
└──────────────────┘               │ sampling, delay, time_scope   │     │ delay, time_scope       │
                                   │   ▲ materialized COPY of the  │     └─────────────────────────┘
                                   │   │ scope's values            │
                                   └───┼───────────────────────────┘
                                       │
        DUAL-WRITE: every scope create/update writes the scope row AND
        copies filter/sampling onto every attached config (one transaction).
        The worker keeps reading configs — it never learns scopes exist.
```

### Semantics

- **Sharing works**: `updateRunScope` = transactional fan-out
  (`UPDATE eval_run_scopes` + `updateMany job_configurations WHERE run_scope_id`),
  then eval-config cache invalidation. "Edit scope → all evaluators adapt."
- **Worker/API/caches untouched**, byte for byte. `run_scope_id = NULL` is a
  permanently supported state (public API / SDK keep creating scope-less
  configs unless extended).
- **Templates**: v2 UI is copy-on-write — editing prompt/model/output forks a
  project-owned template 1:1 with the evaluator; unmodified catalog picks
  reference the managed row (optional hardening: always fork).
- **Mapping stays on the config**: fine because evaluator ≡ config (1:1) in
  the v2 flow; "mapping on the definition" is a presentation-layer statement.

### Known weaknesses (accepted, guarded, or deferred)

1. **Drift through side doors**: v1 edit dialog / public API can edit a
   config's filter directly → silently diverges from its scope. Guard:
   reject/redirect direct targeting edits when `run_scope_id` is set
   (app-level). Structural fix only in D's read-through.
2. **Dual-write discipline**: every future writer of targeting must fan out.
   Mitigated by a single tRPC choke point.
3. **Template N:1 hazards remain** (in-place managed updates, v1 upgrade
   flows) — pre-existing, not worsened.

### Data migration

**None required.** Legacy configs keep working with `run_scope_id = NULL`.
Optional cosmetics to populate the Run Scopes tab:

| Option           | What                                              | Verdict |
| ---------------- | ------------------------------------------------- | ------- |
| Adopt-on-edit    | Offer "save as scope" when a legacy config is edited in v2 | default |
| 1:1 backfill     | One scope per legacy config, named after it       | safe, run if empty tab annoys |
| Dedup backfill   | Group identical (target, filter, sampling)        | **never** — manufactures sharing nobody opted into ("update for all" then bites) |

---

## Approach D — entity collapse: `eval_templates` → `evaluators`

Key decision that unlocks this: **the catalog stops being DB rows.** The
managed templates already live in `managed-evaluators.json`; the gallery serves
them from code, and picking one **always copies** into the project. With the
catalog out, every remaining `eval_templates` row is project-owned and can be
1:1 with its config — i.e. it *is* the evaluator.

### End-state diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CATALOG (code, not DB): managed-evaluators.json → gallery via tRPC          │
│ "Use this evaluator" ALWAYS copies into the project                          │
└──────────────┬──────────────────────────────────────────────────────────────┘
               │ copy at creation
               ▼
evaluators (= eval_templates,            eval_run_scopes
 project-owned only, 1:1 with            ┌─────────────────────────┐
 its attachment)                         │ id, project_id          │
┌───────────────────────────┐            │ name (unique/project)   │
│ id, project_id (NOT NULL) │            │ target_object           │
│ name, version (=edit      │            │ filter, sampling,       │
│   history, optional)      │            │ delay, time_scope       │
│ type LLM_AS_JUDGE | CODE  │            └───────────┬─────────────┘
│ prompt, vars              │  1                     │ 1
│ model, provider, params ✓ │◄──────┐                │
│ output_schema ✓           │       │ 1:1            │ N
│ source_code(+language) ✓  │       │   ┌────────────▼──────────────────────┐
│ + variable_mapping  ★moved│       └───│ job_configurations (= attachment) │
│ + description       ★moved│           │ evaluator_id (old eval_template_id│
└───────────────────────────┘           │   FK, unchanged!)                 │
  ✓ = column already exists             │ run_scope_id, status, job_type    │
  ★ = moved from config                 │ score_name (stays: score identity)│
                                        │ targeting columns: kept &         │
                                        │   dual-written (C model) OR       │
                                        │   dropped in optional phase D2    │
                                        └────────────┬──────────────────────┘
                                                     │ 1..N
                                        ┌────────────▼───────────┐
                                        │ job_executions         │
                                        │ (untouched, history    │
                                        │  survives as-is)       │
                                        └────────────────────────┘

WORKER READS:
  scheduling: config.filter/sampling (unchanged; optional D2 flips to scope join)
  execution : config → evaluator row (prompt, ★mapping, model, output)
              — this join already exists today for the prompt
```

### What D buys

- Mapping lives on the definition (original design instinct) without a new
  table — the FK, the join, and the model-override columns already exist.
- Templates immutable-by-construction for users: "config breaks template" /
  "template breaks config" becomes unrepresentable; catalog updates ship as
  code releases, killing the in-place managed-update hazard and the seeding job.
- v1 "Evaluator Library" ambiguity dissolves (it becomes "your evaluators").
- Public unstable APIs map 1:1: `evaluators` ↔ evaluators,
  `evaluation-rules` ↔ attachments.

### What D costs / decisions to iterate on

- **Deliberate template sharing dies** — N evaluators from one catalog item
  each carry a prompt copy (prompts are small; semantic choice, not plumbing).
- **1:1 exclusivity is app-enforced** (schema can't say "referenced by exactly
  one config"); all creation paths incl. public API must create the pair.
- **Versioning semantics**: keep `(name, version)` as per-evaluator edit
  history (recommended; upgrade/remap flows shrink to self-history), or
  flatten to mutable rows and delete that machinery later.
- **`score_name` placement**: proposal keeps it on the attachment (it's the
  score identity per running instance); could move to the evaluator — decide.

### Transition plan (release-by-release)

Honest framing: rolling deploys mean *any* strategy (including classic
dual-writes) has a minutes-long window where an old container's write can be
shadowed. This plan uses **fallback reads + an idempotent, re-runnable
backfill in the migration chain** instead of dual-writing the moved columns.

**Self-hoster constraint (hard requirement):** upgrades may jump many releases
at once, and migrations apply *before* new containers start. Therefore:

- Every data move is a migration-chain member (SQL data migration or a
  worker **background migration**, as used for the events backfill) — never an
  operator-run script.
- The destructive release **gates on the backfill**: its startup migration
  asserts the background migration completed and otherwise fails with an
  actionable error ("upgrade to ≥ vB first"), same pattern as the v2→v3
  ClickHouse moves. Zero-downtime holds for fleets already ≥ B; jumping across
  the contract boundary from < B is a documented restart upgrade.

**Release A — expand (additive only; old code indifferent).**
1. Ship C's schema if not present: `eval_run_scopes` + `run_scope_id` (✅ on branch).
2. `ALTER TABLE eval_templates ADD variable_mapping JSONB NULL, ADD description TEXT NULL`.
3. Product changes that need no further schema: v2 UI with dual-write scopes
   (✅), gallery from JSON catalog, always-fork on create.

**Release A/B boundary — backfills (in the migration chain, idempotent).**
4. **Evaluator fork-backfill (mandatory prerequisite for B):** per config —
   template project-owned *and* exclusively referenced → copy the config's
   mapping/description onto it; else (managed ref or shared template) → insert
   a project-owned fork carrying template content + this config's mapping,
   repoint `eval_template_id`. Per-row transactions; resumable; zero runtime
   impact (nothing reads the new columns yet). Result: 1:1 invariant holds.
5. **Scope backfill (optional):** 1:1 variant only (see C table above).

**Release B — the flip (readers first ⇒ moved columns are written once).**
6. Readers: worker `evaluate()` + web/API read mapping/description via
   `COALESCE(evaluator.col, config.col)` — covers rows created by old
   containers during the rolling window and any straggler.
7. Writers: create/edit paths write the evaluator row **only**; every creation
   creates the config+evaluator pair (incl. public API). Decide: legacy API
   auto-creates a 1:1 scope, or leaves `run_scope_id NULL`.
8. Scope side-door guards: direct targeting edits on scope-attached configs
   rejected (or auto-detach); `updateRunScope` fan-out is the single targeting
   edit path for scoped evaluators.
9. Cloud only: re-run backfill 4 after rollout (idempotent reconcile — absorbs
   the rolling window; a no-op on single-node self-hosts).

**Release C — contract (destructive; gated).**
10. Startup gate: assert backfill 4 completed.
11. Drop `job_configurations.variable_mapping`, `.description`; remove COALESCE fallbacks.
12. Delete `project_id IS NULL` template rows (nothing references them after 4);
    retire `upsertManagedEvaluators`.
13. Prisma model rename `Evaluator` with `@@map("eval_templates")`; physical
    `ALTER TABLE ... RENAME` is optional cosmetics for a later release (breaks
    older clients, so it must trail again if done).

**Release D2 — optional scope read-flip (independent; any time after B, or never).**
14. Prerequisite: every config has a scope (mandatory 1:1 scope backfill + API
    auto-create). Worker scheduling reads filter/sampling via scope join with
    fallback to config columns; D2+1 drops
    `filter/sampling/target_object/delay/time_scope` from `job_configurations`
    → the pure attachment row. This is where "edit scope → all adapt" becomes
    structural instead of fan-out; until then C's dual-write is behaviorally
    equivalent.

### In-flight jobs & caches (why each phase is safe)

- `JobExecutions` (pending/delayed) re-load their config **at execution time**;
  rows never disappear and carry valid values in every phase (fallback reads in
  B, moved values in C).
- Queued batch-backfill jobs (timeScope EXISTING) embed filter snapshots in
  their payloads — schema-independent.
- Redis eval-config caches hold serialized configs: bump the cache key
  namespace in the release that changes the read shape (B, and D2 if taken).

---

## Comparison

|                                | C (dual-write scopes)         | D (collapse)                              |
| ------------------------------ | ----------------------------- | ----------------------------------------- |
| Schema                         | 1 table + 2 columns           | + 2 columns on eval_templates; later −2 on configs, catalog rows deleted |
| Data migration                 | none (optional 1:1 scopes)    | mandatory fork-backfill (in migration chain) |
| Worker changes                 | none                          | one read-flip in `evaluate()` (join exists) |
| Public API changes             | optional guards               | creation paths must create pairs; guards  |
| "Edit scope → all adapt"       | yes (transactional fan-out)   | same (fan-out) until D2 makes it structural |
| Drift possible                 | yes → app guards              | targeting: same until D2; definition: no  |
| Template breakage class        | remains (pre-existing)        | eliminated                                |
| Releases to land               | 1                             | 3 (A, B, C) + optional D2                 |
| Self-host skip-jump handling   | n/a                           | backfill in chain + gated contract release |

**Recommendation:** C is shipped and sufficient for the prototype/UX
validation. D is the graduation migration if v2 becomes the product — C
forecloses none of it, and C's denormalized data is exactly what makes D's
backfill mechanical.

## Open questions (to iterate)

1. Always-fork vs reference-unmodified-catalog in the window before D lands?
2. `score_name` on evaluator vs attachment?
3. Keep `(name, version)` edit history on evaluators or flatten?
4. Legacy/public API: auto-create 1:1 scopes on config creation, or keep
   `run_scope_id NULL` as a supported state forever?
5. Physical table rename `eval_templates` → `evaluators`: worth the extra
   trailing release, or keep `@@map` indefinitely?
