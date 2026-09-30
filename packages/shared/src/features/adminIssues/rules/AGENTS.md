# Admin issue rules

- Add each rule in its own file in this directory and export an `AdminIssueDefinition`.
- Register new rules in `../adminIssueDefinitions.ts`.
- Callbacks are optional. When present, use `callback(projectId: string)` and scope database queries to that project.
- Return `RuleIssue[]` from the async callback; let `executeAdminIssueRules` persist the results.
