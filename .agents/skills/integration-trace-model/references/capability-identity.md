# Identity, grouping and label surface

Corroborated in: claude-code, codex, opencode, pi. Rules are tagged `[table-stakes]` (its absence
is a bug) or `[differentiator]` (worth having, no obligation).

## Rules

- [table-stakes] Stamp the trace-level fields (session id, user id, tags, environment) on EVERY span the integration starts, not only the root, and verify via /api/public/v2/observations that all observations of a turn carry the session id — Langfuse turns each span into one row and reads these fields from that row.
- [table-stakes] Group traces under the host's own session id; keep the incremental-read/state key on the RAW session id and pass the reported Langfuse session id separately, so a session can be relabeled or grouped without re-emitting history or migrating state.
- [table-stakes] Default user_id to the agent account's own signed-in identity when the host exposes it, let explicit config override it, and never fail tracing on unreadable auth data.
- [table-stakes] Tag every trace with a stable agent identifier by default AND accept caller-supplied tags from both a config field and an env var, as a JSON array or a comma-separated list, deduped against the built-in tags and bounded (e.g. 20 entries of 200 chars). Do not offer metadata as a substitute: the public traces API filters first-class on tags, userId, sessionId, name, environment, release and version, and silently ignores a metadata filter.
- [table-stakes] Expose the Langfuse environment label as a first-class option so users never overload tags, the trace name or the deployment-environment field to express lane/stage separation.
- [table-stakes] Build the tracer provider with an explicit resource: an integration-specific service.name default, the OTel envDetector merged in so OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES are honored, and a config override. Do not duplicate an attribute the Langfuse span processor already stamps, and document which resource keys map to first-class Langfuse fields (service.version → version, deployment.environment → environment).
- [table-stakes] Put the semantic identities users break metrics down by — skill name, subagent type, agent name — in a field Langfuse can group metrics by (the observation name or a stable metadata key), never only nested inside observation input, and fix ONE representation per concept across all sibling integrations.
- [table-stakes] Record the workspace context a developer filters on — cwd, git branch, a short project label, session id, turn number, integration name and version, model/provider — on the turn root, reading host facts in-process behind a bounded timeout rather than through OTEL_RESOURCE_ATTRIBUTES a host CLI may strip from hook subprocesses.
- [table-stakes] Collect capability/skill attribution from every invocation path the host has — tool invoke, slash command, a direct read of the capability's own file, connector-hosted resources — deduped per turn, and validate detection against a real transcript corpus for false positives.
- [differentiator] Derive cheap trace-level scores from the turn you already assembled: tool-call count, tool success rate, turn count, whether the session had errors.
