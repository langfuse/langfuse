---
name: housekeeping
description: Review an engineer's recurring work queue across Linear, Pylon, and GitHub. Use when asked to triage assigned issues, waiting or urgent work, customer-support follow-ups, stale tickets, or pull requests where the engineer is a direct or team reviewer; return concrete action recommendations and gate all writes on explicit human approval.
---

# Housekeeping

## Scope

Review live work queues and recommend what the engineer should do next. Stay read-only until the human explicitly approves specific writes.

Use this skill for:

- Linear issue triage, assigned work, waiting issues, urgent-priority issues, and stale cleanup candidates.
- Pylon customer issues that need an engineer response, engineering follow-up, linked-ticket check, or stale close recommendation.
- GitHub pull requests where the engineer is a direct or team reviewer.

Do not use this skill for deep root-cause debugging, implementation, incident response, or broad roadmap planning unless the user explicitly asks to continue from a recommendation into that work.

## Required Behavior

Every reviewed item must include an action recommendation. If evidence is insufficient, recommend the next inspection step rather than leaving the action blank.

Use these action labels:

- `act-now`: needs attention today.
- `quick-win`: likely under 15 minutes.
- `todo`: should be picked up in the next 1-2 weeks.
- `backlog`: real but can wait months.
- `waiting`: next move is outside the engineer or team.
- `stale-candidate`: likely safe to close or cancel, but needs human confirmation.
- `no-action`: no current action beyond monitoring; explain why.

Include confidence for each recommendation: `high`, `medium`, `low`, or `unknown`.

## Workflow

1. Identify the current engineer in each system from the available connector, CLI, or authenticated API context. If identity cannot be determined for a system, say so and continue with the other systems.
2. Gather live data before recommending action. Do not rely on memory for current queues.
3. Inspect comments, latest activity, linked issues, checks, and review threads when status or ownership is ambiguous.
4. Cluster duplicates or related items before prioritizing.
5. Return recommendations ordered by urgency, then quick wins, then cleanup.
6. Before any write, present a decision table and wait for explicit row IDs and actions.

## Linear Review

Fetch:

- Issues assigned to the engineer in `Triage`, `In Progress`, and `Waiting`.
- Active urgent-priority issues relevant to the engineer or team.
- Recent comments for waiting, stale, urgent, or ambiguous issues.

Recommend:

- `act-now` for data loss, production regressions, security/privacy risk, billing/cost correctness, repeated customer pain, blocked teammate/release, or reporter waiting on the engineer.
- `todo` for bounded fixes with current customer impact.
- `backlog` for real but lower-impact work, product-design work, or upstream-dependent work.
- `waiting` only when the latest evidence shows the next step is on the customer, upstream, another team, or an external dependency.
- `stale-candidate` when the issue has no recent meaningful activity, no clear current customer blocker, and appears superseded, abandoned, solved, or duplicated.

If a triage issue has an obvious low-risk fix, include the quick-fix path and whether it should be handled before broader prioritization.

## Pylon Review

Use a Pylon connector, MCP server, or authenticated API only if already available. Do not ask the user to paste secrets into chat. If Pylon is unavailable, report that limitation and continue.

Review open issues assigned to the engineer or their team, plus urgent or high-priority issues where engineering appears to own the next step. Use Pylon's issue states:

- `new`: no team response yet.
- `waiting_on_you`: next action is on the team.
- `waiting_on_customer`: next action is on the customer.
- `on_hold`: pending external work, commonly an engineering fix.
- `closed`: resolved; include only if it reopened or is linked from an active item.

Inspect:

- latest customer and internal activity;
- priority, requester/account, assignee/team, source, and age;
- linked Linear, GitHub, Jira, or other external issues;
- whether the linked engineering issue is still open, completed, stale, or missing.

Recommend:

- `act-now` when the customer is waiting on the team, priority is urgent/high, an SLA looks at risk, or a linked engineering issue is complete and the customer needs an update.
- `quick-win` for a short reply, clarification request, link repair, or status correction.
- `waiting` when the latest customer-facing state correctly waits on the customer or an external ticket.
- `todo` when engineering owns a real follow-up but it is not same-day urgent.
- `stale-candidate` for old `waiting_on_customer` or `on_hold` issues with no meaningful recent activity, but never close them without human approval.

For Pylon issues linked to Linear or GitHub, make the recommended action consistent across systems. Example: if a Linear issue is done and Pylon is still `on_hold`, recommend a customer update and status change instead of more engineering work.

## GitHub Review

Find open pull requests where the engineer is requested as a direct reviewer and where one of the engineer's teams is requested. Include PRs across relevant organization repositories, not only the current repository.

Inspect:

- PR title, repo, age, author, requested reviewer source, mergeability, review decision, and checks;
- changed files and diff size;
- unresolved comments, bot findings, requested changes, and author responses;
- whether failures are code failures or external authorization/noise.

Recommend:

- `quick-win` with `approve` only for small focused diffs, acceptable checks, no unresolved material concerns, and tests or plainly trivial behavior.
- `quick-win` with `comment` for small PRs needing one narrow author action such as rebase, CLA, missing test, or cleanup.
- `act-now` for blocked releases, security fixes, production regressions, or PRs where the engineer is the bottleneck.
- `todo` for meaningful PRs that need real review soon.
- `stale-candidate` for old, conflicting, duplicate, or superseded PRs.
- `no-action` when a PR is blocked on the author, failing CLA, merge conflicts, unresolved requested changes, or unrelated team ownership.

Do not approve, request changes, comment, close, merge, or edit a PR without explicit human approval for that PR.

## Human Gates

All writes require explicit human confirmation by row ID. This includes:

- Linear comments, status changes, priority changes, assignee changes, labels, cancellation, or customer-need changes.
- Pylon replies, internal notes, status changes, assignment, tags, snoozes, closes, or external-issue links.
- GitHub approvals, comments, requested changes, reviewer changes, closes, merges, labels, or branch actions.

If the user says "do the quick ones", first show the exact proposed writes and ask for confirmation unless they already named the exact row IDs.

Use this table before writes:

| ID | System | Item | Recommended Action | Proposed Write | Confidence | Human Decision |
| --- | --- | --- | --- | --- | --- | --- |

## Output

Return valid Markdown. Keep the overview concise and action-first.

Default structure:

1. `Top Actions`: the highest-priority items across all systems.
2. `Quick Wins`: items likely under 15 minutes.
3. `Full Queue`: grouped by Linear, Pylon, and GitHub.
4. `Decisions Needed`: stale closes, cancellations, comments, approvals, or status changes that require approval.

For each item include:

- system and link or identifier;
- title or short description;
- evidence from current data;
- action recommendation;
- confidence.

Use concrete dates for age and stale reasoning. Avoid vague phrases like "recently" when exact timestamps are available.
