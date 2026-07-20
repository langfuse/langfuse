# Evaluators v2

## Ownership map

- `pages/evaluator-detail.tsx` owns evaluator detail/edit routing and header state.
- `components/RuleSetupForm.tsx` owns the shared create/edit definition form,
  sample selection, and test workflow. `components/EvaluatorEditView.tsx`
  supplies the edit-only run-scope disclosure state, attachment controls, and
  independently saved scope mutations.
- `pages/evaluators.tsx` and `pages/scopes.tsx` own the standalone v2 list
  lifecycle. `EvaluatorOverviewTable` and `RunScopesOverviewTable` own their
  table selection and bulk actions; rendered cells remain narrow views.
- `components/RunScopePeekView.tsx` owns read-only scope inspection. New
  attachments hand off to evaluator edit with the scope preselected, keeping
  filtering and testing in the evaluator workflow.
- `components/EvaluatorConfigurationView.tsx` owns read-only evaluator and
  attached-scope presentation. It reuses the edit hierarchy for prompt-variable
  mappings and score output; controls become read-only while `Advanced` remains
  inspectable. `EvaluatorDefinitionView` is shared by both detail surfaces.
- `server/router.ts` owns the project-scoped tRPC contract.
- `server/runScopeService.ts` owns evaluator ↔ run-scope assignment workflows.
- `server/evaluatorActivationService.ts` owns draft activation.

Server data remains in tRPC/React Query. Each detail page keeps only its
form-local draft and selected evaluator/scope in React state. Scope filters are
persisted on `EvalRunScope`; `EvalRunScopeAssignment` is the explicit
many-to-many mapping to `JobConfiguration`.

`JobConfiguration.createdByUserId` records the creator of the runnable
evaluator independently of its versioned definition. `EvalRunScope.enabled`
pauses every evaluator assignment for that shared scope. The run-scope list
shows the five latest individual `JobExecution` records across those
assignments.

The evaluator detail page exposes template versions in a read-only sheet. A
definition change creates a new project template version; evaluator metadata
changes keep the current definition version.

Evaluator editing uses an attached-scope master list with no detail open by
default. Selecting an attached scope, an available scope, or the picker’s
create action reveals one primary filter/preview/test inspector that explicitly
names the active scope; scope changes are saved separately from the evaluator
definition.

The worker schedules each matching evaluator and attached run scope as a
distinct execution. The execution stores its run-scope ID so logs can be
filtered to that exact pairing. The legacy filter and sampling columns remain a
fallback for evaluator rows without assignments.
