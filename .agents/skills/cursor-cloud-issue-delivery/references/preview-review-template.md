# Preview review template

Copy the block below into the PR description under `## Preview review`. Replace every
`<placeholder>`.

```markdown
## Preview review

**Preview URL:** https://pr-<N>.preview.langfuse.com
**Login:** auto sign-in as demo user (or `/auth/sign-in?autoSignIn=false` with credentials from the bot comment)

### Test data

- [ ] Default demo project is sufficient
- [ ] Extra seeding required (paste exact command):

```bash
# Only if needed — from PR branch, with preview port-forwards active
cd packages/shared
DATABASE_URL="postgresql://postgres:$PGPW@localhost:5432/postgres_langfuse" \
CLICKHOUSE_URL="http://localhost:8123" CLICKHOUSE_PASSWORD="$CHPW" \
NEXTAUTH_URL="https://pr-<N>.preview.langfuse.com" \
pnpm run seed:scenario -- <scenario> <flags>
```

### Review steps

1. Open <deep link or path> — expect <observable outcome>
2. <action> — expect <observable outcome>
3. <edge case or regression check> — expect <observable outcome>

### Artifacts

- Agent verified locally on Cursor Cloud (`localhost:3000`) on <date>
- Preview verified on `pr-<N>` on <date>
- Screenshots / recording: <paths or "N/A — backend-only change">

### Out of scope / not verified in preview

- <bullet list, or "None">

### If preview is asleep

Previews run Mon–Fri 08:00–24:00 Europe/Berlin. Open during working hours or ask someone with cluster access to wake the namespace (`langfuse-previews` skill).
```

## Authoring rules

- Use deep links from the seed CLI output when they exist.
- Each step must state an **observable** expected outcome, not "works correctly."
- Mention v4 vs v3 UI when the bug is mode-specific.
- Do not include internal ticket ids or customer identifiers.
- For backend-only changes, say what UI surface proves the fix indirectly, or mark
  preview steps as N/A and point to the automated test instead.
