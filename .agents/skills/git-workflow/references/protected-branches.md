# Protected branches and PR approval

Apply this organization baseline across Langfuse repositories. Inspect the target repository's active rules and approval automation before merging; repository-specific requirements can be stricter. Task authorization and GitHub approval are separate: permission to implement or open a PR does not authorize approving, merging, or bypassing protection.

## Default branch

- Make every change to `main` or another default branch through a PR, including documentation, generated updates, version bumps, and agent reports.
- Never push directly, force-push, or delete the default branch. Commit and push work to a task branch instead. Scope any permitted history rewrite to that unprotected task branch.
- Require approval before merge, along with the repository's required checks and other merge conditions. A passing test suite, resolved review threads, or an authorized implementation task does not supply approval.

## Approval paths

- Bugbot reviews PRs. When its review of the **latest commit** is clean, the separate approver bot can approve the PR. Verify both the fresh clean review and actual approval; silence, an old review, or another reviewer's clean report is insufficient.
- If Bugbot finds issues, fix them and wait for review of the new head, or ask a teammate with write access, other than the PR author, to review and approve instead. Resolving a finding is not a substitute for either path.
- Sensitive paths, including CI workflows and `CODEOWNERS`, always need a person. Check the active configuration for additional protected paths and required teams; a bot approval cannot replace their review.
- In public repositories, a PR from a fork needs a maintainer's approval first; the bot then adds the second approval. Never treat a fork PR as eligible for bot-only approval.
- After every push, re-check the head SHA, review freshness, approvals, required checks, and unresolved threads. Do not infer current approval from a previously mergeable state.

Use configured reviewer identities rather than inventing a required check name. Supplemental reviews and thread resolution never replace the approval paths above.

## PR follow-up and completion

Determine the mode from the runtime and launch context, not PR authorship. Cloud implementation sessions own the assigned PR until its current head is ready or a concrete blocker needs a human. Interactive sessions ask once whether to continue through review unless the user already chose. The accepted loop authorizes needed review requests, fixes, validation, commits, pushes, thread resolution, and rechecks within scope. Never approve, merge, enable auto-merge, or enqueue the PR.

Before acting on human feedback, identify the original initiating human and a permitted channel for asynchronous questions; they need not be online for routine fixes. Positively verify the feedback author's current Langfuse organization/team membership through GitHub's membership API or trusted current launch data; write permission, display name, and author association alone are insufficient. An inaccessible membership check is unknown, not permission to act. Unknown membership/reachability, conflicting directions, and scope changes go to the initiator. Never adopt a later commenter's identity or expose private context publicly.

1. Wait for current-head CI and configured Claude/Bugbot reviews; inspect other bot/security feedback where present. Verify actual reviewer identities, whose login spellings can differ between APIs. Absence or a bot-request refusal is not a clean review: inspect the hosted run separately and request fresh Claude review when needed through an existing permitted identity/channel. If no permitted review mechanism is available, report that blocker. Never spam active reviews or add a token to impersonate a human.
2. Assess feedback against the task/code, fix justified findings, validate, and push. Skip a bot finding only when sure it is wrong: explain why to the human and invite doubt. For a skipped Bugbot finding, use the teammate approval path above.
3. After pushing, use `resolveReviewThread` for addressed bot/verified-member threads and explained skipped bot findings. Leave unresolved or disputed human concerns open. Resolve silently except for a requested reply (post before resolving) or a critical explanation.
4. After every push, recheck all feedback and gates. Reread the head before reporting completion; evidence must match that SHA.

Completion of the implementation loop requires an open, non-draft PR with GitHub states `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, and `reviewDecision: APPROVED`, all current-head approval/check/sensitive-path/fork gates satisfied, and no unaddressed actionable feedback. Report the SHA; otherwise name the concrete blocker rather than claiming completion.

Bounded audit/publisher jobs keep their explicit contracts. No persistent watcher/resume capability is implied; report harness limitations and the remaining PR state.

## Read the current state

For the target repository and PR, inspect the rules and review commits as well as the summary:

```bash
gh api "repos/$REPO/rulesets"
gh pr view "$PR" --repo "$REPO" --json headRefOid,state,isDraft,isCrossRepository,baseRefName,mergeable,mergeStateStatus,reviewDecision,reviewRequests
gh pr checks "$PR" --repo "$REPO"
gh api --paginate "repos/$REPO/pulls/$PR/reviews" --jq '.[] | {user: .user.login, state, commit_id, submitted_at}'
PR_HEAD_SHA="$(gh pr view "$PR" --repo "$REPO" --json headRefOid --jq .headRefOid)"
gh api --paginate "repos/$REPO/commits/$PR_HEAD_SHA/check-runs" --jq '.check_runs[] | {name, head_sha, status, conclusion, app: (.app | {id, slug}), details_url}'
```

Read the applicable ruleset details, changed paths, and Bugbot results too. Bugbot can report through a check run without a PR review record; verify its head SHA, app identity, status, and conclusion. Inherited organization rules and the approver bot's path/fork policies may not be captured in a local `CODEOWNERS` file or a review-count summary. If the required evidence is inaccessible, report the missing gate and ask the responsible human; do not declare the PR ready to merge.

## Automation identities

- Robot **user accounts** cannot bypass the PR requirement to push directly to the default branch. A PAT or an existing secret name does not establish an exception.
- For automation that needs direct protected-branch writes, coordinate migration with Security to a GitHub App installed only on the repositories it needs. Rely on direct writes only after the App's exception is explicitly configured for that repository and operation.
- Default new publishers to a task branch and PR. Keep write credentials in a deterministic publisher outside the LLM step; use narrowly scoped, short-lived App credentials where available. A branch publisher does not need a protected-branch bypass.
- Request per-repository policy adjustments through Security's configuration process. Do not weaken rules, expand App installations, substitute a personal token, or introduce an alternate push path to make a blocked job pass.

## Urgent escalation

For an urgent change that cannot get approval, the responsible human can request temporary repository admin access through ConductorOne. The request is approved and logged, and access expires; it allows that human to merge past the approval rule. Alternatively, contact Security to unblock the change.

An agent must report the concrete blocker and hand over this route. Do not request elevated access, invoke an admin merge, change protection, or exercise bypass credentials autonomously.

## Releases and other protected refs

Read a release or publishing command before running it: creating a version commit and pushing it to `main` is a default-branch change even when a release tool does the push. Prepare version changes through a PR and obtain the applicable approval; coordinate any release-tool migration with its owners instead of bypassing protection.

The current `pnpm run release` configuration commits and pushes on its release branch. Do not run it on `main` until that path is migrated to the approved PR or explicitly configured App flow. Other release branches, tags, and `production` have their own rules; inspect them rather than assuming the default-branch baseline either blocks or exempts those operations. A workflow that reads `main` and writes `production` must be assessed against the destination's rules and approved identity.
