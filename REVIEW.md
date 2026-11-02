# Code review

Review new or worsened code. Do not require unrelated legacy cleanup. New violations of team rules must be fixed before merge, even without a bug. Exceptions need explicit human approval.

## References

Read the applicable `AGENTS.md` files and references below. Report unavailable references. This file overrides conflicting guidance for reviews.

- [Backend](.agents/skills/backend-dev-guidelines/SKILL.md)
- [Security](.agents/skills/security-review/SKILL.md): auth, RBAC, tenant isolation, outbound requests, secrets, and telemetry
- [ClickHouse](.agents/skills/clickhouse-best-practices/SKILL.md)
- [React](.agents/skills/react-component-guidelines/SKILL.md) and [design system](web/src/components/design-system/README.md)
- [Frontend data and state](.agents/skills/frontend-large-feature-architecture/SKILL.md)
- [Storybook](.agents/skills/storybook/SKILL.md)
- [Architecture](.agents/ARCHITECTURE_PRINCIPLES.md)

Use their technical rules, not their implementation or handoff workflows.

## Team rules

### Architecture

- One responsibility and abstraction level per function. The main export reads as a linear sequence of named calls. Extract dense branches, even if that adds lines.
- Group components, hooks, and helpers under `features/<feature>/`, not top-level folders grouped by kind.
- Return results instead of mutating inputs by default. In Rust, allow mutation of clearly owned state and explicit `&mut` output buffers or accumulators when it keeps the API clear or avoids unnecessary allocations and copies.
- Inject dependencies through constructors. Call ordinary helpers directly.
- Reuse and extend existing functionality. Keep solutions simple. When flagging complexity, show a simpler alternative that meets the same requirements.

### Components and state

- Use `web/src/components/design-system/` primitives and their styling rules. Add variants instead of custom `className` values.
- Importing raw primitives (`@radix-ui/*`, cmdk, etc.) in feature code is an exception, only when the design system has no suitable option.
- Compose triggers and overlay content separately. Overlay owners manage content and open/close state, but must allow callers to supply or replace the trigger. Trigger components must not own the overlay content. Connect triggers through trigger props or controller callbacks rather than hard-coding a button inside the content component. Use `DialogController` for dialogs and follow the render-prop trigger APIs of `Tooltip` and `HoverCard` in `web/src/components/design-system/`. Support triggers nested inside child components by passing trigger props or callbacks—not overlay content.
- Export one component per file. Match the filename to the component. If a component has a named props type, name it `<ComponentName>Props`. Inline props types are allowed; do not require extracting a named type.
- Name callback props that run before or after an internal action with explicit timing: `onBeforeExpand`, `onAfterCopy`, not ambiguous `onExpand` or `onCopy`. Reserve unqualified action callbacks for delegating the action to the caller, not notifying them around component-owned behavior.
- A component must be either controlled or uncontrolled; never add conditional support for both modes. When both APIs are needed, implement an uncontrolled wrapper that owns state and passes it to the controlled component; do not combine controlled props and internal fallback state in one component.
- Presentational components should generally own their markup and styling. Discourage arbitrary content-slot props typed as `React.ReactNode` or `React.ReactElement`; prefer structured, typed content props that let the component control presentation. Use ordinary `children` for natural composition, not as a workaround for component-owned content. Encourage headless components when their responsibility is reusable behavior, not presentation. For these non-presentational components, function-as-`children` and render-prop APIs (including `renderX` props) are valid ways to leave rendering to callers; do not require them to own presentation.
- Use a store when components share state.
- Allow short inline functions in JSX, including action handlers; prefer them when contextual type inference avoids restating complex parameter or return types. Discourage large inline functions that obscure the JSX structure; extract those into named functions.
- Fetch data in custom hooks, not UI components. Use `react-hook-form` for forms.
- Do not use effects to compute derived state, handle user actions, or synchronize application state when rendering, event handlers, or an existing state owner can express the same behavior directly.
- Allow narrowly scoped effects to synchronize with external systems: browser APIs, subscriptions, and imperative integrations. Require correct dependencies and cleanup. A focused lifecycle hook is valid abstraction, not inherently a hidden effect; moving avoidable state synchronization into a hook is not a fix.
- Allow `useLayoutEffect` for DOM measurement or layout correction that must happen before paint. Otherwise prefer `useEffect`. Check for feedback loops and unnecessary blocking work; neither hook is a violation by name alone.
- Before flagging an effect as avoidable, show a viable alternative preserving the required timing, updates, and cleanup. Do not demand a lifecycle rewrite without establishing that it works for the integration.
- Use the router for navigation. Preserve existing URL state and local/session storage settings.

