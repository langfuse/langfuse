# Generation content: payload, tokens and cost

Consolidated from the research; corroborated in: claude-code, codex, opencode, pi.
Rules are tagged `[table-stakes]` (its absence is a bug) or
`[differentiator]` (worth having, no obligation).

What rides on a generation — the messages the model actually saw, the tool
and media content, and the usage and cost that must reconcile with the host.

## Request-payload fidelity

- [table-stakes] Make every generation's input the full message list that call received — system prompt, prior turns, prior steps of the same turn, tool results and images in order — reconstructed from the host's own source of truth (its pre-request context event, its message store, or the transcript from byte 0), never from an in-process accumulator or from the export offset.
- [table-stakes] Treat every host hook that exposes the outbound request as read-only: return nothing, mutate nothing, and assert in a test that the payload is unchanged.
- [table-stakes] Send generation input as an ARRAY of ChatML messages even for a single message, and emit tool calls in the nested {id, type:'function', function:{name, arguments}} shape on both generation output and traced history. Verify by replaying a real captured payload through Langfuse's own normalizer, not by inspecting the payload.
- [table-stakes] Capture the system prompt at the lifecycle point where the host has applied all overrides, as a leading role:'system' message on every generation input, stored untruncated, with its size published as metadata. When the host exposes no reliable source, state the gap in the capability list instead of synthesizing content.
- [table-stakes] Attach the tool definitions the model was actually OFFERED — the host's active tool set, verified against the real wire payload — to the newest user message of each generation's input, so the trace distinguishes 'not offered' from 'not chosen' and the Langfuse playground can replay the call. Never fall back to the full registry when the active set is empty, and never put them in metadata.
- [table-stakes] Capture reasoning as ChatML thinking parts on the generation that produced it, from structured thinking parts AND from a leading inline <think> block, preferring the structured form when both are present; never let reasoning be traced as the assistant's answer, and never export provider attestation/signature blobs.
- [table-stakes] Never let base64 reach a text payload: replace each image with a short marker (e.g. '[image image/png ~290KB]'), upload the bytes once as Langfuse media after validating the base64 yourself, attach them to every observation whose input contained them including replayed history, and cover every route the host delivers images through — including ones that arrive only as a file path in text.
- [table-stakes] Do not truncate traced content by default. If a cap is unavoidable, apply exactly one cap in exactly one place, record on the observation that a cut happened, and quantify what the cap discards on real transcripts before shipping it.
- [important] State the payload growth characteristic of history replay with a measured number and decide the cap question explicitly rather than inheriting it.
- [table-stakes] Normalize every tool-result shape the host can emit — native and MCP — through one validated decoder, record a visible placeholder or Langfuse media for non-text parts, and log a warning with empty output for an unrecognized shape instead of stringifying undefined fields.
- [important] Reflect context compaction in the history the next generation receives; if you cannot, document that divergence next to the compaction feature.

## Usage, cost and model attribution

- [table-stakes] For every provider token field, determine whether it is a subset of another before emitting. Make emitted buckets mutually exclusive so input + cache + output re-sums to the provider's reported total: subtract a subset out of its parent rather than adding it alongside, and skip the split when the value is zero or exceeds its parent.
- [table-stakes] Verify every usage-detail key you emit exists as a priced key on the target model definitions (GET /api/public/models) before shipping it, and prefer the provider's native usage schema over hand-rolled bucket arithmetic.
- [table-stakes] Emit per-TTL cache-write keys whenever the host reports the cache_creation split, and never emit the flat key together with the split keys — Langfuse sums every key that resolves to a price without deduplicating aliases. Report a sub-share that is not separately priced (e.g. the 1h share of a blended cache-write bucket) as metadata, not as a new bucket.
- [table-stakes] Mirror cost-detail keys to usage-detail keys byte for byte, and assert the mirror in BOTH directions — Langfuse joins usage and cost by key name, and a one-directional assertion lets the reverse bug ship green.
- [table-stakes] Omit costDetails entirely when the host has no price for the model (LiteLLM, llama.cpp, LM Studio, custom providers) so Langfuse server-side pricing applies; never emit a zero cost.
- [table-stakes] Set the generation's model from the provider's RESPONSE model and keep the requested id in metadata when the two differ.
- [table-stakes] Never drop a usage payload silently when a consistency check fails: record the rejection on the observation (metadata or level) so a zero-cost generation is distinguishable from a free one.
- [table-stakes] Enumerate every provider call the host books in its own cost breakdown — compaction, out-of-turn summarization, tool-internal calls, sub-agent transcripts — and assert your traced total equals it. Attach usage only to generation observations; where usage belongs to a tool, emit a child generation and flag any approximated model attribution in metadata.
- [table-stakes] Never embed provider rate cards, credit conversions, seat allowances or organization discounts in an integration. Emit the usage and tier signals the host records verbatim (e.g. request tier as metadata) and let Langfuse model definitions own pricing; never encode a tier by inventing model-name variants.
- [differentiator] Report request parameters from the WIRE payload where the host clamps or derives them (max_tokens), and from the context where the payload spelling is provider-specific (thinking level, reasoning effort); trace the cost-relevant ones — cache retention, service tier, thinking budget, tool_choice, declared sampling params, context window — and gate capability-dependent ones on the model's declared capability.
