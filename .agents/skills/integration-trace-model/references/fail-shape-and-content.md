# Wrong shape, wrong content

Root causes of bugs that shipped in the coding-agent integrations;
corroborated in: claude-code, codex, opencode, pi. Each section is one
failure class — read the one the symptom table names.

Telemetry arrives but is wrong: spans mis-parented or mis-timed, the prompt
incomplete, usage and cost misreported, or a host release moved a field.

## Trace shape: hierarchy, span timing, root marking

- Derive each observation's end from its own source artifact — never from a child's or sibling's completion, and never from the bookkeeping event that closes a step — and clamp every computed end to its own start, because transcript timestamps from parallel writers are not monotonic.
- Pin every span boundary and the parent-child layout with tests, record the intended hierarchy as an explicit decision with its trade-off, and re-derive every timestamp and rollup rule whenever the shape changes; when a hierarchy change and a timing change share one root cause, ship them together and call out the resulting metric break.
- Resolve every child observation's parent through the host's message or call id, not the session id, so a late event from an earlier generation cannot overwrite the current parent.
- Subscribe to the host's session-created/updated events and record parent session ids from the first event, so a child session's spans attach to the parent trace instead of starting a new one.
- Assert in integration tests that every exported span's parentSpanId resolves to another exported span.
- When forcing a trace id via a remote-parent carrier, set the backend's explicit trace-root marker with the exact attribute spelling, assert the span-processor order that makes the marking win, and check the trace's own input/output end to end rather than only the span ids.
- Stamp session id, user id, tags and environment on every span the integration starts (hook the processor's onStart), not only on the root; in an in-process extension never install a global OTel context manager — carry cross-span state in a closure.
- Keep trace and observation names constant and low-cardinality per kind, putting turn numbers and session labels in session id, tags and metadata; treat any name change as breaking for saved views and filters and export the integration version in the same release.
- The root observation must carry both trace input and trace output, and every generation must carry its own input and output; a missing pair is a release blocker, not a modelling preference.
- Propagate parent trace and span ids to spawned host processes through the environment, validate the hex shape, reject the all-zero span context, never publish a root the sampler dropped, and restore the inherited values when the turn ends.
- Send a W3C traceparent on provider requests naming the current turn root, never overwrite a header the request already carries, skip it when no turn is in flight or the root was unsampled, and establish the real firing order of header vs payload hooks at runtime before parenting anything to either.
- Map every failure signal the host carries onto an observation level with a status message, and decide rollup to the parent from measured transcript data rather than assumption.
- Never derive a human-readable id label from a UUIDv7 timestamp prefix; use the random tail.

## Payload fidelity: prompt, renderable shapes, content kinds

- Export each generation's input as the full prompt the model received at that point, as a ChatML message array, never as the delta since the previous call; verify the recorded input's token count against the provider-reported input+cache tokens.
- Reconstruct conversation history from the host's own message store rather than an in-plugin accumulator, so restart, resume, fork and revert are correct by construction; when a cached host snapshot is used as input, record which records it provably holds and require a positive membership check before trusting it.
- Include failed and errored tool results in reconstructed history, using the error text as the tool message content, so every tool_call has a matching tool result message.
- Emit tool calls in the nested {id, type: 'function', function: {name, arguments}} shape everywhere, verify the payload against Langfuse's own normalizer and in the live UI, and pin it with a structural test that walks every tool_call the integration emits rather than testing the builder.
- Assert every content kind on both sides of the observation and on every observation that replays it (generations and history prefixes), not just where it was first added; a token bucket with no corresponding content is a bug.
- Exclude the host's internal generation modes (compaction, summarization, title generation) before writing any turn-level output, so internal text cannot overwrite the user-visible answer.
- Replace every binary content block with a short bounded marker before any truncation runs, so a large payload can never consume the budget of the text beside it.
- Have exactly one documented, configurable payload cap or none at all: apply it to every emitted value regardless of type, including status and error messages, never stack a second hidden slice on an already-capped field, and if caps are removed state the new unbounded-size risk explicitly.
- Stream line-oriented transcripts and never materialize one as a single string (read only the first line for the header); document the roughly quadratic growth of replayed conversation history and leave the dedup receipt unwritten when a payload-size failure aborts an export so the next run retries.
- Validate payloads before handing them to the SDK rather than relying on it to raise, and make every capture opt-out also disable the SDK-side behaviour that would reintroduce the data.
- Consume a per-call cache exactly once — clear it after building the observation input — so a missing host event falls back visibly instead of replaying the previous call's payload under a 'fresh' label.
- State explicitly in the docs which parts of the model request the host does not persist on each supported version, and never synthesise a system prompt or tool list the host did not provide.

## Usage, cost and token accounting

- Record in code, per bucket, whether the host reports it inclusive or exclusive of its parent, subtract every subset bucket out of its parent, and assert both input+output==total and that the emitted buckets re-sum exactly to the host-reported total.
- Never emit a zero-valued subset bucket, and skip the split when a provider reports a subset larger than its parent.
- Before emitting a usage-detail key, confirm a price row of that exact name exists for the models users actually run (dump /api/public/models); an unpriced bucket contributes zero cost, not the cached rate.
- Cost-detail keys must be byte-identical to usage-detail keys, asserted by a bidirectional set-equality test — a subset assertion is not a parity check.
- Land a usage-bucket change and its cost counterpart in the same commit, deriving the split by subtraction.
- Emit exactly one key per token bucket so the pricing sum cannot double-count aliases, and prefer the host's detailed breakdown (per-TTL cache writes) over its flat summary.
- Prefer handing Langfuse the provider's native usage object over hand-mapping into Langfuse usage-detail key names.
- Omit costDetails entirely when the host has no pricing for the model so server-side pricing applies; never export a zero cost.
- Price the model that answered (responseModel) and keep the requested id in metadata when they differ; never invent synthetic model-name variants to carry a pricing signal, and emit request attributes the host records (speed/service tier) verbatim as metadata.
- Reconcile the host's own usage/cost breakdown against the sum of exported observations per session as a test: every bucket the host books maps to an exported observation or is documented as a known gap.
- Never derive a child agent's usage from the parent's tool result; read the child's own transcript, because the tool result records only the child's final message.
- Carry a cost-relevant subdivision of a bucket you already emit in metadata rather than adding a second overlapping bucket.
- Assign the usage literal to a locally typed snake_case value and cast once at the return so key typos stay compiler-visible.
- When the host's own accounting is wrong, file it upstream and record the measured gap in the docs instead of compensating silently in the exporter.

## Host contract drift and child-transcript discovery

- Read user input and lifecycle facts from the host's structured item/event where one exists, and treat text-shape heuristics as a last-resort fallback only; validate any heuristic against the full local corpus across host versions and report both true-positive and false-positive counts.
- Never key transcript or child discovery on a single optional metadata field: return every transcript found with an optional attribution, emit unattributable ones as unattributed rather than dropping them, and log every skip.
- Walk the host's transcript tree recursively and pin the on-disk layout with a fixture harvested from a real session of a named host version.
- Separate locating child transcripts from attributing them: locate from the session directory alone, attribute after unit assembly, and let an unattributed transcript survive the locate pass.
- Treat child-agent discovery as multi-source with deduplication: accept every known spawn event shape, fall back to the spawn tool output, then to the sessions tree via each child's own parent id, so one spawn reported twice nests once.
- Drive the async-hold decision off explicit lists of launch signals and completion row kinds, and add every new spawn class to both lists rather than only to discovery.
- Treat the host transcript as many rows per logical message: merge content blocks across all rows sharing a message id, dedupe tool_use by id, and never key an assembly dict with last-write-wins.
- Decode every host payload through an explicit schema union covering each variant the host can produce, validate at runtime even when the host SDK declares a type, and treat an unrecognised non-null shape as a logged warning with empty output rather than stringifying undefined fields.
- Centralise every mirrored host type in one file, annotate each with a version-pinned upstream permalink and line range, keep a Validated Versions list, and cover every host field spelling the integration reads with one test per supported host major version.
- Make every trace handler idempotent behind an explicit traced-ids set keyed on the host's own identifier, cover duplicate delivery and each single-path variant (hook-only, message-part-only), and document which host retry attempts are structurally unobservable instead of silently under-reporting usage.
- Detect the host major version at the entrypoint and dispatch to a version-specific implementation; either declare a real supported host range or degrade explicitly — optional-chain every host accessor and never throw from a helper that reads host data.
- Read any value other extensions can rewrite at the hook after the host has applied the final override, and pin the choice with a test that registers a fixture extension which rewrites it.
- Enumerate every path by which the host can record a feature's use and collect all of them into one deduped set; a fixed metadata allowlist must be extended deliberately, never relied on to pass a new field through.
