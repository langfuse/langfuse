# Evaluators v2

This is the new version of evaluations that uses a new data model.
The old change used:

- `eval_templates` (definition of an evaluator)
- `job_configurations` (variable mapping and which events it runs against)

The new data model is

- Evaluator
- Rule (basically the old `job_configuration`)
- Rule assignments (association table handling the n:m relationship)

FACET evaluators are internal and must be excluded from user-facing evaluator and rule queries.

## Rule visibility

- Every evaluation-rule read must go through `visibleRuleWhere` (in `server/rules/ruleRepository.ts`). It is the single place that hides FACET-assigned rules and, unless the caller opts in, trace transcript rules.
- `trace_transcript` rules must never reach the public API or MCP. Only the tRPC rule router may opt in (via `includeTraceTranscriptRules`), and only behind the trace transcript evals gate; the public API and MCP never set it.

Traces captured during the eval executions in the past only captured `job_configuration_id`.
Only new runs capture `evaluator_id` and `evaluation_rule_id`.

## Testing

- Do not write tautological React client tests or tests that assert pixel positioning.
- Only add component tests when they enforce meaningful behavior.
