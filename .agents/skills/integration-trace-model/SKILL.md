---
name: integration-trace-model
description: |
  What a Langfuse coding-agent observability plugin emits, and why emitted
  telemetry is wrong or missing. Covers the tracing code in a plugin repo's
  `src/**` (Claude Code, Codex, OpenCode, pi) — not this monorepo. Use
  when implementing or reviewing span and generation emission, and when traces
  are duplicated, absent, mis-nested, priced wrongly, carry a partial prompt,
  report a duration that includes tool or human time, lose subagents, or stop
  arriving after a host-agent release.
---

# Integration Trace Model

The data contract for a Langfuse coding-agent observability integration: what to
emit, and the root-cause classes behind emission bugs.

These integrations live in their own repositories, not in this one:

| Host | Repository |
|---|---|
| Claude Code | `langfuse/Claude-Observability-Plugin` (Python hook) |
| OpenAI Codex | `langfuse/codex-observability-plugin` (TS, plugin marketplace) |
| OpenCode | `langfuse/opencode-observability-plugin` (TS, npm) |
| pi | `langfuse/pi-observability-plugin` (TS, npm) |

Cursor has no published Langfuse plugin: `langfuse/cursor-observability-plugin`
returns 404, and `cursor.mdx` on langfuse.com documents the community plugin
`naoufalelh/cursor-langfuse` instead. Cursor figures below only where a local
unpublished working copy was measured, and those rows say so.

Read the current source and the host's own transcript format before applying any
rule here. Do not rely on remembered payload shapes — a host release moving a
field is the single most common cause of breakage in this family.

## Two entry paths

**Building or reviewing emission** — work the capability contract below, then
read the `capability-*` reference for each area you touch.

**Diagnosing a report** — start from the symptom table and read the `fail-*`
file *and section* it names, then follow
[`references/diagnosis.md`](references/diagnosis.md) before writing a fix. Reproduce the reporter's exact host version, launch path
and flags first.

## Symptom to root cause

| Symptom | Read |
|---|---|
| Nothing arrives; hook exits 0 and reports success | [fail-nothing-arrives](references/fail-nothing-arrives.md) |
| Self-hosted target receives nothing while Cloud works | [fail-nothing-arrives](references/fail-nothing-arrives.md) — *Bootstrap, configuration and transport* |
| Traces arrive, but the session's last turn never does | [fail-delivery](references/fail-delivery.md) — *End-of-unit lifecycle* |
| Duplicate traces, or cost counted twice | [fail-delivery](references/fail-delivery.md) — *Exactly-once delivery* |
| Cost or token counts wrong, zero, or double | [fail-shape-and-content](references/fail-shape-and-content.md) — *Usage, cost and token accounting* |
| Spans with an unresolvable parent; subagents invisible | [fail-shape-and-content](references/fail-shape-and-content.md) — *Trace shape*, and [capability-span-graph](references/capability-span-graph.md) |
| Generation duration includes tool execution or a human wait | [fail-shape-and-content](references/fail-shape-and-content.md) — *Trace shape*, and [capability-span-graph](references/capability-span-graph.md) |
| Generation input is only the latest message | [fail-shape-and-content](references/fail-shape-and-content.md) — *Payload fidelity* |
| Worked before; broke after a host-agent release | [fail-shape-and-content](references/fail-shape-and-content.md) — *Host contract drift* |
| `unknown_service`; cannot group or filter traces | [capability-identity](references/capability-identity.md) |

Each `fail-*` file holds several failure classes as `##` sections; the italics
above name the one to read.

## Capability contract

Measure a new or reworked integration against this. This skill covers integrations that ship a **plugin or hook in their own repo**.

The `capability-*` references tag each rule `[table-stakes]` (its absence is a
bug) or `[differentiator]` (worth having, no obligation).

Two other shapes exist and are out of scope: hosts that export OpenTelemetry
GenAI semconv natively with no Langfuse code at all (GitHub Copilot), and
integrations whose implementation is inlined into a docs page rather than
released (Augment Code, Kiro).

Table stakes:

