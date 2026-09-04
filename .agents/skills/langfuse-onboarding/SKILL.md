---
name: langfuse-onboarding
description: |
  Work out who the person in front of you is — outside contributor or Langfuse
  maintainer, and which product areas they own — record it, and walk them
  through onboarding. Use on "onboard me", "I'm new here", "what do I need to
  set up", "am I set up correctly", and whenever you need to know someone's
  role or focus and no identity file exists yet.
---

# Onboarding at Langfuse

Two jobs. **Establish who you are talking to**, once, and record it so no later
session has to ask again. Then **walk the onboarding path** for that person.

Everything an agent needs to behave differently for a contributor than for a
maintainer follows from the first job, so do it before anything else.

## Step 1 — derive the role; do not ask what you can find out

Two signals, in order. Both are read-only.

```bash
gh api repos/langfuse/langfuse --jq '.permissions | {push, maintain, admin}'
```

- **`push: true`** → maintainer. They have write access to the app repo.
- **`push: false`** or the call fails → treat as an outside contributor until they
  say otherwise.
- Then check whether the tracker answers a real read. That is the second signal,
  and the one that matters here: a maintainer with no tracker connection is a
  *setup gap*, not a contributor, and step 4 is where you fix it.

**Do not infer this from `git config user.email`.** That is a local setting, not
an identity: roughly a third of recent commits here come from personal addresses,
and both `@clickhouse.com` (the company domain — Langfuse is part of ClickHouse)
and the older `@langfuse.com` are still in daily use. Write access answers the
question directly, so ask that instead of guessing from a string.

Say what you found and let them correct it. Never announce a role silently — a
wrong guess sends someone down the wrong half of this file.

## Step 2 — record it, so this happens once

Write `~/.config/langfuse/me.md`. Machine-level on purpose: it has to answer the
question in `langfuse`, in `langfuse-docs`, and in a scratch directory, so it
cannot live in one repo. Create the directory if it does not exist.

```markdown
# Me, at Langfuse

- **Name:** <name>
- **Role:** maintainer | contributor
- **GitHub:** <login>          # from `gh api user --jq .login`
- **Tracker identity:** <name / email as Linear knows it, or "none">
- **Focus:** <the areas they own or are learning — their own words>
- **Checkouts:** <path to langfuse> · <path to langfuse-docs> · <others>
- **Connectors verified:** <the ones that answered a real read> · **missing:** <the rest>
- *Recorded <date> by an agent. Edit freely; delete to be asked again.*
```

**Never commit this file, and never put a secret in it.** It is notes, not
config: no tokens, no keys. A repo `.env` is the wrong home — those are
app configuration and one careless `git add` publishes them.

Ask for **Focus** rather than deriving it. What someone owns on paper and what
they are actually responsible for this quarter are different things, and only
they know the second. Keep their phrasing.

Do **not** record what they own project by project — that is derivable and it
goes stale within a week. `linear-work-rhythm` reads it live from the tracker
instead.

## Step 3a — the contributor path

Read `CONTRIBUTING.md` and walk it: setup, the four gating checks before opening
a PR, and `## Maintainers` for what is not theirs to do. `.agents/AGENTS.md` →
*Verification* is the honest bar, including which checks pass without running.

Stop there. Do not describe the issue tracker, the label policy, the weekly
rhythm, or the internal handbook — a contributor cannot open any of it, and
offering it reads as a door that is locked.

## Step 3b — the maintainer path

**The handbook owns the content; you drive it.** It is `content/handbook/` in
`langfuse/langfuse-docs`, published at `langfuse.com/handbook`. Read the pages,
work through them with the person, and answer from what they actually say today —
do not paraphrase them here, because this file would then be a second, stale copy
of a document that changes without it.

