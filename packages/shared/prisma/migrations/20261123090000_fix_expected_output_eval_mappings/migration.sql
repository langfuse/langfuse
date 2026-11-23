-- The expected-output managed template mapped its variable to the observation
-- column "expected_output", which does not exist; the column is
-- "experimentItemExpectedOutput". Legacy trace and dataset mappings carry a
-- "langfuseObject" and legitimately use "expected_output" for dataset items,
-- so they are left unchanged.
CREATE FUNCTION pg_temp.fix_expected_output_mapping(mapping JSONB)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(mapping) IS DISTINCT FROM 'array' THEN mapping
    ELSE COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN jsonb_typeof(element) = 'object'
              AND NOT element ? 'langfuseObject'
              AND element ->> 'selectedColumnId' = 'expected_output'
            THEN jsonb_set(
              element,
              '{selectedColumnId}',
              '"experimentItemExpectedOutput"'
            )
            ELSE element
          END
          ORDER BY position
        )
        FROM jsonb_array_elements(mapping) WITH ORDINALITY AS elements(element, position)
      ),
      '[]'::JSONB
    )
  END
$$;

UPDATE "evaluator_versions"
SET "variable_mapping" = pg_temp.fix_expected_output_mapping("variable_mapping")
WHERE "variable_mapping" @> '[{"selectedColumnId": "expected_output"}]'
  AND "variable_mapping" IS DISTINCT FROM pg_temp.fix_expected_output_mapping("variable_mapping");

UPDATE "evaluation_rule_evaluator_assignments"
SET "variable_mapping" = pg_temp.fix_expected_output_mapping("variable_mapping")
WHERE "variable_mapping" @> '[{"selectedColumnId": "expected_output"}]'
  AND "variable_mapping" IS DISTINCT FROM pg_temp.fix_expected_output_mapping("variable_mapping");

UPDATE "job_configurations"
SET "variable_mapping" = pg_temp.fix_expected_output_mapping("variable_mapping")
WHERE "variable_mapping" @> '[{"selectedColumnId": "expected_output"}]'
  AND "variable_mapping" IS DISTINCT FROM pg_temp.fix_expected_output_mapping("variable_mapping");

DROP FUNCTION pg_temp.fix_expected_output_mapping(JSONB);
