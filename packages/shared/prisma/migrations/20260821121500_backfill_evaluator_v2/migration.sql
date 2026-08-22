-- Prisma does not automatically wrap PostgreSQL migrations in a transaction.
BEGIN;

-- Backfills the tables created by 20260821121000_add_evaluator_v2 from the legacy
-- job_configurations/eval_templates rows. It is deliberately separate from that migration: the
-- foreign keys there lock `projects` and `users` against writes for as long as their transaction
-- is open, and this backfill is the slow part. Split, the lock window is the DDL only.
--
-- This transaction takes no conflicting locks: it reads the legacy tables (ACCESS SHARE) and
-- writes tables that are still empty (ROW EXCLUSIVE). The foreign keys make its RI triggers take
-- KEY SHARE on the referenced `projects`/`users` rows, which does not conflict with the
-- ROW EXCLUSIVE that concurrent writers take, so ordinary traffic keeps running throughout.
--
-- The backfill reads job_configurations/eval_templates across several separate statements. Under
-- the default READ COMMITTED isolation, each statement would take its own fresh snapshot, so a row
-- written concurrently between statements could show up in one backfill query but not another,
-- tripping a foreign key and aborting the migration. REPEATABLE READ pins one snapshot for the
-- whole transaction, so every statement sees the same view of the old tables. This migration only
-- reads job_configurations/eval_templates and only writes to the tables created by the previous
-- migration, so there is no write-skew risk that would require SERIALIZABLE.
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- No statement_timeout: a role- or parameter-group-level timeout on managed PostgreSQL would abort
-- the backfill mid-deploy, and Prisma then records the migration as failed and refuses to retry it
-- (P3009), which crash-loops every container because the entrypoint runs `migrate deploy` before
-- starting the app. Every insert below is `ON CONFLICT DO NOTHING` on a deterministic id, so the
-- migration is safe to re-run once such a failure has been cleared with
-- `prisma migrate resolve --rolled-back 20260821121500_backfill_evaluator_v2`.
--
-- No lock_timeout either, for the same reason: the only lock this transaction can wait on is the
-- KEY SHARE its RI triggers take on a `projects`/`users` row, and timing out there would abort a
-- migration that is otherwise making progress.
SET LOCAL statement_timeout = 0;

-- copy over job configurations
INSERT INTO "evaluation_rules" (
  "id", "created_at", "updated_at", "project_id", "name", "status",
  "target_object", "filter", "sampling", "delay", "time_scope"
)
-- `job_configurations.time_scope` is nullable (it was added with a default but without NOT NULL),
-- while `evaluation_rules.time_scope` is NOT NULL, so a single historic row holding a literal NULL
-- would abort the whole deploy. The empty array is the value that preserves behaviour: the old
-- scheduler matched on `timeScope has 'NEW'`, which was already false for NULL, and it keeps the
-- status expression below on the INACTIVE branch exactly as NULL did.
SELECT
  jc."id", jc."created_at", jc."updated_at", jc."project_id",
  jc."score_name",
  CASE
    WHEN 'NEW' = ANY(COALESCE(jc."time_scope", ARRAY[]::TEXT[])) THEN jc."status"
    ELSE 'INACTIVE'::"JobConfigState"
  END,
  jc."target_object", jc."filter",
  jc."sampling", jc."delay", COALESCE(jc."time_scope", ARRAY[]::TEXT[])
FROM "job_configurations" jc
WHERE jc."job_type" = 'EVAL'
ON CONFLICT ("id") DO NOTHING;

-- Job configurations that agree on project, template, variable mapping, score name *and* block
-- status describe the very same evaluator, so they share one. Blocked and unblocked configurations
-- stay separate to preserve which legacy rules were executable. The mapping is part of the
-- evaluator definition, while the evaluator name determines the score name written by the worker.
--
-- The evaluator ID is the lowest job configuration ID in the group. That makes the group's
-- representative the row where `job_configuration_id = evaluator_id`, and it keeps evaluator IDs
-- in the job-configuration ID space (template IDs would not be unique across managed templates).
CREATE TEMP TABLE "evaluator_group_map" ON COMMIT DROP AS
SELECT
  jc."id" AS "job_configuration_id",
  min(jc."id") OVER (
    PARTITION BY
      jc."project_id", jc."eval_template_id", jc."variable_mapping", jc."score_name",
      jc."blocked_at" IS NOT NULL
  ) AS "evaluator_id"
