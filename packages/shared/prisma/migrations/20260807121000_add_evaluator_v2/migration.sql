-- Prisma does not automatically wrap PostgreSQL migrations in a transaction.
BEGIN;

-- The backfill below reads job_configurations/eval_templates across several separate
-- statements. Under the default READ COMMITTED isolation, each statement would take its
-- own fresh snapshot, so a row written concurrently between statements could show up in
-- one backfill query but not another, tripping a foreign key and aborting the migration.
-- REPEATABLE READ pins one snapshot for the whole transaction, so every statement sees
-- the same view of the old tables. This migration only reads job_configurations/
-- eval_templates and only writes to the brand-new tables created below, so there is no
-- write-skew risk that would require SERIALIZABLE.
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

CREATE TYPE "EvaluatorSourceCodeLanguage" AS ENUM ('PYTHON', 'TYPESCRIPT');

CREATE TABLE "evaluators" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "EvalTemplateType" NOT NULL,
  "description" TEXT,
  "created_by_user_id" TEXT,
  "blocked_at" TIMESTAMP(3),
  "block_reason" "EvaluatorBlockReason",
  "block_message" TEXT,

  CONSTRAINT "evaluators_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evaluators"
  ADD CONSTRAINT "evaluators_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluators"
  ADD CONSTRAINT "evaluators_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "evaluators_project_id_created_at_idx" ON "evaluators"("project_id", "created_at" DESC);

CREATE TABLE "evaluator_versions" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evaluator_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "created_by_user_id" TEXT,
  "prompt" TEXT,
  "partner" TEXT,
  "model" TEXT,
  "provider" TEXT,
  "model_params" JSONB,
  "vars" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "variable_mapping" JSONB,
  "output_definition" JSONB,
  "source_code" VARCHAR(262144),
  "source_code_language" "EvaluatorSourceCodeLanguage",

  CONSTRAINT "evaluator_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evaluator_versions"
  ADD CONSTRAINT "evaluator_versions_evaluator_id_fkey"
  FOREIGN KEY ("evaluator_id") REFERENCES "evaluators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluator_versions"
  ADD CONSTRAINT "evaluator_versions_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "evaluator_versions_evaluator_id_version_key" ON "evaluator_versions"("evaluator_id", "version" DESC);

CREATE TABLE "evaluation_rules" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "project_id" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "name" TEXT NOT NULL,
  "status" "JobConfigState" NOT NULL DEFAULT 'ACTIVE',
  "target_object" TEXT NOT NULL,
  "filter" JSONB NOT NULL,
  "sampling" DECIMAL(65,30) NOT NULL,
  "delay" INTEGER NOT NULL,
  "time_scope" TEXT[] NOT NULL DEFAULT ARRAY['NEW']::TEXT[],

  CONSTRAINT "evaluation_rules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evaluation_rules"
  ADD CONSTRAINT "evaluation_rules_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_rules"
  ADD CONSTRAINT "evaluation_rules_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "evaluation_rules_project_id_updated_at_idx" ON "evaluation_rules"("project_id", "updated_at" DESC);

CREATE TABLE "evaluation_rule_evaluator_assignments" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "project_id" TEXT NOT NULL,
  "evaluation_rule_id" TEXT NOT NULL,
  "evaluator_id" TEXT NOT NULL,
  "variable_mapping" JSONB,

  CONSTRAINT "evaluation_rule_evaluator_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evaluation_rule_evaluator_assignments"
  ADD CONSTRAINT "evaluation_rule_evaluator_assignments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_rule_evaluator_assignments"
  ADD CONSTRAINT "evaluation_rule_evaluator_assignments_evaluation_rule_id_fkey"
  FOREIGN KEY ("evaluation_rule_id") REFERENCES "evaluation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_rule_evaluator_assignments"
  ADD CONSTRAINT "evaluation_rule_evaluator_assignments_evaluator_id_fkey"
  FOREIGN KEY ("evaluator_id") REFERENCES "evaluators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "evaluation_rule_assignments_rule_evaluator_key"
  ON "evaluation_rule_evaluator_assignments"("evaluation_rule_id", "evaluator_id");
-- for efficient project deletes
CREATE INDEX "evaluation_rule_assignments_project_id_idx"
  ON "evaluation_rule_evaluator_assignments"("project_id");
CREATE INDEX "evaluation_rule_assignments_evaluator_id_idx"
  ON "evaluation_rule_evaluator_assignments"("evaluator_id");

-- copy over job configurations
INSERT INTO "evaluation_rules" (
  "id", "created_at", "updated_at", "project_id", "name", "status",
  "target_object", "filter", "sampling", "delay", "time_scope"
)
SELECT
  jc."id", jc."created_at", jc."updated_at", jc."project_id",
  jc."score_name", jc."status", jc."target_object", jc."filter",
  jc."sampling", jc."delay", jc."time_scope"
FROM "job_configurations" jc
WHERE jc."job_type" = 'EVAL'
ON CONFLICT ("id") DO NOTHING;

-- Job configurations that agree on project, template, variable mapping *and* score name describe
-- the very same evaluator, so they share one. Configurations that differ in any of the four keep
-- their own evaluator: the mapping is part of the evaluator definition, while the evaluator name
-- determines the score name written by the worker.
--
-- The evaluator ID is the lowest job configuration ID in the group. That makes the group's
-- representative the row where `job_configuration_id = evaluator_id`, and it keeps evaluator IDs
-- in the job-configuration ID space (template IDs would not be unique across managed templates).
CREATE TEMP TABLE "evaluator_group_map" ON COMMIT DROP AS
SELECT
  jc."id" AS "job_configuration_id",
  min(jc."id") OVER (
    PARTITION BY
      jc."project_id", jc."eval_template_id", jc."variable_mapping", jc."score_name"
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
  -- a group is blocked as soon as any of its configurations is, and the reason/message are
  -- taken from whichever configuration was blocked most recently
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
    family."vars",
    CASE
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
    ON family."name" = current_template."name"
    -- need `DISTINCT FROM` to handle managed templates correctly
   AND family."project_id" IS NOT DISTINCT FROM current_template."project_id"
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
  template."model_params", template."vars", NULL, template."output_schema",
  template."source_code",
  template."source_code_language"::TEXT::"EvaluatorSourceCodeLanguage"
FROM unattached_families family
JOIN "eval_templates" template
  ON template."project_id" = family."project_id"
 AND template."name" = family."name"
ON CONFLICT ("evaluator_id", "version") DO NOTHING;

COMMIT;
