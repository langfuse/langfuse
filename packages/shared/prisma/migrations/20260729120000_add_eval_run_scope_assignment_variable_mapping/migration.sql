-- Per-pairing variable mapping. The evaluator declares its variables; each
-- attached rule maps them onto its own data. Null means the pairing has not
-- been mapped yet and the evaluator's own `variable_mapping` still applies.
ALTER TABLE "eval_run_scope_assignments" ADD COLUMN "variable_mapping" JSONB;

-- Existing pairings inherit the evaluator's mapping so behaviour is unchanged
-- for evaluators created before mapping moved onto the pairing.
UPDATE "eval_run_scope_assignments" AS "assignment"
SET "variable_mapping" = "job"."variable_mapping"
FROM "job_configurations" AS "job"
WHERE "job"."id" = "assignment"."job_configuration_id";
