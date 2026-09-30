# Admin issue rules

- Add each rule in its own file in this directory and export an `AdminIssueDefinition`.
- Register new rules in `../adminIssueDefinitions.ts`.
- Scope database queries to the callback's `projectId`.
- Return `RuleIssue[]` from the async callback; let `executeAdminIssueRules` persist the results.
