# Delivery: turns lost, turns duplicated

Root causes of bugs that shipped in the coding-agent integrations;
corroborated in: claude-code, codex, opencode, pi. Each section is one
failure class — read the one the symptom table names.

Exactly-once export across re-fired lifecycle events, resume, fork and
replayed history — and the terminal event that decides when a turn is done.

## End-of-unit lifecycle and terminal events

- State the finality rule explicitly in code and cover all three cases: terminal event present on disk, superseded by a later unit in the transcript, or named as the just-ended unit by the hook payload — so a crashed unit is exported once rather than never.
- Never export a unit before its terminal lifecycle event is on disk unless the payload itself names that unit; pair any defer-until-complete rule with a signal identifying the session's final unit, and make a single-turn session a required test case.
- Assume the end-of-turn event fires more than once per logical turn: persist the open unit's raw rows, re-attach them to the next batch, and gate each observation on a per-span completion cursor so re-emission is idempotent.
- Emit every ready observation at every lifecycle firing and defer only the 'this unit is closed' decision; never make a unit's visibility depend on a later unit arriving.
- Key every end-of-run handler and every piece of tracing state on the session id carried on the event; a global handler must never end spans or clear state it cannot prove belong to the session that ended.
- Handle the host's failure terminator in a branch of its own that records ERROR level and the host's error payload on the trace, and treat error/timeout events as equally valid terminators for any span opened from a 'before' hook, ending the span at the host-reported end timestamp.
- Record which observation ids are already finalized and drop later terminators for them, so a late second terminator cannot resurrect or duplicate a span.
- Never hand out a span as the next observation's parent before it is guaranteed to be ended on every exit path — an unended span is never exported and leaves an unresolvable parent id.
- Finalize and flush from a set of end-of-turn event names rather than one hard-coded name, and degrade gracefully when the host or a fork emits a different one.
- Assume any provider call can fire outside a turn (compaction, branch summaries, cache warming, tool-internal calls): initialise the tracer lazily on every emit path and route out-of-turn calls to a standalone trace carrying the session id instead of dropping them.
- Prune every per-unit map in the session's end handler, and give message-id-keyed state a session back-reference so it can be cleaned up at all.
- Declare an explicit timeout on every end-of-session hook entry, sized to the flush budget, and re-verify the host's own cap against the current host release rather than its docs.
- Do all cheap checks (payload parse, config presence, persisted offset versus file size) before importing the SDK, and return immediately when a firing has nothing to emit.

## Exactly-once delivery: dedup ledger, ids, flush boundaries

- Write the dedup receipt only after the awaited delivery boundary (forceFlush), never after span creation; an unmarked delivered turn is recoverable, a marked undelivered one is lost.
- Derive trace and span ids deterministically from stable content keys, seeded per unit of idempotency (session id + unit id) and never from a run-global counter, so a re-export is byte-identical; test the partial-replay case, not only the identical replay.
- Never use trace count alone as a duplicate check — assert observation count and token sums, because duplicated observations inside a correct-looking trace are the common shape.
- Refuse to export a unit that cannot be recorded in the dedup ledger (it lacks the id the ledger keys on), and never let a non-content event open a unit.
- Treat a spuriously parsed unit as an id-correctness bug, not only a volume bug, whenever any id derives from a positional ordinal.
- Detect copied or replayed history by a field the copy cannot rewrite (the originating session id on the rows) and key the skip on ownership rather than on delivery receipts; keep unit numbering continuous and re-home anything attached to a skipped unit onto the next unit the thread owns.
- Read session identity once from the transcript's first header and treat it as immutable; when an identity fix and a dedup fix interact, land them in the same change.
- Bound both the flush wait and the exporter's own HTTP request timeout, make the budget configurable with a default sized to a large session, log when the flush thread is still alive at expiry, and measure total exit time against an ingest that accepts and never answers.
- Force-flush on plugin disposal and never shut down a process-wide tracer provider, which cannot be re-registered in the same process.
- A per-item conversion failure must degrade that item (export it as an ERROR observation) and must never abort the surrounding batch or discard receipts for items already flushed.
- Never hold a shared-state lock across network I/O: scope the global lock to the state read and write, give each session its own lock, and log a skipped export at info level.
- Re-read shared state inside the lock immediately before writing it back, and bound every persisted field by age independently of the lifecycle event that would normally clear it.
- Make state, lock and log paths overridable by one option that moves all three together, defaulting to byte-identical current behaviour so no upgrade resets an ingestion offset.
- Do not repurpose a custom-trace-id feature as a dedup mechanism, and state in its docs that it does not deduplicate observations.
