-- Manual variant of topics-postgres-wipe.sql: the same deletes as plain statements, with the checks read by eye.
-- Run it one statement at a time or as a file with psql -X. It ends in ROLLBACK; type COMMIT instead to apply.
-- Roll back if step 1 returns rows, step 4 differs from step 2, or step 5 shows leftovers.

BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 1. Guard: facets assigned to rules that are not Topics rules. Expect 0 rows; if not, ROLLBACK.
SELECT r.id AS rule_id, r.project_id, r.target_object, e.id AS facet_id
FROM evaluation_rule_evaluator_assignments a
JOIN evaluators e ON e.id = a.evaluator_id AND e.type = 'FACET'
JOIN evaluation_rules r ON r.id = a.evaluation_rule_id
WHERE r.target_object <> 'trace_transcript'
   OR e.project_id <> r.project_id
   OR EXISTS (SELECT 1 FROM evaluation_rule_evaluator_assignments a2 JOIN evaluators e2 ON e2.id = a2.evaluator_id
              WHERE a2.evaluation_rule_id = r.id AND e2.type <> 'FACET');

-- 2. Before: note these numbers.
SELECT
  (SELECT count(*) FROM evaluators WHERE type <> 'FACET') AS other_evaluators,
  (SELECT count(*) FROM evaluator_versions v JOIN evaluators e ON e.id = v.evaluator_id WHERE e.type <> 'FACET') AS other_versions,
  (SELECT count(*) FROM evaluation_rules WHERE target_object <> 'trace_transcript') AS other_rules,
  (SELECT count(*) FROM evaluation_rule_evaluator_assignments a JOIN evaluators e ON e.id = a.evaluator_id WHERE e.type <> 'FACET') AS other_assignments,
  (SELECT count(*) FROM batch_actions WHERE action_type <> 'topics') AS other_batch_actions;

-- 3. Deletes. Each prints DELETE <n>.
DELETE FROM topic_clustering_runs;
DELETE FROM batch_actions WHERE action_type = 'topics';
DELETE FROM evaluation_rules r
WHERE r.target_object = 'trace_transcript'
  AND NOT EXISTS (SELECT 1 FROM evaluation_rule_evaluator_assignments a JOIN evaluators e ON e.id = a.evaluator_id
                  WHERE a.evaluation_rule_id = r.id AND (e.type <> 'FACET' OR e.project_id <> r.project_id));
DELETE FROM evaluators WHERE type = 'FACET';
DELETE FROM topic_configs;

-- 4. After: must equal step 2.
SELECT
  (SELECT count(*) FROM evaluators WHERE type <> 'FACET') AS other_evaluators,
  (SELECT count(*) FROM evaluator_versions v JOIN evaluators e ON e.id = v.evaluator_id WHERE e.type <> 'FACET') AS other_versions,
  (SELECT count(*) FROM evaluation_rules WHERE target_object <> 'trace_transcript') AS other_rules,
  (SELECT count(*) FROM evaluation_rule_evaluator_assignments a JOIN evaluators e ON e.id = a.evaluator_id WHERE e.type <> 'FACET') AS other_assignments,
  (SELECT count(*) FROM batch_actions WHERE action_type <> 'topics') AS other_batch_actions;

-- 5. Leftovers: the first four must be 0. kept_transcript_rules are transcript rules with a non-facet evaluator (expect 0 today).
SELECT
  (SELECT count(*) FROM topic_clustering_runs) AS runs,
  (SELECT count(*) FROM batch_actions WHERE action_type = 'topics') AS snapshots,
  (SELECT count(*) FROM evaluators WHERE type = 'FACET') AS facets,
  (SELECT count(*) FROM topic_configs) AS configs,
  (SELECT count(*) FROM evaluation_rules WHERE target_object = 'trace_transcript') AS kept_transcript_rules;

ROLLBACK;  -- replace with COMMIT to apply
