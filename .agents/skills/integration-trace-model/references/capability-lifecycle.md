# Turn lifecycle: exactly-once export and terminal state

Corroborated in: claude-code, codex, opencode, pi. Rules are tagged `[table-stakes]` (its absence
is a bug) or `[differentiator]` (worth having, no obligation).

## Rules

- [table-stakes] Export every turn exactly once: emit the turn's ready observations at EVERY lifecycle firing, keep the 'this turn is closed' decision separate from emission, and never let a turn's visibility depend on a later turn arriving.
- [table-stakes] Deliver the FINAL turn of a session — gate export on the hook payload's own turn identity, or additionally declare a session-end hook — and keep a single-turn-session case, because a turn-boundary hook alone re-runs only after a later turn.
- [table-stakes] Make re-export idempotent in trace count, observation count AND token totals: derive deterministic ids for every observation in a turn, seeded per turn rather than globally. A pinned trace id alone hides duplicated observations behind a correct-looking trace count.
- [table-stakes] Never emit a root observation with no turn id, input, output or steps, and assert that exported root count equals the number of turns the agent actually ran — content-free roots are exactly what isRootObservation evaluator rules select.
- [table-stakes] When a transcript is a fork or replay of another (fork-session, sub-agent fork), skip any turn an ancestor owns by turn/row identity, on both the recursive and the entry-point conversion path. Verify which resume mode actually copies the transcript before changing id derivation for every user, and validate any positional boundary marker against every real rollout before relying on it.
- [table-stakes] Close every open observation on interruption, cancellation, timeout or supersession, using the host's reported end timestamp, with level WARNING and the reason in metadata; set ERROR on the turn root when any child errored.
- [table-stakes] Map every failure signal the host carries — tool error flag, user interrupt, API error, failed step, per-turn conversion failure — to a Langfuse observation level with a status message. Keep the level on the observation that actually failed (measure how often the turn recovered before rolling it up), roll a child span up to the worst level of its own turns, and never let one bad turn suppress the rest of the transcript.
- [table-stakes] Collapse a retried model call into ONE generation span covering the error and backoff window, stamped with the successful attempt's usage, and emit the retry additionally as its own EVENT carrying the attempt number and the provider error.
- [table-stakes] Make the flush wait configurable with a generous default, apply the budget to the exporter's own request timeout, declare the maximum timeout the host allows for each hook event, give the exit flush a larger budget when media uploads are pending, and warn loudly when the flush is still pending at the cap. Parse the timeout value before any blanket exception handler.
- [table-stakes] Finalize a turn on ANY of the host's turn-completion events with idempotent finalization, so a fork or derivative harness that emits a different event name still produces complete traces; on host-initiated disposal, flush and leave the process-wide tracer provider registered.
