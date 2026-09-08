---
name: langfuse-onboarding
description: |
  Configure an agent for whoever is using it — outside contributor or Langfuse
  maintainer, which areas they work on, and whether Linear answers. On Cursor
  Cloud, identify the run owner (not Cloud gh permissions) and treat missing
  Linear as a LINEAR_API_KEY secret to set. Use on "onboard me", "I'm new here",
  "what do I need to set up", "am I set up correctly", "why can't you see my
  tickets", "what should I do today" when me.md is missing, and whenever you
  need someone's role and no identity file exists yet.
---

# Onboarding at Langfuse

Two jobs, and they are separable — most of the time you only want the first.

1. **Configuration** (steps 1, 2 and 4): work out who is using this agent, what
   they work on, and what they are connected to. Seconds, not a session. Someone
   who has been here a year needs this and nothing else — do not walk a
   colleague through a new-joiner path to find out their name.
2. **Onboarding** (steps 3 and 5): the walkthrough, for people who are actually
   new.

Everything an agent needs in order to behave differently for a contributor than
for a maintainer comes from the first, so do that before anything else.

## Step 1 — name them, then prove Linear; do not ask what you can find out

Run the local probe first, then stop at the first path that names a person:

```bash
bash .agents/skills/langfuse-onboarding/scripts/whoami.sh
```

It reports whether `me.md` exists, whether a Linear token is in the environment
(boolean only — it never prints the secret), a `linear_viewer` line if that
token works, and whether `gh api user` works. On Cursor Cloud, a working
`linear_viewer` is tracker identity even when Linear MCP is `needsAuth`.

**Who, in this order:**

1. **`~/.config/langfuse/me.md`** — already recorded. Skip to Linear.
2. **Cursor Cloud run owner.** If `cursor-cloud` tools exist, call `run-info`.
   Use `owningUserName` and `owningUserEmail`. Join the name to the roster
   (`components-mdx/team-members.mdx` in a docs checkout, or
   `gh api repos/langfuse/langfuse-docs/contents/components-mdx/team-members.mdx`).
   A roster row, or an `@clickhouse.com` / `@langfuse.com` address, is a
   **maintainer**. Take the GitHub handle from the roster.
3. **`gh api user` succeeded** (desktop and similar). Then
   `gh api repos/langfuse/langfuse --jq '.permissions | {push, maintain, admin}'`.
   **`push: true`** → maintainer. **`push: false`** → contributor until they
   say otherwise.
4. If none of the above named them, **ask once**.

**Do not treat Cursor Cloud `gh` as the person.** That token is a read-only
integration: `gh api user` is 403 and `.permissions.push` is false even for
maintainers. **Do not infer identity from `git config user.email`** — on Cloud
it is `cursoragent@cursor.com`, and elsewhere it is often a personal address.
Langfuse is part of ClickHouse; `@clickhouse.com` and `@langfuse.com` are both
in daily use.

**Linear, in the same step** — a maintainer with no tracker is a *setup gap*,
not a contributor. Prove access with a real read, not a status indicator:

1. Linear MCP tools exist and the namespace is not `needsAuth` → query `viewer`
   (or list issues).
2. Else if `whoami.sh` reported a Linear token → GraphQL `{ viewer { name email } }`
   with that env var (never echo it), or
   `linear-context-handover/scripts/lf-context.sh`. Record the viewer as
   tracker identity. Cloud often has the secret while Linear MCP still shows
   `needsAuth` — the token is the access; do not wait on OAuth.
3. Else: no Linear. On Cursor Cloud, **do not call `mcp_auth`** — it only works
   in the desktop IDE. Tell them, in one line, to create a personal Linear API
   key (Linear → Settings → Account → Security) and add it as secret
   **`LINEAR_API_KEY`** at https://cursor.com/dashboard/cloud-agents, then start
   a **new** Cloud run. This run cannot see a secret added later. On desktop,
   authorizing the Linear MCP is enough; `LINEAR_API_KEY` is the headless
   fallback.

Say what you found and let them correct it. Never announce a role silently.

## Step 2 — record it, so this happens once