### API errors

- All API routes, including tRPC procedures, must return HTTP status codes matching the failure. Invalid client input must return `400`, not `500`; use other appropriate `4xx` statuses for authentication, authorization, missing resources, and conflicts. Reserve `5xx` for unexpected server failures and infrastructure failures.
- Check error propagation through validation, services, and route handlers. Preserve known client-error classifications instead of wrapping them as generic internal errors. Cover relevant error paths with assertions on the resulting HTTP status, not just the error message. Do not classify every failure on a route as a client error.

### Control flow and files

- No nested ternaries, including JSX. Use guards or separate components. Replace conditionals deeper than two levels with early returns.
- Handle every switch variant explicitly. Compare `.length` explicitly.
- Comments must add information beyond the name. Keep them terse, without commentary or speculation.
- In Markdown files only, do not hard-wrap prose paragraphs or list items; rely on editor soft wrapping. Preserve line breaks required by Markdown syntax. This rule does not apply to code comments or code blocks.

### Tests

- Not every detail needs a test. Focus tests on critical user behavior and known regressions. Add preemptive regression coverage only for important functionality; do not require tests for incidental details or hypothetical low-impact failures.
- One representative input per code path, plus each boundary. Remove redundant cases; retain distinct contracts and paths.
- Tests must fail when the behavior breaks or its implementation is deleted. No mocks that just return the expected answer or always-true assertions.
- Remove regression tests when types, schemas, or deleted paths prevent the bug. Check that runtime inputs cannot bypass those protections.
- Test components only through Storybook. Use `.clienttest.ts` for frontend unit tests, not in-source tests. Keep backend and worker conventions.
- No dependencies on other tests, execution order, or another test's seeding.

### Security and performance

- Verify auth and RBAC on every changed read/write path. Check for bypasses and privilege escalation through roles, resource IDs, and tenant context. Upstream checks must cover every entry point.
- Elements containing customer data must use `ph-no-capture` to prevent capture by cloud session replay. Reuse protected renderers such as `JSONView` where appropriate. See [client telemetry privacy](.agents/skills/security-review/references/client-telemetry-privacy.md).
- Ingestion changes must not worsen throughput, latency, or resource cost per event, including downstream jobs and writes. Check per-event work, batching, concurrency, and backpressure. Compare changed execution under equivalent, representative loads: throughput, tail latency, CPU, memory, and I/O as relevant.
- ClickHouse queries must be fast at representative volumes and cardinalities. Follow the ClickHouse skill. Check schema and query plans; measure runtime, rows/bytes read, and peak memory, including broad supported filters. Tiny fixtures or cached results are insufficient.
- Compare performance before/after; assess new queries against documented budgets. Do not invent budgets or results. Missing measurements require verification before merge, not an unsupported claim of safety or regression.

## Findings

- **Defect:** verified correctness, security, or performance problem, or harmful design with a concrete consequence. State impact and urgency from the evidence.
- **Convention:** new violation of an applicable team rule. State the rule and offending code; do not imply runtime harm without separate evidence.
- Defects and Convention findings require a fix before merge unless a human explicitly accepts them. Their shared merge requirement does not imply equal severity. Identify the category in each finding's title.
- **Nit:** useful but optional improvement beyond team rules. At most two.
- Omit preferences, speculation, duplicates, and mechanical failures reported by CI.

Before reporting, compare with the PR base and read callers, safeguards, and tests. Look for evidence that disproves the finding. Bugs need a reachable trigger and consequence, supported by code, a reproducer, test, or execution trace. Rule violations need the rule and offending code. State assumptions; separate measurements from estimates. Unresolved risks belong in verification questions, not assertions or Nits.

Put correctness, security, and performance risks first, ordered by impact and recoverability, then rule violations. Report serious pre-existing bugs separately; they do not block this PR. Prefer local fixes over redesigns.

Give each finding a short title, precise location, evidence, and fix or next check. Group repeated causes or rule violations. Report every Defect and Convention finding. Review generated code and dependency changes for bugs; fix their source.

On re-review, verify fixes and report newly verified Defect and Convention findings. Do not repeat resolved feedback or add Nits. End with unresolved questions and checks actually run. Say when there are no findings; do not claim that proves safety.