FROM "job_configurations" jc
WHERE jc."job_type" = 'EVAL'
  AND jc."eval_template_id" IS NOT NULL;

CREATE UNIQUE INDEX ON "evaluator_group_map" ("job_configuration_id");

-- migrate evaluators that are currently referenced by a job config
INSERT INTO "evaluators" (
  "id", "created_at", "updated_at", "project_id", "name", "type",
  "blocked_at", "block_reason", "block_message"
)
SELECT
  g."evaluator_id",
  min(jc."created_at"),
  max(jc."updated_at"),
  -- constant within the group, it is part of the grouping key
  jc."project_id",
  -- constant within the group, it is part of the grouping key
  (array_agg(jc."score_name" ORDER BY jc."id"))[1],
  -- constant within the group, the template ID is part of the grouping key
  current_template."type",
  -- Block status is part of the grouping key, so unblocked groups stay unblocked. For blocked
  -- groups, the reason/message come from whichever configuration was blocked most recently.
  max(jc."blocked_at"),
  (array_agg(jc."block_reason" ORDER BY jc."blocked_at" DESC, jc."id")
    FILTER (WHERE jc."blocked_at" IS NOT NULL))[1],
  (array_agg(jc."block_message" ORDER BY jc."blocked_at" DESC, jc."id")
    FILTER (WHERE jc."blocked_at" IS NOT NULL))[1]
FROM "job_configurations" jc
JOIN "evaluator_group_map" g
  ON g."job_configuration_id" = jc."id"
JOIN "eval_templates" current_template
  ON current_template."id" = jc."eval_template_id"
GROUP BY g."evaluator_id", jc."project_id", current_template."type"
ON CONFLICT ("id") DO NOTHING;