- One trace per user prompt, all turns of a session grouped by session id.
- A generation per model call, each with its own input and output. The root
  observation carries both trace input and trace output.
- Tool calls with input, output and error status.
- Token usage, with buckets that re-sum exactly to the host-reported total.
- Cost, or no cost at all so server-side pricing applies — never a zero.
- Error and warning levels mapped from the host's own failure signals.
- Constant, low-cardinality trace and observation names.
- Exactly-once export across re-fired lifecycle events, resume and fork.

Expected:

- Cache-token split, priced against keys that exist for the models users run.
- Reasoning or thinking content.
- Subagents nested under the turn that spawned them, with their own usage read
  from their own transcript.
- Backdated, host-derived span boundaries.
- The full prompt the model received, as a ChatML array — not a delta.
- System and developer prompts, where the host persists them.

Operational surface:

- An enable/disable switch checked before any work.
- A `doctor` command. "No traces appear" dominates every tracker in this family,
  and a status line cannot help when the hook never fired. It should print the
  resolved config with the source of each field (never the values), credential
  presence, resolved ingest host and project, host-trust state, the last export
  result and timestamp, the state-file path and age, and the detected host
  version.
- Runtime price-coverage reporting: on the first trace of a session, compare the
  model that answered against the project's model catalog and log one line
  naming an unpriced model and how to add the price row.
- Configurable tags, honouring `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES`.
- Self-hosted endpoint support, with the data-region default in exactly one place.
- Composability: accept a caller-supplied parent trace rather than always rooting.
- A documented per-session or per-turn sampling option. One trace per turn on a
  long session is expensive and the only lever in the family today is off/on.
  This is distinct from the rule against ambient `OTEL_*` unsampling you.
- A recorded decision on attribute portability: Langfuse ingests OpenTelemetry
  GenAI semconv natively (GitHub Copilot's integration relies on exactly that,
  with `x-langfuse-ingestion-version`), while all five plugins emit only
  `langfuse.*`. Document the `langfuse.* -> gen_ai.*` mapping per emitted
  attribute and decide per repo whether to dual-emit.

Full detail per area:
[span graph](references/capability-span-graph.md) — which spans exist, how they
nest, where they end, and sub-agent attribution;
[generation content](references/capability-generation-content.md) — the payload
the model saw, plus tokens and cost;
[lifecycle](references/capability-lifecycle.md) — exactly-once delivery and turn
finalization;
[identity](references/capability-identity.md) — session, user, tags and
environment;
[composability](references/capability-composability.md) — accepting a
caller-supplied parent trace.

## Rules that outrank preference

- Never write a dedup receipt before the awaited flush boundary. An unmarked
  delivered turn is recoverable; a marked undelivered one is lost.
- Never report "trace sent" or "processed N turns" without evidence of a
  successful export. Distinguish disabled, unconfigured, and rejected by ingest.
- Never derive an observation's end from a child's or sibling's completion, and
  clamp every computed end to its own start.
- Confirm a usage-detail key has a price row for the models users actually run
  before emitting it. An unpriced bucket contributes zero cost, silently.
- Keep cost-detail keys byte-identical to usage-detail keys, asserted in both
  directions.
- Read a child agent's usage from the child's own transcript, never from the
  parent's tool result.
- Treat a trace or observation name change as breaking for saved views. Renaming
  needs a dual-emit window: both names for one minor release, both documented,
  the old one removed in a named release — not a changelog line.
- Before inventing a capability, option name or observation name, diff it
  against the sibling integrations and match the family. Measured across the
  four plugins, the family already carries four different spellings of the
  cache-write usage key and four different turn-observation names — and only a
  key with a matching price row contributes cost, so a divergent spelling prices
  at zero silently. Fix the family rather than adding a fifth spelling; where it
  disagrees, decide once and record the decision.
- When one integration fixes a rendering or accounting contract, open the
  matching issue in the sibling repos in the same pass.

## Related

- Documenting the traced surface on langfuse.com: `integration-docs`, which
  lives in `langfuse/langfuse-docs` under `.agents/skills/` rather than here,
  because that is where an agent editing the page has skills loaded. It owns the
  developer-tools page and the plugin README skeleton.
