# Linear engineer report template

Post this as a **comment on the originating Linear issue** when Phase 6 preview QA
passes and the PR is ready for review. This is the only handoff report the engineer
needs.

Copy the block below and replace every `<placeholder>`.

```markdown
## Cloud Agent handoff

**PR:** https://github.com/langfuse/langfuse/pull/<N> (ready for review)
**Preview:** https://pr-<N>.preview.langfuse.com

### 1. What exactly was the issue?

<Plain-language description of the user-visible or system failure. One short
paragraph. State root cause in one sentence if confirmed. Cite affected surface
(route, API, job) — no internal-only jargon without explanation.>

### 2. How this was reproduced

<Numbered steps or commands another engineer can replay locally or in preview
setup. Include:>

- seed scenario + flags, or "default demo project"
- failing test file/assertion (for bugs), or manual steps before the fix
- what observable behavior confirmed the bug (error message, wrong UI state, etc.)

### 3. How this can be tested in the preview deployment

<Numbered click-path on `https://pr-<N>.preview.langfuse.com`. For each step,
state the action and the **expected outcome**. Include:>

- whether extra seeding is required (paste exact command, or "default demo is enough")
- deep links from seed CLI output when available
- v4 vs v3 UI note if relevant
- screenshots / recording paths if UI changed

### Verification performed

- Local (Cursor Cloud): <checks run + summary lines>
- Preview: <date verified, synthetic data only>
- Review-agent comments: <all addressed / N/A>
```

## Posting rules

- Comment on the **same Linear issue** the Cloud Agent run was scoped to. If none
  was linked, ask the human which issue to update before posting.
- Use the Linear MCP to add the comment; do not paste internal ticket ids into
  public GitHub commit messages or PR titles (repo `AGENTS.md` rule).
- Post only after preview QA passes and the PR is marked ready for review.