-- migrate evaluator versions which are currently attached to job configurations
WITH ranked_family_versions AS (
  SELECT
    jc."id" || ':' || family."id" AS "id",
    jc."id" AS "evaluator_id",
    family."version",
    family."created_at",
    family."prompt",
    family."partner",
    family."model",
    family."provider",
    family."model_params",
    -- nullable in eval_templates, NOT NULL in evaluator_versions; see the time_scope note above
    COALESCE(family."vars", ARRAY[]::TEXT[]) AS "vars",
    CASE
      -- Code mappings are fixed by Langfuse and do not depend on the legacy job configuration.
      -- Older configurations contain snapshots that predate newer canonical variables, so use the
      -- complete current mapping for attached code evaluators as well as unattached ones.
      WHEN family."type" = 'CODE' THEN '[{"templateVariable":"input","selectedColumnId":"input","jsonSelector":null},{"templateVariable":"output","selectedColumnId":"output","jsonSelector":null},{"templateVariable":"metadata","selectedColumnId":"metadata","jsonSelector":null},{"templateVariable":"toolCalls","selectedColumnId":"toolCalls","jsonSelector":null},{"templateVariable":"experimentItemExpectedOutput","selectedColumnId":"experimentItemExpectedOutput","jsonSelector":null},{"templateVariable":"experimentItemMetadata","selectedColumnId":"experimentItemMetadata","jsonSelector":null}]'::JSONB
      WHEN family."id" = current_template."id" THEN jc."variable_mapping"
      -- job configurations are not versioned so we don't know historic mappings
      ELSE NULL
    END AS "variable_mapping",
    family."output_schema" AS "output_definition",
    family."source_code",
    family."source_code_language"::TEXT::"EvaluatorSourceCodeLanguage" AS "source_code_language",
    row_number() OVER (
      PARTITION BY jc."id", family."version"
      ORDER BY
        (family."id" = current_template."id") DESC,
        family."created_at" DESC,
        family."id" DESC
    ) AS family_rank
  FROM "job_configurations" jc
  -- only the group's representative writes the history: every configuration in a group points at
  -- the same template, so they would all produce an identical version set
  JOIN "evaluator_group_map" g
    ON g."job_configuration_id" = jc."id"
   AND g."evaluator_id" = jc."id"
  JOIN "eval_templates" current_template
    ON current_template."id" = jc."eval_template_id"
  JOIN "eval_templates" family
    -- Managed templates have a NULL project_id and must only match other managed templates, but
    -- `IS NOT DISTINCT FROM` is not hash- or merge-joinable: the planner would hash on name alone
    -- and demote project_id to a join filter, so every template named X in any project gets probed
    -- against every template named X in every other project. Cost is the sum of count(name)^2, and
    -- template names are exactly the skewed case, since managed names get cloned per project.
    -- COALESCE keeps the NULL-matches-NULL semantics while leaving project_id a real join key, so
    -- this can use eval_templates_project_id_name_version_key. Projects ids are cuids, so the empty
    -- string cannot collide with a real one.
    ON COALESCE(family."project_id", '') = COALESCE(current_template."project_id", '')
   AND family."name" = current_template."name"
    -- Rules always run the latest version of their evaluator, so the cap is what preserves
    -- behaviour: it makes the evaluator's newest version the template version this rule was
    -- actually running. Two rules on different versions of one family therefore get two
    -- evaluators, and the cap is why they are not merged.
    --
    -- The cost is that template versions *newer* than any rule references are dropped. They
    -- cannot be kept here: appending them would move the evaluator's head, silently upgrading
    -- the rule (in the worst case across a type change, LLM_AS_JUDGE -> CODE). Such a family is
    -- also excluded from the unattached-templates backfill below, because a rule does reference
    -- it, so those versions land nowhere. `eval_templates` is not dropped by this migration, so
    -- they stay recoverable by a later backfill if the v2 UI should surface them.
   AND family."version" <= current_template."version"
)
INSERT INTO "evaluator_versions" (
  "id", "evaluator_id", "version", "created_at", "prompt",
  "partner", "model", "provider", "model_params", "vars",
  "variable_mapping", "output_definition", "source_code", "source_code_language"
)
SELECT
  "id", "evaluator_id", "version", "created_at", "prompt",
  "partner", "model", "provider", "model_params", "vars",
  "variable_mapping", "output_definition", "source_code", "source_code_language"
FROM ranked_family_versions
WHERE family_rank = 1
ON CONFLICT ("evaluator_id", "version") DO NOTHING;

-- migrate assignments. Every rule keeps its own assignment row, but several rules can now point
-- at one shared evaluator. The unique index on (rule, evaluator) cannot trip: each job
-- configuration produces exactly one rule, so the pairs stay distinct.
INSERT INTO "evaluation_rule_evaluator_assignments" (
  "id", "created_at", "updated_at", "project_id", "evaluation_rule_id",
  "evaluator_id", "variable_mapping"
)
SELECT
  'legacy:' || jc."id", jc."created_at", jc."updated_at", jc."project_id",
  jc."id", g."evaluator_id",
  -- Legacy mappings belong to the rule/evaluator assignment; modern rules inherit the evaluator version default.
  -- This way users can edit and reuse the `evaluator` in the new UI without breaking the
  -- variable mapping
  CASE
    WHEN jc."target_object" IN ('trace', 'dataset') THEN jc."variable_mapping"
    ELSE NULL
  END
FROM "job_configurations" jc
JOIN "evaluator_group_map" g
  ON g."job_configuration_id" = jc."id"
ON CONFLICT ("evaluation_rule_id", "evaluator_id") DO NOTHING;

