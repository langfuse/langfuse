# Assistant progress log

Goals for the in-app agent activity UI. Challenge new work against this file
instead of growing hidden rules in the renderer.

## Goals

- Show what the assistant is doing as a short, human progress log — not a
  dump of thinking, MCP prefixes, or "Calling N tools".
- Live streaming and replay of the same turn must look the same. Completing
  the turn only changes the headline (`Working…` / latest tool → `Worked for`).
- Do not pretend a turn is finished. The UI cannot know whether an assistant
  text chunk is the last one. Copy, feedback, and `Reply...` belong only on a
  settled answer after the run has stopped.
- Keep product nouns from Langfuse docs (`traces`, `observations`, `widgets`,
  `dashboards`, `annotation queues`, `datasets`, `scores`). Keep labels short:
  no articles (`Creating widget`, not `Creating a widget`).

## Progress labels

The collapsed headline is a human label. The drawer starts collapsed, including
while the run is in progress.

Opened rows show every tool call as its own row with the **technical name**
(prefix stripped: `skill`, `getObservation`, `listObservations`). Human labels
are only for the collapsed progress indicator.

Headline verbs for a single tool:

- `get*` → Inspecting
- `list*` → Browsing
- `query*` → Checking
- Docs MCP (`docs_*`, `langfuseDocs_*`) → Reading Langfuse docs
- Skill tools → Learning skill

Consecutive Inspecting / Browsing / Checking tools that share a noun
(`getObservation` then `listObservations`) keep **one** headline:
`Looking at observations`. Do not rewrite an already-human override
(`Looking up observation filters` must not become `Looking at up…`).
Opened rows stay separate so the technical names remain visible.

## Thinking

The drawer includes every thinking block, in order with the tools around it.
Do not merge adjacent thoughts into one row. Completed thoughts start
collapsed (`Thought`); open one to read it.

We cannot shorten Anthropic summarized thinking from the client. If those
blocks are still too long, that is a model/config change, not a UI trim.

## Settled state

An assistant text message during a run is not the final answer. The model may
emit more tools, more thinking, or replace that text. The UI cannot know
whether a text chunk is last, so it does not guess from message order.

Settle only when the **run status** is terminal (succeeded, failed, cancelled).
Do not settle because the reveal animation paused or a text message arrived.
Until the run is terminal:

- do not render that text as an answer bubble
- keep it inside the activity drawer
- do not show copy or feedback
- do not switch the composer to `Reply...` unless a previous turn already
  settled an answer

When the run is terminal, text after the last thinking block becomes the
answer. Replaying a finished turn may still animate the transcript in; that
must not hide the answer or flip the headline back to Working.

## New tools

`utils.clienttest.ts` walks every Langfuse MCP tool, sandbox tool, docs tool,
and the skill tool. A tool needs either an override / special-case in
`utils.ts`, or a reviewed auto-parsed label in
`ACCEPTED_AUTO_IN_APP_AGENT_PROGRESS_LABELS`. Adding a tool without one fails
the test and prints the auto-parsed headline.
