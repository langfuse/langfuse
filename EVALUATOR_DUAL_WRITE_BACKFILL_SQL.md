# Evaluator dual-write and consolidation SQL

This note captures the intentionally simple rollout model and the core
`ON CONFLICT ... RETURNING` pattern.

## Rollout

There is exactly one data backfill.

### Release 1: schema and dual write

1. Create `evaluators`, `evaluator_versions`, and
   `job_configuration_evaluator_assignments`.
2. Deploy application logic that transactionally writes both the legacy and
   target representations.
3. Keep reads and the new UX on the legacy model.
4. Wait until every container without dual-write support has terminated.

The dual-write update paths must upsert the target representation because they
may encounter legacy job configurations that have not been backfilled yet.

### Release 2: consolidate and cut over

1. Run one idempotent, set-based data backfill.
2. Validate that every legacy job configuration has an evaluator version and
   assignment.
3. Enable reads and the new UX on the target model.

No timestamp reconciliation or repeated migration is needed:

- Anything written after Release 1 is already dual-written.
- Anything still missing was created before dual write and is inserted by the
  backfill.
- If the backfill races with a live dual write, uniqueness constraints and
  `ON CONFLICT` resolve the race.

## Required migration identity

The examples assume these temporary migration columns and constraints:

```sql
ALTER TABLE evaluators
  ADD COLUMN legacy_template_family_id TEXT,
  ADD COLUMN legacy_variable_mapping JSONB;

CREATE UNIQUE INDEX evaluators_legacy_identity_key
  ON evaluators (
    project_id,
    legacy_template_family_id,
    score_name,
    legacy_variable_mapping
  );

CREATE UNIQUE INDEX evaluator_versions_evaluator_template_key
  ON evaluator_versions (evaluator_id, legacy_eval_template_id);

CREATE UNIQUE INDEX evaluator_versions_evaluator_version_key
  ON evaluator_versions (evaluator_id, version);

CREATE UNIQUE INDEX evaluator_assignments_rule_evaluator_key
  ON job_configuration_evaluator_assignments (
    job_configuration_id,
    evaluator_id
  );
```

The stable legacy template-family ID should identify the complete legacy
template family rather than one specific version. It can be derived from the
oldest version in the family.

`score_name` is part of the identity because it belongs to the stable
evaluator. It may be removed from the identity only if the product guarantees
that a template family and variable mapping cannot have different score names.

## Application dual write for one job configuration

Use this operation when creating a job configuration or when updating a legacy
job configuration whose target evaluator may not exist yet.

```sql
WITH resolved_evaluator AS (
  INSERT INTO evaluators AS existing (
    id,
    project_id,
    type,
    score_name,
    legacy_template_family_id,
    legacy_variable_mapping,
    created_at,
    updated_at
  )
  VALUES (
    :job_configuration_id,
    :project_id,
    :evaluator_type,
    :score_name,
    :template_family_id,
    :variable_mapping::jsonb,
    NOW(),
    NOW()
  )
  ON CONFLICT (
    project_id,
    legacy_template_family_id,
    score_name,
    legacy_variable_mapping
  )
  DO UPDATE SET
    -- Deliberate no-op so RETURNING also returns the existing row.
    updated_at = existing.updated_at
  RETURNING id
),
created_version AS (
  INSERT INTO evaluator_versions (
    id,
    evaluator_id,
    version,
    variable_mapping,
    legacy_eval_template_id
  )
  SELECT
    :evaluator_version_id,
    resolved.id,
    :version,
    :variable_mapping::jsonb,
    :eval_template_id
  FROM resolved_evaluator resolved
  ON CONFLICT (evaluator_id, legacy_eval_template_id)
  DO NOTHING
),
created_assignment AS (
  INSERT INTO job_configuration_evaluator_assignments (
    id,
    project_id,
    job_configuration_id,
    evaluator_id
  )
  SELECT
    :assignment_id,
    :project_id,
    :job_configuration_id,
    resolved.id
  FROM resolved_evaluator resolved
  ON CONFLICT (job_configuration_id, evaluator_id)
  DO NOTHING
)
SELECT id AS evaluator_id
FROM resolved_evaluator;
```

The deliberate no-op update makes `RETURNING id` work for both cases:

- If the evaluator does not exist, the statement inserts it and returns its new
  ID.
- If an equivalent evaluator already exists, the conflict resolves to that row
  and returns the existing ID.

## Set-based Release 2 backfill

The single data backfill applies the same operation to all existing job
configurations.

