# Evaluator in-app Assistant

This module owns evaluator-specific integration with the generic in-app
Assistant runtime.

- `evaluatorAssistantContext.ts`: validates selected-sample screen context.
- `evaluatorAssistantHandoff.ts`: builds and starts saved-evaluator handoffs.
- `evaluatorToolSideEffects.ts`: handles evaluator update and test tool results.
- `evaluatorAssistantTestResultStore.ts`: buffers expected test results across
  evaluator route remounts.
- `useEvaluatorSamplePageContext.ts`: registers the current sample for every
  Assistant turn.
- `useEvaluatorAssistantTestResultSync.ts`: connects completed Assistant tests
  to the evaluator test panel.

Generic AG-UI event dispatch and page-context registration remain in
`features/in-app-agent`.