**Read it from `origin/main`, not the working tree.** A docs checkout is usually
parked on some branch from the last thing that person shipped, and a working-tree
read then quotes a handbook from weeks ago without saying so. This is not
hypothetical: the first run of this skill read a checkout **576 commits behind**.
Fetch, then read the blob — it needs no checkout switch and cannot disturb work
in progress:

```bash
cd <docs checkout> && git fetch -q origin main
git show origin/main:content/handbook/product-engineering/how-we-work/onboarding.mdx
```

Start with:

| Page | What it answers |
| --- | --- |
| `product-engineering/how-we-work/onboarding.mdx` | Day 1, Week 1, months 1–3, month 6 — the timeline and its outcomes |
| `product-engineering/how-we-work/how-we-ship.mdx` | Prioritisation, specification, releases, issue states |
| `tools-and-processes/using-linear.mdx` | How the tracker is used, and the working agreement |
| `how-we-work/productivity-and-ai.mdx` | Agent tooling, and keeping `AGENTS.md` current |
| `product-engineering/how-we-work/code-review.mdx` | What review is for here |

Then, in the repos:

- `.agents/AGENTS.md` — always loaded, and the two things it names that nothing
  else does: what a green check really proves, and the context handover.
- `linear-agent-writes` — read before the first agentic tracker write.
- `pr-stack-workflow` — before the first change too large for one PR.

**If a handbook page contradicts a skill or an `AGENTS.md`, say so.** That is a
finding worth reporting, not something to smooth over: one of the two is wrong,
and the person reading both will trust the wrong one.

## Step 4 — the connectors, and what breaks without each

Skills fail differently from code: an unauthorized connector does not error, the
agent simply cannot answer, and neither of you finds out why. So walk this list
and say which ones are missing rather than discovering it mid-task.

| Connect | Needed by |
| --- | --- |
| **Linear** | 17 skills — the tracker practice in all of it |
| **Datadog** | `debug-issue-with-datadog`, `datadog-query-recipes`, `incident-alert-tickets`, `weekly-production-review`, `infra-scaling`, `linear-bug-triage` |
| **AWS** (SSO) | preview seeding and `kubectl` in `langfuse-previews`, plus `infra-scaling`, `security-review` |
| **incident.io** | `incident-alert-tickets`, `weekly-production-review`, `debug-issue-with-datadog` |
| **PostHog** | `posthog-instrumentation`, and the usage half of `debug-issue-with-datadog` |
| **Sentry** | `sentry-instrumentation` |
| **Pylon** | `housekeeping` |
| **Hex** | `analyze-cloud-costs` |
| **Slack** | `weekly-production-review` |

**Datadog is the one that fails quietly**, and it takes four skills with it.
Prove each connector with a real read rather than trusting a status indicator —
a remote server can report itself connected before it holds a token.

Two prerequisites on the same checklist that are not connectors: the
`langfuse-docs` checkout below, which four skills read the handbook from, and a
working local Docker, without which the seeder cannot make test data.

## Step 5 — the checkouts, especially the docs one

A maintainer needs the app repo *and* the docs repo. The docs repo is the one
people skip, and then documentation quietly stops happening because the
alternative is a clone in the middle of a task.

```bash
git rev-parse --show-toplevel                        # where am I
ls -d ../langfuse-docs ~/code/langfuse-docs 2>/dev/null   # is the docs repo here
```

If `langfuse-docs` is missing, say so plainly and give the command — do not
carry on and hope:

```bash
git clone git@github.com:langfuse/langfuse-docs.git
```

It carries the handbook, the docs, and the changelog. Without it this skill
cannot read step 3b, and no shipped change can get a docs page or a changelog
entry without a separate detour.

Record the paths you found in `me.md` so the next session does not search again.

## What this skill does not do

It does not decide what to work on — that is
[`linear-work-rhythm`](../linear-work-rhythm/SKILL.md), which reads `me.md` and
answers from the tracker. If someone asks "what should I do today" and no
identity file exists, run step 1 and 2 first, then hand over.
