# Evaluator Setup v2 — Data Model Migration

Terms: **catalog** = Langfuse/partner definitions (`managed-evaluators.json`);
**evaluator** = project-owned definition (prompt/code, variable mapping, model,
score output, name/description); **run scope** = shared targeting
(`target_object`, `filter`, `sampling`, `delay`, `time_scope`);
**attachment** = evaluator ↔ scope + status.

## Current Data Model

```
managed-evaluators.json ──seeded by upsertManagedEvaluators──┐ (fixed IDs,
                                                             ▼  updated in place)
eval_templates                              job_configurations
┌──────────────────────────┐               ┌────────────────────────────────────┐
│ id, project_id (NULL =   │  1         N  │ id, project_id, status, job_type   │
│   catalog row)           │◄──────────────│ eval_template_id                   │
│ name, version            │               │ score_name                         │
│ type LLM_AS_JUDGE|CODE   │               │ variable_mapping    ← definition   │
│ prompt, vars             │               │ target_object, filter, sampling,   │
│ model/provider/params    │               │ delay, time_scope   ← targeting    │
│ output_schema            │               └───────────────┬────────────────────┘
│ source_code(+language)   │                               │ 1..N
└──────────────────────────┘               job_executions (history)
  mutable: versions, clone/upgrade,
  in-place managed updates

WORKER: scheduling reads config targeting; execution reads config mapping
        + joined template row (prompt/model/output).
```

Problems: one config row mixes definition, targeting, and attachment — no
targeting reuse; templates are N:1-referenced **and mutable** (upgrade/remap/
block machinery exists to cope); mapping sits on the config although it is
part of the definition.

## New Data Model

### Option A: Keep old data model (more or less)

Keep data model as is. Add new table to allow re-using run scopes.

```
eval_templates (unchanged)      job_configurations                  eval_run_scopes (NEW)
┌────────────────┐             ┌────────────────────────────┐      ┌────────────────────┐
│ catalog + user  │  1      N  │ eval_template_id           │      │ id, project_id     │
│ rows, N:1 refs  │◄───────────│ score_name                 │  N   │ name (unique/proj) │
└────────────────┘             │ variable_mapping           │─────►│ target_object,     │
                               │ + run_scope_id   (NEW FK)  │ 0..1 │ filter, sampling,  │
                               │ + description    (NEW)     │      │ delay, time_scope  │
                               │ targeting cols =           │      └────────────────────┘
                               │   materialized COPY ◄──────┼── dual-write on every
                               └────────────────────────────┘   scope create/update
```

- Add a `eval_run_scopes` table to enable re-using filters across evaluators.
  - Whenever a scope is updated, we need to also update all matching `job_configurations`.
- Schema changes elsewhere limited to `job_configurations`: new `run_scope_id` FK + new `description` column
- Turn all eval templates into standalone templates. Then remove managed templates from table (removal only in the NEXT major — old-app create paths still reference them by id during the window).
  - duplicate re-used user templates so that there is a 1:1 mapping with job configuration
  - turn managed templates into proper user evaluators
- Scope backfill: migrate all existing job configurations to deduplicated `eval_run_scopes`
  - ⚠ dedup couples evaluators whose filters merely coincide — a later "update for all" then hits both; 1:1 scopes are the safe default
- every edit of the evaluator will need to touch both tables (`eval_templates` + `job_configurations`)
- new job configurations need to be added to `eval_run_scopes` table

#### Migration Edge cases

**New template with old app created _after_ migration ran**

- New job configuration not reflected in `eval_run_scopes` and hence can't be re-used (low severity -> ignore)
- Editing an evaluator (job config + template) changes an other evaluator (needs handling)
  - check if template referenced by other job configuration -> deduplicate to avoid side effect

**Template edited with old app after migration ran**

- Needs to open template before migration an submit edit _after_ migration -> very small window
- Change only reflected for one evaluator instead of multiple ones (low severity -> ignore)

**Job configuration edited with old app after migration ran**

- New job configuration not reflected in `eval_run_scopes` and hence can't be re-used (low severity -> ignore)

### Option B — `eval_templates` becomes `evaluators`

- Add a `eval_run_scopes` table to enable re-using filters across evaluators.
- Migrate `variable_mapping` onto `eval_templates`
- Turn all eval templates into standalone templates. Then remove managed templates from table (removal only in the NEXT major — old-app create paths still reference them by id during the window).
  - duplicate re-used user templates so that there is a 1:1 mapping with job configuration
  - turn managed templates into proper user evaluators
- Scope backfill: migrate all existing job configurations to deduplicated `eval_run_scopes`
  - ⚠ dedup couples evaluators whose filters merely coincide — a later "update for all" then hits both; 1:1 scopes are the safe default
- Workers read scope from `eval_run_scopes` - only if no `eval_run_scope` exists they fall back to the legacy columns.
  Ideally, they fix the scope upon read. This means we reach eventual consistency.

