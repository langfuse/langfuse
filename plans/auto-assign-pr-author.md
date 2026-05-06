# Auto-Assign PR Author

## Goal

Every pull request opened against the langfuse repository is automatically
assigned to the person who opened it, without any manual step.

---

## Why this is non-trivial

GitHub has no native setting for "always assign the opener". The `assignees`
field on a PR defaults to empty regardless of how the PR is created — via the
web UI, `gh pr create`, or `gh stack submit --auto`. A solution must therefore
hook into the PR lifecycle after the fact rather than at creation time.

---

## Solution: GitHub Actions `pull_request.opened` event

A workflow file checked into the repository registers a listener for the
`pull_request` event filtered to `opened`. When any PR is opened, GitHub
triggers the workflow as the PR author's identity is already present in the
event payload (`context.payload.pull_request.user.login`). The workflow calls
the GitHub REST API to add that login as an assignee on the same PR.

### Why this approach

- **Works for every creation path.** Web UI, `gh pr create`, `gh stack submit`,
  GitHub Copilot — all fire the `pull_request.opened` event.
- **No personal setup required.** Once the workflow is merged to `main`, it
  runs for every contributor automatically.
- **No third-party action needed.** `actions/github-script` is a first-party
  GitHub action that exposes the authenticated Octokit client. The one API call
  needed (`addAssignees`) is a standard REST endpoint.
- **GITHUB_TOKEN is sufficient.** The default `GITHUB_TOKEN` provided to every
  workflow has `pull-requests: write` permission, which covers setting
  assignees. No additional secrets or app credentials are needed.

### How the event payload works

The `pull_request.opened` event provides:
- `context.repo.owner` / `context.repo.repo` — the repository coordinates
- `context.payload.pull_request.number` — the PR number
- `context.payload.pull_request.user.login` — the GitHub username of the opener

These three pieces are everything the `issues.addAssignees` API call needs.
(GitHub uses the issues API for PR assignees because PRs are issues internally.)

---

## Implementation

**File:** `.github/workflows/auto-assign-pr-author.yml`

```yaml
name: Auto-assign PR to author
on:
  pull_request:
    types: [opened]

jobs:
  assign:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.addAssignees({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.pull_request.number,
              assignees: [context.payload.pull_request.user.login]
            })
```

Two details worth noting:

1. **`permissions: pull-requests: write`** — explicitly declares the minimum
   permission scope. GitHub recommends scoping workflow permissions to the
   minimum needed; this makes the intent clear and satisfies stricter repository
   permission policies.

2. **`actions/github-script@v7`** — pinning to a major version tag rather than
   a SHA is standard practice in the langfuse repo for first-party GitHub
   actions. Update to a newer major if the action publishes breaking changes.

---

## Delivery

Single commit, single file. No migration, no schema change, no package
dependency. The workflow becomes active the moment it is merged to the default
branch.

**Verification:** Open a test PR after merge and confirm the opener appears
in the "Assignees" sidebar within a few seconds of opening.

---

## Limitations

- **Reopened PRs are not re-assigned.** The filter is `types: [opened]`, not
  `[opened, reopened]`. A closed-and-reopened PR will not trigger the workflow
  a second time. This is intentional — by the time a PR is reopened it usually
  already has an assignee, and re-assigning would override any manual changes.
  Add `reopened` to the `types` list to change this behaviour.
- **Does not back-fill existing PRs.** PRs opened before this workflow is merged
  will not be assigned retroactively.
- **One assignee per PR.** The workflow assigns only the opener. If a PR has
  co-authors or a different intended assignee, the assignee field can still be
  changed manually after the workflow runs.