-- migrate templates that weren't associated to job configs
WITH unattached_families AS (
  -- only select latest version per template (see order by below)
  -- we use the ID of the latest one as stable evaluator ID
  SELECT DISTINCT ON (template."project_id", template."name")
    template.*
  FROM "eval_templates" template
  -- no managed templates
  WHERE template."project_id" IS NOT NULL
    -- Exclude associated templates: the backfill above already turned them into evaluators.
    -- Note this is per family, not per version, so a family is skipped here even when only some
    -- of its versions were migrated above. See the version cap there for why.
    AND NOT EXISTS (
      SELECT 1
      FROM "job_configurations" jc
      JOIN "eval_templates" referenced
        ON referenced."id" = jc."eval_template_id"
      -- must match the job type the inserts above filter on, otherwise a non-EVAL configuration
      -- would hide a template family from this backfill without ever producing an evaluator
      WHERE jc."job_type" = 'EVAL'
        AND referenced."project_id" = template."project_id"
        AND referenced."name" = template."name"
    )
  -- only select latest version of template
  ORDER BY
    template."project_id", template."name", template."version" DESC,
    template."created_at" DESC, template."id" DESC
)
INSERT INTO "evaluators" (
  "id", "created_at", "updated_at", "project_id", "name", "type"
)
SELECT
  family."id", family."created_at", family."updated_at", family."project_id",
  family."name", family."type"
FROM unattached_families family
ON CONFLICT ("id") DO NOTHING;

-- migrate version history of non associated templates
WITH unattached_families AS (
  -- only select latest version per template (see order by below)
  -- we use the ID of the latest one as stable evaluator ID
  SELECT DISTINCT ON (template."project_id", template."name")
    template.*
  FROM "eval_templates" template
  -- no managed templates
  WHERE template."project_id" IS NOT NULL
    -- same family-level exclusion as the evaluator insert above
    AND NOT EXISTS (
      SELECT 1
      FROM "job_configurations" jc
      JOIN "eval_templates" referenced
        ON referenced."id" = jc."eval_template_id"
      -- must match the job type the inserts above filter on, otherwise a non-EVAL configuration
      -- would hide a template family from this backfill without ever producing an evaluator
      WHERE jc."job_type" = 'EVAL'
        AND referenced."project_id" = template."project_id"
        AND referenced."name" = template."name"
    )
  -- only select latest version of template
  ORDER BY
    template."project_id", template."name", template."version" DESC,
    template."created_at" DESC, template."id" DESC
)
INSERT INTO "evaluator_versions" (
  "id", "evaluator_id", "version", "created_at", "prompt",
  "partner", "model", "provider", "model_params", "vars",
  "variable_mapping", "output_definition", "source_code", "source_code_language"
)
SELECT
  family."id" || ':' || template."id", family."id", template."version",
  template."created_at", template."prompt",
  template."partner", template."model", template."provider",
  template."model_params",
  -- nullable in eval_templates, NOT NULL in evaluator_versions; see the time_scope note above
  COALESCE(template."vars", ARRAY[]::TEXT[]),
  CASE
    WHEN template."type" = 'CODE' THEN '[{"templateVariable":"input","selectedColumnId":"input","jsonSelector":null},{"templateVariable":"output","selectedColumnId":"output","jsonSelector":null},{"templateVariable":"metadata","selectedColumnId":"metadata","jsonSelector":null},{"templateVariable":"toolCalls","selectedColumnId":"toolCalls","jsonSelector":null},{"templateVariable":"experimentItemExpectedOutput","selectedColumnId":"experimentItemExpectedOutput","jsonSelector":null},{"templateVariable":"experimentItemMetadata","selectedColumnId":"experimentItemMetadata","jsonSelector":null}]'::JSONB
    ELSE NULL
  END,
  template."output_schema",
  template."source_code",
  template."source_code_language"::TEXT::"EvaluatorSourceCodeLanguage"
FROM unattached_families family
JOIN "eval_templates" template
  ON template."project_id" = family."project_id"
 AND template."name" = family."name"
ON CONFLICT ("evaluator_id", "version") DO NOTHING;

COMMIT;