```sql
WITH sources AS (
  SELECT
    jc.id AS job_configuration_id,
    jc.project_id,
    template.type,
    jc.score_name,
    template_family.id AS template_family_id,
    jc.variable_mapping,
    jc.eval_template_id,
    template.version
  FROM job_configurations jc
  JOIN eval_templates template
    ON template.id = jc.eval_template_id
  JOIN LATERAL (
    SELECT family.id
    FROM eval_templates family
    WHERE family.project_id = template.project_id
      AND family.name = template.name
    ORDER BY family.version
    LIMIT 1
  ) template_family ON TRUE
  WHERE jc.job_type = 'EVAL'
),
evaluator_candidates AS (
  -- PostgreSQL must not update the same conflicting row twice in one INSERT.
  SELECT DISTINCT ON (
    project_id,
    template_family_id,
    score_name,
    variable_mapping
  )
    *
  FROM sources
  ORDER BY
    project_id,
    template_family_id,
    score_name,
    variable_mapping,
    job_configuration_id
),
resolved_evaluators AS (
  INSERT INTO evaluators AS existing (
    id,
    project_id,
    type,
    score_name,
    legacy_template_family_id,
    legacy_variable_mapping,
    created_at,
    updated_at
  )
  SELECT
    job_configuration_id,
    project_id,
    type,
    score_name,
    template_family_id,
    variable_mapping,
    NOW(),
    NOW()
  FROM evaluator_candidates
  ON CONFLICT (
    project_id,
    legacy_template_family_id,
    score_name,
    legacy_variable_mapping
  )
  DO UPDATE SET
    -- Deliberate no-op so existing rows are included in RETURNING.
    updated_at = existing.updated_at
  RETURNING
    id,
    project_id,
    legacy_template_family_id,
    score_name,
    legacy_variable_mapping
),
created_versions AS (
  INSERT INTO evaluator_versions (
    id,
    evaluator_id,
    version,
    variable_mapping,
    legacy_eval_template_id
  )
  SELECT DISTINCT
    source.eval_template_id || ':' || resolved.id,
    resolved.id,
    source.version,
    source.variable_mapping,
    source.eval_template_id
  FROM sources source
  JOIN resolved_evaluators resolved
    ON resolved.project_id = source.project_id
   AND resolved.legacy_template_family_id = source.template_family_id
   AND resolved.score_name = source.score_name
   AND resolved.legacy_variable_mapping = source.variable_mapping
  ON CONFLICT (evaluator_id, legacy_eval_template_id)
  DO NOTHING
),
created_assignments AS (
  INSERT INTO job_configuration_evaluator_assignments (
    id,
    project_id,
    job_configuration_id,
    evaluator_id
  )
  SELECT
    'legacy:' || source.job_configuration_id,
    source.project_id,
    source.job_configuration_id,
    resolved.id
  FROM sources source
  JOIN resolved_evaluators resolved
    ON resolved.project_id = source.project_id
   AND resolved.legacy_template_family_id = source.template_family_id
   AND resolved.score_name = source.score_name
   AND resolved.legacy_variable_mapping = source.variable_mapping
  ON CONFLICT (job_configuration_id, evaluator_id)
  DO NOTHING
)
SELECT COUNT(*) AS resolved_evaluator_count
FROM resolved_evaluators;
```

## Empty templates

Template families that still have no job configuration are migrated separately.
They create an evaluator and versions, but no assignment.

```sql
INSERT INTO evaluators (
  id,
  project_id,
  type,
  score_name,
  legacy_template_family_id,
  legacy_variable_mapping,
  created_at,
  updated_at
)
SELECT
  empty_family.template_family_id,
  empty_family.project_id,
  empty_family.type,
  empty_family.name,
  empty_family.template_family_id,
  NULL,
  empty_family.created_at,
  empty_family.updated_at
FROM empty_template_families empty_family
ON CONFLICT DO NOTHING;
```

Copy all versions of those empty template families into `evaluator_versions`
with a null `variable_mapping` and no assignment:

```sql
INSERT INTO evaluator_versions (
  id,
  evaluator_id,
  version,
  variable_mapping,
  legacy_eval_template_id
)
SELECT
  template.id || ':' || evaluator.id,
  evaluator.id,
  template.version,
  NULL,
  template.id
FROM eval_templates template
JOIN evaluators evaluator
  ON evaluator.project_id = template.project_id
 AND evaluator.legacy_template_family_id = (
   SELECT root.id
   FROM eval_templates root
   WHERE root.project_id = template.project_id
     AND root.name = template.name
   ORDER BY root.version
   LIMIT 1
 )
 AND evaluator.legacy_variable_mapping IS NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM job_configurations jc
  JOIN eval_templates referenced
    ON referenced.id = jc.eval_template_id
  WHERE referenced.project_id = template.project_id
    AND referenced.name = template.name
)
ON CONFLICT (evaluator_id, legacy_eval_template_id)
DO NOTHING;
```

The migration never inserts legacy `eval_templates` or
`job_configurations`. It only consolidates existing legacy data into the target
tables.