Write `~/.config/langfuse/me.md`. Machine-level on purpose: it has to answer the
question in `langfuse`, in `langfuse-docs`, and in a scratch directory, so it
cannot live in one repo. Create the directory if it does not exist.

```markdown
# Me, at Langfuse

- **Name:** <name>
- **Role:** maintainer | contributor
- **GitHub:** <login>          # roster handle on Cloud; `gh api user` on desktop
- **Tracker identity:** <name / email as Linear knows it, or "none">
- **Focus:** <the areas they own or are learning — their own words>
- **Checkouts:** <path to langfuse> · <path to langfuse-docs> · <others>
- **Connectors verified:** <the ones that answered a real read> · **missing:** <the rest>
- *Recorded <date> by an agent. Edit freely; delete to be asked again.*
```

**Never commit this file, and never put a secret in it.** It is notes, not
config: no tokens, no keys. A repo `.env` is the wrong home — those are
app configuration and one careless `git add` publishes them.

**Ask for Focus — once — rather than deriving it.** What someone owns on paper
and what they are responsible for this quarter are different things, and only
they know the second. One question, their phrasing, written down so nobody asks
again. If they would rather not answer, record that and move on; a missing Focus
line is not a blocker.

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

## Step 3b — the maintainer path, for people who are new

**Skip this for an established colleague.** If they have commits in this repo
going back months, they know how the team ships; reading it back to them wastes
their time and yours. Configuration plus step 4 is the whole job. Offer the
walkthrough rather than starting it: *"want me to go through the handbook pages,
or just fix the two missing connectors?"*


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
| `content/handbook/product-engineering/how-we-work/onboarding.mdx` | Day 1, Week 1, months 1–3, month 6 — the timeline and its outcomes |
| `content/handbook/product-engineering/how-we-work/how-we-ship.mdx` | Prioritisation, specification, releases, issue states |
| `content/handbook/tools-and-processes/using-linear.mdx` | How the tracker is used, and the working agreement |
| `content/handbook/how-we-work/productivity-and-ai.mdx` | Agent tooling, and keeping `AGENTS.md` current |
| `content/handbook/product-engineering/how-we-work/code-review.mdx` | What review is for here |

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
| **Linear** | 17 skills — the tracker practice in all of it. MCP, or `LINEAR_API_KEY` on headless/Cloud (step 1). |
| **Datadog** | `debug-issue-with-datadog`, `datadog-query-recipes`, `incident-alert-tickets`, `weekly-production-review`, `infra-scaling`, `linear-bug-triage` |
| **AWS** (SSO) | preview seeding and `kubectl` in `langfuse-previews`, plus `infra-scaling`, `security-review` |
| **incident.io** | `incident-alert-tickets`, `weekly-production-review`, `debug-issue-with-datadog` |
| **PostHog** | `posthog-instrumentation`, and the usage half of `debug-issue-with-datadog` |
| **Sentry** | `sentry-instrumentation` |
| **Pylon** | `housekeeping` |
| **Hex** | `analyze-cloud-costs` |
| **Slack** | `weekly-production-review`, and reading any thread someone links you |

**Datadog is the one that fails quietly**, and it takes four skills with it.
Slack has no hosted MCP server, so it arrives through whichever connector your
tool provides rather than through this repo's config — check it the same way,
because a linked thread you cannot open is a dead end mid-conversation.
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

It carries the handbook, the docs, the changelog, and the team roster
(`components-mdx/team-members.mdx` — names, roles, GitHub handles). Without it
this skill cannot read step 3b, nobody can tell you who a commit author is, and
no shipped change gets a docs page or a changelog entry without a separate
detour.

Record the paths you found in `me.md` so the next session does not search again.

## What this skill does not do

It does not decide what to work on — that is
[`linear-work-rhythm`](../linear-work-rhythm/SKILL.md), which reads `me.md` and
answers from the tracker. If someone asks "what should I do today" and no
identity file exists, run step 1 and 2 first. If Linear still does not answer,
stop and ask them to set `LINEAR_API_KEY` (Cloud) or authorize the Linear MCP
(desktop) — do not invent a day's work.
