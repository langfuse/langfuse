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
  `components/EvaluatorEditView.tsx` owns the evaluator's rule-tab drafts:
  existing rules stay query-backed, while filter/sampling edits and new tabs
  remain local until Save. The setup form renders the active tab's filters,
  matching observations, and sampling controls.
- `actions/validateAndAttachRule.ts` owns the direct-attachment workflow:
  load one matching observation, test the saved evaluator, and only then
  activate the assignment. The two detail views only own pending and warning
  presentation through `hooks/useValidatedRuleAttachment.ts`.
- `pages/evaluators.tsx` and `pages/rules.tsx` own the standalone v2 list
  lifecycle. `EvaluatorOverviewTable` and `EvaluationRulesOverviewTable` own their
  table selection and bulk actions; rendered cells remain narrow views.
- `components/EvaluationRulePeekView.tsx` renders the shared editable rule form
  for users with write access and keeps Save disabled until the draft differs
  from the loaded rule. Read-only users retain the inspection view. New
  attachments validate in place; failures link to evaluator edit with the rule
  preselected for manual review and testing.
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

Evaluator editing shows multiple attached rules as subtle tabs around the
observation filter, matching preview, and sampling controls. A new rule starts
as an inline tab rather than a modal. When multiple tabs exist, removing an
existing tab stages an evaluator detachment for Save, while removing an unsaved
tab only discards that draft. The filter search bar continues to suggest filters
from attached and existing rules; attached rules are ranked first and labeled,
while selecting any suggestion copies its filter and sampling into the active
rule draft.

Saving evaluator rule changes reuses the activation cost-preview dialog.
Multiple changed rules render as tabs over the existing filter and seven-day
cost estimate. Expanding a rule's estimate also allows its sampling rate to be
adjusted before saving. Edit mode estimates one representative evaluator run
when rule changes are submitted, with the evaluator's historical average
execution cost as a fallback.

The worker schedules each matching evaluator-rule pair as a distinct
execution. The execution stores its rule ID so logs can be
filtered to that exact pairing. The legacy filter and sampling columns remain a
fallback for evaluator rows without assignments.
