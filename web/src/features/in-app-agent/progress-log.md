# Assistant progress log

Goals for the in-app agent activity UI. Challenge new work against this file
instead of growing hidden rules in the renderer.

## Goals

- Show what the assistant is doing as a short, human progress log — not a
  dump of thinking, MCP prefixes, or "Calling N tools".
- Live streaming and replay of the same turn must look the same. Completing
  the turn only changes the headline (`Working…` / latest tool → `Worked for`).
- Do not pretend a turn is finished. Copy, feedback, and `Reply...` belong
  only on a settled answer after the run has stopped.
- Keep product nouns from Langfuse docs (`traces`, `observations`, `widgets`,
  `dashboards`, `annotation queues`, `datasets`, `scores`). Keep labels short:
  no articles (`Creating widget`, not `Creating a widget`).

## Progress labels

The collapsed headline is the latest tool's human label (or `Working…`).
The drawer starts collapsed, including while the run is in progress. Opening
it shows every tool call as its own row with the technical name (prefix
stripped: `skill`, `getObservationFilterValues`, `listObservations`).

Human headline verbs:

- `get*` → Inspecting
- `list*` → Browsing
- `query*` → Checking
- Docs MCP (`docs_*`, `langfuseDocs_*`) → Reading Langfuse docs
- Skill tools → Learning skill

## Thinking

The drawer includes every thinking block, in order with the tools around it.
Completed thoughts start collapsed (`Thought`); open one to read it. If you
only see one `Thought` after opening the activity drawer, the model only
emitted one. Later thoughts are no longer dropped.

We cannot shorten Anthropic summarized thinking from the client. If those
blocks are still too long, that is a model/config change, not a UI trim.

## Settled state

An assistant text message during a run is not the final answer. The model may
emit more tools or replace that text. Until `isAssistantTurnInProgress` is
false:

- do not show copy or feedback on that text
- do not switch the composer to `Reply...` unless a previous turn already
  settled an answer

## New tools

`utils.clienttest.ts` walks every Langfuse MCP tool, sandbox tool, docs tool,
and the skill tool. A tool needs either an override / special-case in
`utils.ts`, or a reviewed auto-parsed label in
`ACCEPTED_AUTO_IN_APP_AGENT_PROGRESS_LABELS`. Adding a tool without one fails
the test and prints the auto-parsed headline.

## Open questions

- Should consecutive tools that share a noun (`observations`) collapse into
  one row, or stay one row per call?
