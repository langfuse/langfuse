# Web source structure

Organize `web/src` around recognizable product domains and shared capabilities.
Domains live directly under `src`; related smaller capabilities live inside them.
Choose a home by responsibility and expected navigation, rather than company pods
or the number of files. The package boundaries between `web`, `worker`,
`packages/shared`, and `ee` remain intact.

## Navigation map

| Home                       | Responsibility                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tracing`              | Traces, observations, end users, media, trace graph, legacy tables                                                                    |
| `src/sessions`             | Sessions and session review                                                                                                           |
| `src/ai`                   | Assistant, provider connections, model catalog, gateway, skills, trace analysis                                                       |
| `src/analytics`            | Dashboards, visualizations, metrics, exploration, score reporting, analytics integrations and instrumentation                         |
| `src/datasets`             | Dataset management                                                                                                                    |
| `src/evaluators`           | Evaluator configuration and execution adapters                                                                                        |
| `src/experiments`          | Experiment runs, comparison, and review                                                                                               |
| `src/annotation`           | Annotation queues and comments                                                                                                        |
| `src/scores`               | Scores, score configuration, and corrections                                                                                          |
| `src/prompt-management`    | Prompt management                                                                                                                     |
| `src/playground`           | Playground, tool definitions, and structured output                                                                                   |
| `src/public-api`           | Public API contracts, project API keys, and MCP                                                                                       |
| `src/identity`             | Accounts, organizations, projects, authentication, access control, audit logs                                                         |
| `src/automation`           | Automations and Slack integration                                                                                                     |
| `src/alerts`               | Monitor configuration and alerting                                                                                                    |
| `src/integrations`         | Web callouts and external media storage                                                                                               |
| `src/data-export`          | On-demand and object-storage exports                                                                                                  |
| `src/background-jobs`      | Batch actions                                                                                                                         |
| `src/billing`              | Organization usage reporting                                                                                                          |
| `src/entitlements`         | Feature entitlement checks                                                                                                            |
| `src/operations`           | Background migrations                                                                                                                 |
| `src/migrations`           | Version upgrade behavior                                                                                                              |
| `src/release-management`   | Feature flags and previews                                                                                                            |
| `src/sdk`                  | SDK version reporting                                                                                                                 |
| `src/developer-experience` | Developer tools                                                                                                                       |
| `src/app`                  | Application shell, design system, shared tables/search/folder navigation, settings, onboarding, support, and shared browser utilities |

Examples: find observation rendering under `tracing/observations`, score settings
under `scores/configuration`, chart primitives under `analytics/visualization`,
LLM connections under `ai/provider-connections`, and trace-analysis UI under
`ai/trace-analysis`. Sessions are a sibling of tracing.

The assistant's runtime remains in the worker; `ai/assistant` owns its web UI and
request adapters. `public-api/mcp` serves external clients across product domains.
Generic folder navigation lives in `app/folder-navigation`, since both prompts
and datasets use it. Enterprise implementations follow the same domain naming
under `src/ee`, such as `ee/billing` and `ee/identity/auth`.

## Runtime and licensing boundaries

`src/app` describes the application, including its shared UI infrastructure.
Next.js App Router adapters live in `web/app`; Pages Router adapters live in
`web/pages`. Keep these route adapters thin and put product implementation in
the owning domain. Moving a framework route directory does not remove framework
dependencies; further extraction should happen when a concrete replacement
runtime needs it.

Keep enterprise code under `src/ee`. The repository license assigns enterprise
terms by directory, so moving enterprise files into unrestricted source folders
would change their license coverage. Browser/server and package dependency
boundaries apply equally inside enterprise domains.

## Adding code

- Start with the domain whose behavior changes. Nest a smaller capability under
  that domain instead of creating another top-level folder.
- Put reusable application infrastructure in `app`; keep product-specific code
  with its domain even when other domains consume its public contract.
- Use predictable kind folders such as `components`, `hooks`, `fns`, `constants`,
  `types`, and `server` where needed. Preserve cohesive modules and colocated tests.
- Public browser-safe exports use the capability's `index.ts`; server exports
  use `server/index.ts`. Explicit nested capabilities can have their own surfaces.
- Import the narrow surface that owns the contract. A containing domain does not
  need a barrel exporting all descendants. Avoid new barrels that mix browser UI
  with server execution or cause modules to evaluate through runtime cycles.
- Before adding reusable UI, inspect `app/design-system`. Extend an existing
  suitable component before introducing another implementation.
- Keep cross-package contracts in the package that owns them. Shared cannot
  depend on web, worker, or enterprise implementations.

## Moving existing code

1. Record the source-to-destination mapping and inspect runtime boundaries,
   existing cycles, framework entrypoints, and enterprise license coverage.
2. Prepare import and export specifier rewrites, including relative references
   in moved files. Preserve each reference's existing target module; directory
   grouping alone does not require changing exports or runtime behavior.
3. Apply history-preserving moves with the structure migration tooling and
   `git mv`. Carry tests, stories, fixtures, and documentation with their owners.
4. Update module references in mocks, worker URLs, configuration, Storybook,
   workflow path filters, architecture checks, and repository instructions.
5. Verify that old paths are gone, every expected file has a destination, and
   import resolution still works. Run lint, typecheck, Knip, relevant tests,
   production build and client-bundle scanning; verify affected browser flows.

Structural tooling must recognize explicit domain and nested-capability roots.
Every nested JavaScript or TypeScript implementation module must belong to a
declared capability or shared root, including modules inside `src/app` and
`src/ee`. The layout check permits only the explicit infrastructure roots
`src/server`, `src/__tests__`, `src/__e2e__`, `src/app/workers`, and
`src/app/polyfills` without a registry owner. Direct `src` bootstrap files,
type declarations, and documentation do not require capability ownership.
Readable rule names should explain the constraint in CLI and CI output, for
example `rule-8-no-deep-feature-imports`. Use findings to identify ownership or
runtime problems; improving a count alone does not establish a better boundary.
