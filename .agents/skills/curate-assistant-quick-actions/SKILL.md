---
name: curate-assistant-quick-actions
description: Refresh Langfuse's curated in-app assistant quick-action catalog from recent internal agent-turn traces and feedback. Use when reviewing common assistant questions, regenerating contextual starter actions, or performing the periodic assistant-action curation workflow through an authenticated Langfuse MCP server.
---

# Curate Assistant Quick Actions

Update only `web/src/ee/features/in-app-agent/quickActions.ts`. Keep raw user
questions in the local session, never in files, commits, analytics, or action
labels/prompts. Do not commit or push changes.

## Preconditions

1. Require the authenticated `langfuse-cloud` MCP server connected to the
   internal AI-features project and exposing `listObservations` and
   `listScores`. Use `langfuse-docs` separately to validate product terminology;
   it is not a substitute for the usage-data connection.
2. Read the current catalog and preserve unrelated working-tree changes.
3. Before querying, ask the user for the initial time frame. Recommend the last
   30 complete days through now in UTC and ask in the same question whether the
   skill may automatically expand to 60 and then 90 days when evidence is
   sparse. Wait for the answer. If the user already supplied a window, use it
   without asking again; treat an instruction to proceed without further
   questions as approval for the recommended window and expansion.

If the MCP connection or required project data is unavailable, stop without
editing the catalog and state the missing prerequisite.

## Collect Usage

1. Call `listObservations` for external users first with:
   - `name: "agent-turn"`
   - `environment: "langfuse-in-app-agent"`
   - the bounded UTC `fromStartTime` and `toStartTime`
   - `fields: ["id", "traceId", "startTime", "input", "metadata"]`
   - `filter: [{"column":"metadata","type":"stringObject","key":"langfuse_user_email","operator":"does not contain","value":"@langfuse.com"}]`
   - `limit: 100`
2. Repeat the same paginated call for internal users, changing only the filter
   operator to `ends with`. Keep the two cohorts separate. Ignore observations
   without `metadata.langfuse_user_email` because their cohort is unknown.
3. Follow `meta.cursor` independently for each cohort until exhausted or 1,000
   observations are collected per cohort. Report truncation separately.
4. Treat observations with `metadata.agent_session_type === "new"` as primary
   evidence. Keep later turns only as supporting evidence.
5. From each primary observation, extract the current user message and
   `input.context.current_url.pathname`. Ignore malformed or missing values.
6. Map paths to the catalog contexts exactly as the source does:
   - `traces`, `observations`, `sessions`, `users`, `monitors` → `tracing`
   - `dashboards`, `widgets` → `dashboards`
   - `prompts`, `playground` → `prompts`
   - `scores`, `evals`, `annotation-queues` → `evaluators`
   - `datasets`, `experiments` → `datasets`
   - everything else → `default`
7. Call `listScores` for `name: "in_app_agent_feedback"` over the same time
   window, page through all results, and join feedback by `traceId` within each
   cohort. Interpret Boolean `1` as positive and `0` as negative.
8. After collecting both cohorts, count usable external primary observations.
   Evidence is sparse when there are fewer than 100 usable external primary
   observations or no non-default context has four qualifying clusters. When
   expansion was approved, rerun both cohorts and feedback over the next wider
   window (up to 60, then 90 days), replacing rather than combining the prior
   result so observations are not double-counted. Stop as soon as evidence is
   sufficient or the approved maximum is reached. If expansion was not
   approved, report the shortfall and leave the catalog unchanged.

## Curate the Catalog

1. Semantically cluster primary questions within each context and cohort. Count
   distinct trace IDs, not repeated wording. Use later turns only to clarify
   intent.
2. Rank and qualify actions using the external cohort only: distinct primary
   conversations first, then net positive feedback. Exclude a cluster when
   negatives exceed positives.
3. Compare the internal cohort against the external ranking to identify overlap
   and QA-heavy or internal-only requests. Treat internal evidence as
   corroboration only; never let it satisfy a frequency threshold or introduce
   an action without qualifying external evidence.
4. Require at least three distinct external primary traces for a cluster. If a
   context has fewer than four qualifying clusters, preserve its existing
   entry; `undefined` continues to use the default actions.
5. Keep the best four actions per qualified context. Synthesize
   product-generic prompts that use the current page context without copying
   customer data or specific identifiers.
6. Preserve an existing action ID when its intent is materially unchanged.
   Create new lowercase kebab-case IDs otherwise. Use a short two-to-five-word
   label followed by a longer, self-contained prompt that says what the
   assistant should inspect and return.
7. Before editing, use `langfuse-docs` to validate every proposed action against
   current Langfuse terminology. Prefer documented concepts such as traces,
   observations, sessions, generations, scores, linked prompt versions, token
   usage, and cost; do not invent product terms.
8. Edit only `IN_APP_AGENT_QUICK_ACTIONS_BY_CONTEXT`. Do not change defaults,
   route classification, tests, or attribution code.

## Validate and Report

1. Format the catalog file with Prettier.
2. Run the focused quick-action catalog client test and the web typecheck.
3. Print the selected and final time windows and why expansion occurred, if it
   did. Then print a concise summary for each changed context: separate external
   and internal sample counts, overlap/differences, selected action IDs,
   positive/negative/neutral evidence, and replacements. Do not print raw
   questions or email addresses.
4. Leave the changes local and uncommitted.

Return valid Markdown. Use complete headings and lists, close links and code
fences, and avoid malformed tables or dangling backticks.
