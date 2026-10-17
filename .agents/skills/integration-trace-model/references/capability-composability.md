# Composability with externally-owned traces

Corroborated in: claude-code, codex, opencode, pi. Rules are tagged `[table-stakes]` (its absence
is a bug) or `[differentiator]` (worth having, no obligation).

## Rules

- [differentiator] Offer opt-in seeded trace ids (e.g. sha256('<seed>:<turn>')[:32]) with a fail-open fallback to auto-generated ids, so a CI harness, benchmark runner or dataset-experiment service can create run items before the trace exists instead of polling the API afterwards. Require a unique seed per session and verify the derivation against an independent hash implementation.
- [differentiator] Accept a parent trace context from the launcher — your own namespaced traceparent variable plus explicit parent trace-id/span-id alternatives — honor the parent's sampling decision via parent-based sampling, and reject an all-zero traceparent (INVALID_SPAN_CONTEXT serializes to exactly that).
- [table-stakes] In attached mode propagate no trace-level attribute the caller owns — trace name, session, user, tags, metadata — and say so in the option documentation.
- [table-stakes] Never read a bare TRACEPARENT from the environment: a host's own OTel telemetry may inject it into hook subprocesses and would silently reparent every trace.
- [table-stakes] Keep per-run values (parent context, one-off run tags) out of any config layer that persists to a file, and read them only from the process environment, so unrelated runs cannot inherit them.
- [differentiator] Send a W3C traceparent naming the current turn root on outbound provider requests so a tracing-aware gateway joins the agent's trace; guard on no-turn-in-flight and on an unsampled root, leave a traceparent the request already carries alone, and document that the two sources remain independent measurements that double-count rather than silently merging them.
- [important] Do not trade a risk of never-completing spans for nesting depth: if the only hook that would give exact parenting also fires outside turns, accept the shallower parenting and record why.