```
managed-evaluators.json (catalog, code-only; picking = copy into project)
        │
        ▼
evaluators (= eval_templates,          eval_run_scopes (NEW)
 project-owned only)                   ┌─────────────────────────┐
┌───────────────────────────┐          │ id, project_id          │
│ id, project_id (NOT NULL) │          │ name (unique/project)   │
│ name                      │          │ target_object, filter,  │
│ type LLM_AS_JUDGE | CODE  │          │ sampling, delay,        │
│ prompt, vars              │          │ time_scope              │
│ model/provider/params ✓   │          └───────────┬─────────────┘
│ output_schema ✓           │  1                   │ 1
│ source_code ✓             │◄─────┐               │
│ + variable_mapping  ★     │      │ 1:1           │ N
│ + description       ★     │      │  ┌────────────▼──────────────────────┐
└───────────────────────────┘      └──│ job_configurations (= attachment) │
  ✓ exists  ★ moved from config       │ evaluator_id (old eval_template_id│
                                      │   FK — unchanged), run_scope_id,  │
                                      │ score_name, status                │
                                      └────────────┬──────────────────────┘
                                                   │ 1..N
                                      job_executions (untouched)

WORKER: scheduling reads the scope; execution reads config → evaluator row
        (join exists today).
```

#### Migration Edge Cases

With the rollout strategy below, all cases in this section are confined to
**cloud rolling-deploy windows (minutes per deploy)** and to self-hosters who
skip the recommended maintenance window. None require permanent handling: the
sentinel is the only must-have (money, not consistency), everything else is
accepted and self-heals via repair-on-read + the post-deploy sweep.


**New template with old app created _after_ migration ran - no job config**
Consequence:

- Template missing variable mapping and has no job configuration (low)
- Evaluator is inactive and not running - expected state

Resolution:
If evaluator edited with new app, insert new job configuration and mapping.

**New template and job config with old app created _after_ migration ran**
Consequence:

- Template missing variable mapping
- Scope missing

Resolution:

- Worker needs to fallback to filters and mappings from legacy columns
- Worker should clean up upon read -> eventual consistent

**Template edited with old app after migration ran**
Consequence:

- Old app "save as new version" creates a fresh version row WITHOUT
  `variable_mapping`/`description`, and its "update running evaluators" flow can
  repoint several configs to that one new row — temporarily violating 1:1.

Checked — does not break execution: the old flow also rewrites
`config.variable_mapping` for every repointed config, and new readers use
`COALESCE(template.mapping, config.mapping)` → the edit takes effect
immediately; prompt/model/output come from the (new) template row as before.

Resolution:

- repair-on-read copies the mapping up; the post-release sweep re-forks any
  template row referenced by >1 config (restores 1:1)

**Job configuration edited with old app after migration ran**
Consequence:

- filter/sampling edit lands on the legacy columns while the new scheduler
  reads the scope → edit is shadowed (not lost) until reconciled
- mapping edit lands on `config.variable_mapping` → immediately effective via
  the COALESCE fallback, copied up by repair-on-read

Resolution:

- accepted (window is minutes); the post-release sweep prefers the newer
  `updated_at` side when config and scope diverge

**Job configuration created with NEW app, scheduled by OLD worker (rolling window / rollback)**
Consequence:

- New code stores targeting on the scope; whatever it leaves in the legacy
  `filter` column decides old-scheduler behavior. A valid empty `[]` means
  MATCH-ALL → evaluator runs on every trace (silent LLM cost storm — scheduling
  succeeds, so nothing fails or retries).

Resolution (pick one):

- sentinel filter (fails `z.array(singleFilter).parse`, which old schedulers run
  BEFORE matching): self-hosted old workers (≥ Feb 2026) skip the config via the
  validity guard; cloud old workers throw → trace-event job retries (5 attempts,
  backoff) and heals on a new worker. Cost-safe; rollback becomes outage-shaped
  for affected projects.
- or dual-write valid legacy values for this one release: window AND rollback
  fully functional; copy code deleted in the next major.

**Old worker EXECUTES a job of a migrated config**

- reads `config.variable_mapping` + the template row — both still present until
  the next major → works unchanged. Same reason in-flight/delayed
  JobExecutions are safe in every phase.

**Old app creates an evaluator from the catalog after migration ran**

- old create paths reference managed template rows by id → managed rows are
  deleted only in the NEXT major; the new app reads the catalog from code and
  never touches them. Created row is then just the "new template + job config
  with old app" case above.

## Rollout Strategy

Different rules for the two deployment worlds — this is what makes Option B
cheap to ship:

**Cloud (we control the deploy cadence)** — multi-phased rollout inside one
release train, no waiting for majors:

1. Deploy 1: expand migrations + backfills (additive; running code unchanged).
2. Deploy 2: flipped reads/writes (optionally env-flag-gated → instant
   rollback without a deploy). Run the reconcile sweep after the fleet settles.
3. Deploy 3 (days later): contract — drop legacy columns, delete managed rows.
   Safe because the whole fleet is ≥ deploy 2.

**Self-hosted (maintenance window assumed)** — everything ships in ONE
release: migrations + backfills apply at startup, then only new code runs, so
the write/read edge cases don't exist. For self-hosters who rolling-upgrade
anyway, the window inconsistencies are **documented and accepted**: they are
non-breaking (shadowed edits, scope-less rows) and self-heal via
repair-on-read + the sweep. The single non-acceptable failure — the
match-all cost storm — is structurally prevented by the sentinel regardless
of upgrade style. Only the destructive cleanup (column drops, managed-row
deletion) trails one release as cheap insurance for restore-old-container
rollbacks; keeping dead columns around for a release costs nothing.

Net effect: no multi-major sequencing; cloud ships in one staged train,
self-host in one release plus a trailing cleanup release.

## Comparison

- Approach A) has less migration edge cases
- Approach A) freezes an outdated data model and the application code to handle it
- Approach A) keeps the scope fan-out + drift guards in every current and future targeting writer — forever
- Approach B) has more edge cases
- Approach B) cleans up the data model and opens a path that allows dropping the ductape code in a future major release
