-- Wipes all Topics data from Postgres, and nothing else. Run once per database.
--
--   Dry run (default, rolls back):   psql "$DATABASE_URL" -f packages/shared/scripts/topics-postgres-wipe.sql
--   Apply:                           psql "$DATABASE_URL" -v apply=1 -f packages/shared/scripts/topics-postgres-wipe.sql
--
-- Deletes:
--   topic_clustering_runs                 all rows (Topics-only table)
--   batch_actions                         only action_type = 'topics' (snapshots)
--   evaluation_rules + their assignments  only Topics rules: target 'trace_transcript' whose evaluators are all facets
--   evaluators + evaluator_versions       only type = 'FACET' (the evals product excludes facets)
--   topic_configs                         all rows (Topics-only table)
-- Keeps every other evaluator, rule, assignment, batch action, audit log and tracing_readiness_settings.
-- Aborts without changes if a facet is assigned to a non-Topics rule, or if any non-Topics row count changes.

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

CREATE TEMP TABLE topics_rules ON COMMIT DROP AS
SELECT r.id FROM evaluation_rules r
WHERE r.target_object = 'trace_transcript'
  AND EXISTS (SELECT 1 FROM evaluation_rule_evaluator_assignments a WHERE a.evaluation_rule_id = r.id)
  AND NOT EXISTS (
    SELECT 1 FROM evaluation_rule_evaluator_assignments a JOIN evaluators e ON e.id = a.evaluator_id
    WHERE a.evaluation_rule_id = r.id AND (e.type <> 'FACET' OR e.project_id <> r.project_id));

-- Everything outside Topics, counted before the deletes and checked after them.
CREATE TEMP TABLE kept ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM evaluators WHERE type <> 'FACET') AS evaluators,
  (SELECT count(*) FROM evaluator_versions v JOIN evaluators e ON e.id = v.evaluator_id WHERE e.type <> 'FACET') AS evaluator_versions,
  (SELECT count(*) FROM evaluation_rules WHERE id NOT IN (SELECT id FROM topics_rules)) AS rules,
  (SELECT count(*) FROM evaluation_rule_evaluator_assignments WHERE evaluation_rule_id NOT IN (SELECT id FROM topics_rules)) AS assignments,
  (SELECT count(*) FROM batch_actions WHERE action_type <> 'topics') AS batch_actions,
  (SELECT count(*) FROM job_configurations) AS job_configurations;

DO $$
DECLARE shared_facets bigint;
BEGIN
  SELECT count(*) INTO shared_facets
  FROM evaluation_rule_evaluator_assignments a JOIN evaluators e ON e.id = a.evaluator_id
  WHERE e.type = 'FACET' AND a.evaluation_rule_id NOT IN (SELECT id FROM topics_rules);
  IF shared_facets > 0 THEN
    RAISE EXCEPTION 'Aborting: % facet assignment(s) belong to non-Topics rules', shared_facets;
  END IF;
END $$;

SELECT 'to delete' AS stage,
  (SELECT count(*) FROM topic_clustering_runs) AS clustering_runs,
  (SELECT count(*) FROM batch_actions WHERE action_type = 'topics') AS topics_batch_actions,
  (SELECT count(*) FROM topics_rules) AS topics_rules,
  (SELECT count(*) FROM evaluators WHERE type = 'FACET') AS facet_evaluators,
  (SELECT count(*) FROM evaluator_versions v JOIN evaluators e ON e.id = v.evaluator_id WHERE e.type = 'FACET') AS facet_versions,
  (SELECT count(*) FROM topic_configs) AS topic_configs;
SELECT 'kept' AS stage, * FROM kept;

DELETE FROM topic_clustering_runs;
DELETE FROM batch_actions WHERE action_type = 'topics';
DELETE FROM evaluation_rules WHERE id IN (SELECT id FROM topics_rules);
DELETE FROM evaluators WHERE type = 'FACET';
DELETE FROM topic_configs;

DO $$
DECLARE before kept; after kept;
BEGIN
  SELECT * INTO before FROM kept;
  SELECT
    (SELECT count(*) FROM evaluators WHERE type <> 'FACET'),
    (SELECT count(*) FROM evaluator_versions v JOIN evaluators e ON e.id = v.evaluator_id WHERE e.type <> 'FACET'),
    (SELECT count(*) FROM evaluation_rules),
    (SELECT count(*) FROM evaluation_rule_evaluator_assignments),
    (SELECT count(*) FROM batch_actions WHERE action_type <> 'topics'),
    (SELECT count(*) FROM job_configurations)
  INTO after;
  IF after IS DISTINCT FROM before THEN
    RAISE EXCEPTION 'Aborting: non-Topics rows changed, before % after %', before, after;
  END IF;
  IF EXISTS (SELECT 1 FROM evaluators WHERE type = 'FACET') OR EXISTS (SELECT 1 FROM topic_clustering_runs)
     OR EXISTS (SELECT 1 FROM topic_configs) OR EXISTS (SELECT 1 FROM batch_actions WHERE action_type = 'topics') THEN
    RAISE EXCEPTION 'Aborting: Topics rows remain';
  END IF;
END $$;

\if :apply
  COMMIT;
  \echo 'Applied: Topics data deleted.'
\else
  ROLLBACK;
  \echo 'Dry run: rolled back. Rerun with -v apply=1 to delete.'
\endif
