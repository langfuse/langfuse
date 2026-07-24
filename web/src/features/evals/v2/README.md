# Evaluators v2

## Ownership map

- `pages/evaluator-detail.tsx` always renders the evaluator as an editable
  form (`EvaluatorEditView`) and owns header state. There is no separate
  read-only view; `EvaluatorSetupForm`'s Save button stays disabled until the
  draft actually differs from the loaded evaluator. Cancel and a successful
  save both return to a clean state — cancel navigates back to the overview,
  save remounts the form (via a bumped `key`) so its internal "initial value"
  baselines reset to the just-saved data.
- `components/EvaluatorSetupForm.tsx` owns the shared create/edit definition form,
  three-step sample/definition/metadata flow, narrow test pane, and reusable
  rule-filter suggestions. Prompt editing and variable mapping render as sibling
  views in the definition step; evaluator name and description live in step 3.
  `components/EvaluatorEditView.tsx` supplies attached rule IDs so those
  suggestions can be prioritized without exposing relationship controls.
- `actions/validateAndAttachRule.ts` owns the direct-attachment workflow:
  load one matching observation, test the saved evaluator, and only then
  activate the assignment. The two detail views only own pending and warning
  presentation through `hooks/useValidatedRuleAttachment.ts`.
- `pages/evaluators.tsx` and `pages/rules.tsx` own the standalone v2 list
  lifecycle. `EvaluatorOverviewTable` and `EvaluationRulesOverviewTable` own their
  table selection and bulk actions; rendered cells remain narrow views.
- `components/EvaluationRulePeekView.tsx` owns read-only rule inspection. New
  attachments validate in place; failures link to evaluator edit with the
  rule preselected for manual review and testing.
- `components/EvaluationRuleForm.tsx` owns the shared three-step evaluation-rule
  structure. Create and edit render the same interactive form; inspection
  reuses the step shell with read-only field content.
- `components/EvaluatorConfigurationView.tsx` exports only
  `EvaluatorDefinitionView`, a read-only rendering of the prompt/code, score
  output, and prompt-variable mappings reused by the evaluator detail page's
  version-history sheet.
- `server/router.ts` owns the project-scoped tRPC contract.
- `server/evaluationRuleService.ts` owns evaluator ↔ rule assignment workflows.
- `server/evaluatorActivationService.ts` owns draft activation.

Server data remains in tRPC/React Query. Each detail page keeps only its
form-local draft and selected evaluator/rule in React state. Rule filters are
persisted on the legacy-named `EvalRunScope`; `EvalRunScopeAssignment` is the explicit
many-to-many mapping to `JobConfiguration`.

`JobConfiguration.createdByUserId` records the creator of the runnable
evaluator independently of its versioned definition. `EvalRunScope.enabled`
pauses every evaluator assignment for that shared rule. The rule list
shows the five latest individual `JobExecution` records across those
assignments.

The evaluator detail page exposes template versions in a read-only sheet. A
definition change creates a new project template version; evaluator metadata
changes keep the current definition version.

Evaluator editing suggests filters from attached and existing rules in the
filter search bar. Attached rules are ranked first and labeled, while selecting
any suggestion copies its filter and sampling into the evaluator draft without
changing rule relationships.

The worker schedules each matching evaluator-rule pair as a distinct
execution. The execution stores its rule ID so logs can be
filtered to that exact pairing. The legacy filter and sampling columns remain a
fallback for evaluator rows without assignments.
