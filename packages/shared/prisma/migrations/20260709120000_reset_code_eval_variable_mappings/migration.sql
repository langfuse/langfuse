-- Code evaluators have no user-editable variable mapping: every write path
-- (UI form and public API) stores the synthesized getCodeEvalVariableMapping()
-- snapshot verbatim. Rules created before "toolCalls" joined that mapping
-- would otherwise never receive tool calls at execution time — the worker
-- extracts variables from the stored mapping — while the UI test run and the
-- public API synthesize a fresh mapping that includes it. Overwriting with
-- the current canonical mapping realigns stored state; it is lossless because
-- no custom code-eval mappings can exist.
-- Keep in sync with CODE_EVAL_TEMPLATE_VARIABLES
-- (web/src/features/evals/utils/code-eval-template-utils.ts).
UPDATE "job_configurations" jc
SET "variable_mapping" = '[
  {"templateVariable": "input", "selectedColumnId": "input", "jsonSelector": null},
  {"templateVariable": "output", "selectedColumnId": "output", "jsonSelector": null},
  {"templateVariable": "metadata", "selectedColumnId": "metadata", "jsonSelector": null},
  {"templateVariable": "toolCalls", "selectedColumnId": "toolCalls", "jsonSelector": null},
  {"templateVariable": "experimentItemExpectedOutput", "selectedColumnId": "experimentItemExpectedOutput", "jsonSelector": null},
  {"templateVariable": "experimentItemMetadata", "selectedColumnId": "experimentItemMetadata", "jsonSelector": null}
]'::jsonb
FROM "eval_templates" et
WHERE jc."eval_template_id" = et."id"
  AND et."type" = 'CODE';
