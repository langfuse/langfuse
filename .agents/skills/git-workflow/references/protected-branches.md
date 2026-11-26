# Protected branches and PR approval

Apply this organization baseline across Langfuse repositories. Inspect the target repository's active rules and approval automation before merging; repository-specific requirements can be stricter. Task authorization and GitHub approval are separate: permission to implement or open a PR does not authorize approving, merging, or bypassing protection.

## Default branch

- Make every change to `main` or another default branch through a PR, including documentation, generated updates, version bumps, and agent reports.
- Never push directly, force-push, or delete the default branch. Commit and push work to a task branch instead. Scope any permitted history rewrite to that unprotected task branch.
- Require approval before merge, along with the repository's required checks and other merge conditions. A passing test suite, resolved review threads, or an authorized implementation task does not supply approval.

## Approval paths

- Bugbot reviews PRs. When its review of the **latest commit** is clean, the separate approver bot can approve the PR. Verify both the fresh clean review and actual approval; silence, an old review, or another reviewer's clean report is insufficient.
- If Bugbot finds issues, fix them and wait for review of the new head, or ask a teammate to review and approve instead. Resolving a finding is not a substitute for either path.
- Sensitive paths, including CI workflows and `CODEOWNERS`, always need a person. Check the active configuration for additional protected paths and required teams; a bot approval cannot replace their review.
- In public repositories, a PR from a fork needs a maintainer's approval first; the bot then adds the second approval. Never treat a fork PR as eligible for bot-only approval.
- After every push, re-check the head SHA, review freshness, approvals, required checks, and unresolved threads. Do not infer current approval from a previously mergeable state.

Use the repository's configured reviewer identities rather than inventing a required status-check name. Claude, Greptile, Codex, and other technical reviews can add useful findings; they do not replace the approval paths above. Thread resolution never waives a required human approval. For bot-thread handling, follow the Git workflow skill; a deliberately skipped Bugbot finding still needs the teammate approval path.

## Read the current state

For the target repository and PR, inspect the rules and review commits as well as the summary:

```bash
gh api "repos/$REPO/rulesets"
gh pr view "$PR" --repo "$REPO" --json headRefOid,isCrossRepository,baseRefName,reviewDecision,reviewRequests,mergeStateStatus
gh pr checks "$PR" --repo "$REPO"
gh api --paginate "repos/$REPO/pulls/$PR/reviews" --jq '.[] | {user: .user.login, state, commit_id, submitted_at}'
```

Read the applicable ruleset details, changed paths, and Bugbot results too. Inherited organization rules and the approver bot's path/fork policies may not be captured in a local `CODEOWNERS` file or a review-count summary. If the required evidence is inaccessible, report the missing gate and ask the responsible human; do not declare the PR ready to merge.

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
