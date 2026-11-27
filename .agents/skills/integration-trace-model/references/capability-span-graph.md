# Span graph: what spans exist, how they nest, where they end

Consolidated from the research; corroborated in: claude-code, codex, opencode, pi.
Rules are tagged `[table-stakes]` (its absence is a bug) or
`[differentiator]` (worth having, no obligation).

Which observations an integration emits, how they parent each other, and
what each span's boundaries mean.

## Trace and observation model

- [table-stakes] Emit one trace per user turn: a root turn span, one generation per model request, one tool observation per tool call, and no other span kinds.
- [table-stakes] Set the Langfuse observation type explicitly on every observation (agent/span root, generation, tool) and represent point-in-time lifecycle facts — user message, retry, compaction — as EVENT observations instead of inventing span kinds.
- [table-stakes] Give every trace one constant name ('<Agent> Turn'); name generations by role ('LLM Call', 'LLM Subagent') and tool spans by tool name only. No turn numbers, model names, prompts, shell commands or search queries in any trace or observation name — those go in session id, tags, attributes or metadata.
- [table-stakes] Make the root observation of every trace carry BOTH input and output, and exclude internal generations (compaction, summarization, title generation) from the root output aggregation.
- [table-stakes] Parent tool observations to the turn root as siblings of the generation, not as children of it, and record that decision in the code next to the duration logic.
- [table-stakes] Key per-generation lifecycle state by the host's assistant-message id, never by session id, and never expose a span as a parent candidate unless it is guaranteed to end before flush.
- [table-stakes] Before renaming any trace name, observation name, usage key or marker a user can filter on, measure what the Langfuse server already aggregates from the current spelling and state in the change which saved views, dashboards or filters break.
- [differentiator] Expose trace scope as explicit config (turn | session) with one-trace-per-turn as the default, and document that session scope makes trace latency include think time between turns.
- [table-stakes] Emit only through the SDK's span API — never the legacy batch ingestion API — so a server-side data-model change is a no-op; where you must reach into SDK internals (e.g. to backdate observations), pin the SDK and guard those attributes with an explicit diagnostic.

## Duration and latency semantics

- [table-stakes] End a generation at its own model-response boundary clamped to its start (its assistant-message timestamp, or its first tool call where the host closes a step only after tools ran). Tool execution and human wait time belong on the tool observation; only the turn root carries the union.
- [table-stakes] Re-derive every duration formula whenever span parentage changes, and pin the expected generation, tool and turn end for a real transcript in a test — a parentage change with the old end formula silently reports human wait as model latency.
- [table-stakes] Backdate every observation to its source row's timestamp, converting to nanoseconds in exactly one helper with an explicit unit and rounding rule.
- [differentiator] Set completionStartTime (TTFT) on the first streamed delta of ANY kind — text, reasoning, or tool call — and cover a tool-call-only and a reasoning-only generation.
- [table-stakes] Treat TTFT and true request latency as a per-host capability check: if the host records no request-start timestamp, report TTFT as unavailable rather than deriving a wrong number from step boundaries, and name the remaining approximate boundaries in the capability list.
- [important] Before declining a timing case as unreachable, query real generations for its frequency instead of arguing it away.

## Sub-agent and nested-run attribution

- [table-stakes] Treat sub-agent discovery as an open set: enumerate every spawn mechanism the host has, walk the transcript/session tree recursively, and resolve each child from the CHILD's own declared parent identity as the authoritative source — treat parent-side spawn events as an optimization any host version may omit.
- [table-stakes] Never derive a child's usage from the spawning tool's result payload or from parsing the spawn call's content (it may be encrypted or hold only the final message); read the child's own transcript and merge assistant rows by message id.
- [table-stakes] Key attribution on a structure that allows MANY children per tool call, keep transcript discovery separate from attribution, and make a transcript that cannot be attributed emit as unattributed or log loudly — never skip it with a silent continue.
- [table-stakes] Nest child work under the spawning turn's span so one multi-agent workflow is one trace, and scope every lifecycle finalization (span settling, flush, state clearing) to the session id carried by the event so a child going idle cannot tear down the parent's state.
- [table-stakes] Name fan-out child spans from a persisted low-cardinality label; when the host persists none, ship a constant span name and put the discriminator in metadata rather than in the name.
- [table-stakes] A nested run inherits the parent's session id, user id and tags but NEVER writes the trace name, and publishes the IMMEDIATE parent's session id at each hop so a deeper ancestry chain stays reconstructible.
- [differentiator] When the host spawns child processes without trace propagation, publish the turn ROOT's trace/span/session ids into the environment for the turn's duration — never a tool span, since tools can run concurrently — validate inherited ids for hex shape and non-zero value, skip publishing a root the sampler dropped, and restore rather than delete the inherited values on withdrawal.
- [important] When a capability has no lifecycle boundary in the host (a skill that is never marked finished, per-tool child attribution the host cannot express), state the limit in the capability list instead of inventing a span duration or an attribution.
