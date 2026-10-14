# Model Price Audit Memory

This file is an optional snapshot of the latest automated audit whose
per-model results add useful context for a future run. It is orientation only;
reconfirm every price and tier against official provider sources before making
a change or reporting a row as confirmed.

The audit agent may replace the snapshot below with its complete current table.
Keep only one snapshot, never append an unbounded run history, never persist a
partial set of checked models, and do not update this file only to refresh the
audit date.

## Latest useful snapshot

**Audit date:** 2026-10-14

All prices listed as `$X / MTok` (per million tokens). Per-token JSON values: divide by 1,000,000.

The 2026-10-14 run re-fetched the full Anthropic pricing page (model table, cache-hits
footnote, Fast mode, Batch, and tool-use tables) and the Anthropic model-deprecations page,
the OpenAI aggregate Standard pricing table and the OpenAI deprecations page, both Gemini
3.x pricing fetches and the Gemini models catalog, the AWS Bedrock pricing page, and the
TypeSafe Jev models page. Every existing price matched verbatim; no price drift was found.
This run found one new model and two lifecycle findings, none requiring a selectable-array
removal yet:
1. **Gemini 4 Argon** (`gemini-4-argon`) — a new Google flagship reasoning model, confirmed
   via `ai.google.dev/gemini-api/docs/models`, its dedicated model page, and the pricing
   page. "New Stable" status, 1,048,576-token unified input/output context window, max
   output 1,048,576 tokens with long decode (65,536 default synchronous). Supports
   text/image/video/audio/PDF input, text-only output, thinking (low/medium/high), function
   calling, Search grounding, grounding with Google Maps, and implicit-only prompt caching
   (no explicit cache-write support). Standard tier priced at introductory rates through
   November 30, 2026: $2.00/MTok input, $10.00/MTok output (including thinking tokens),
   $0.10/MTok cache read (10% ratio, matching the universal Gemini cache-read ratio) —
   stepping up to $4.00/$20.00/$0.20 on December 1, 2026 (a different, earlier step-up date
   than the 3.6/3.7/3.8 Flash family's January 1, 2027 date — do not conflate the two). No
   context-length pricing threshold (flat price across the full 1M window, unlike
   `gemini-3.1-pro-preview`/`gemini-2.5-pro`'s <=200K/>200K split). Grounding is $14 per
   1,000 requests (5,000 free/month, shared across Gemini 3-and-newer models), same rate as
   the rest of the Gemini 3.x family. A Priority tier (`service_tier: "priority"`) is
   separately quoted on the pricing page at exactly 1.8x the Standard rate at every
   introductory/stepped-up price point ($3.60/$18.00/$0.18 through Nov 30, 2026, doubling
   with the same step-up on Dec 1, 2026) — same multiplier as every other Gemini model with
   a Priority tier. Not available on the Free tier. Added to the pricing file (mirroring the
   `gemini-3.8-flash`/`gemini-3.6-flash` key set, Standard + Priority tiers) and to
   `googleAIStudioModels` only (not `vertexAIModels`): the Vertex AI lifecycle page
   (`cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions`) 301-redirects to
   `docs.cloud.google.com`, outside the allowed WebFetch domain list, so Vertex-side
   availability for this specific new model is unconfirmed — report as a standing gap if a
   future audit needs to add it to `vertexAIModels` once that domain is reachable or
   independently confirmed. matchPattern: `(?i)^(google(ai)?/)?(gemini-4-argon)$`, verified
   via the bundled match-pattern tester to accept `gemini-4-argon`/`googleai/gemini-4-argon`/
   `google/gemini-4-argon` and reject `gemini-4-argon-preview`/`gemini-3.8-flash`/a dated
   snapshot guess. No dated snapshot was found at launch, consistent with other recent
   flagship launches.
2. **New OpenAI deprecation announced the same day (2026-10-14): a "GPT-4 series" batch,
   shutdown January 14, 2027** — confirmed via two independent verbatim-quote fetches of
   `developers.openai.com/api/docs/deprecations`. Exact rows: GPT-4o
   (`gpt-4o-2024-08-06`, `gpt-4o-2024-11-20`) to `gpt-6-luna`; GPT-4o mini
   (`gpt-4o-mini-2024-07-18`) to `gpt-6-luna`; GPT-4.1 (`gpt-4.1-2025-04-14`) to
   `gpt-6-luna`; GPT-4.1 mini (`gpt-4.1-mini-2025-04-14`) to `gpt-6-luna`. Note
   `gpt-4o-2024-11-20` is a dated snapshot not currently present in `openAIModels` (only
   `gpt-4o`, `gpt-4o-2024-08-06`, and `gpt-4o-2024-05-13` are), so it has no
   selectable-array action regardless. January 14, 2027 is three months after this audit's
   date — not yet actionable under the removal criteria. Re-check
   `developers.openai.com/api/docs/deprecations` on or after that date and remove
   `gpt-4o`/`gpt-4o-2024-08-06`/`gpt-4.1`/`gpt-4.1-2025-04-14`/`gpt-4.1-mini`/
   `gpt-4.1-mini-2025-04-14` from `openAIModels` once the page confirms the shutdown has
   passed (keep pricing entries). This is a separate, later batch from the already-tracked
   October 23, 2026 "Legacy GPT model snapshots" batch below — do not conflate the two
   shutdown dates or model lists.
3. **Standing re-checks, both still not yet passed**: the October 23, 2026 "Legacy GPT model
   snapshots" batch (`gpt-3.5-turbo-0125`/`gpt-4-0613`/`gpt-4-1106-preview`/`gpt-4-turbo`/
   `gpt-4.1-nano`/`gpt-4o-2024-05-13`/`o1`/`o1-pro`/`o3-mini`/`o4-mini`, see the 2026-10-09
   entry below) is still upcoming (9 days away) — re-confirmed via the deprecations page's
   own "Upcoming deprecations" section heading. Claude Haiku 4.5's tentative retirement
   ("Not sooner than October 15, 2026") is also still one day in the future and still has no
   firm announced date — re-confirmed via the Anthropic model-deprecations page's "Model
   status" table (`claude-haiku-4-5-20251001` still `Active`, `Deprecated: N/A`). Neither
   triggers a removal yet.
The 2026-10-13 run before it re-fetched the full Anthropic pricing page (model table,
cache-hits footnote, Fast mode, Batch, and tool-use tables) and the Anthropic model-deprecations
page, targeted rows of the OpenAI aggregate Standard pricing table (the full gpt-6/gpt-5.6
family plus every gpt-5.x/gpt-4.x/o-series/legacy model and `gpt-5-chat-latest`'s own
dedicated page), the OpenAI deprecations page and model catalog, the Gemini 3.x and 2.5
pricing pages plus the Gemini models catalog and deprecations page, the AWS Bedrock
pricing page, and the TypeSafe Jev models page. This run found and corrected one stale
price: **Claude Sonnet 5.5's cache-read price dropped from $0.20/MTok (the standard 0.1x
multiplier) to $0.10/MTok (0.05x)**. The Anthropic pricing page's cache-hits footnote now
reads "Cache hits and refreshes on Claude Opus 5.5 and Claude Sonnet 5.5 are priced at
0.05x the base input price" (previously only Opus 5.5 had a non-standard multiplier; Sonnet
5.5 was previously 0.1x like every other non-Fable-5.1/Mythos-5.1/Opus-5.5 model). The AWS
Bedrock pricing page independently corroborates this with a footnote: "Starting October 7,
2026, cache read pricing for Claude Sonnet 5.5 is reduced by 50% from the prior rate" —
Bedrock could not be queried for the exact numeric row (see the standing Bedrock
table-extraction limitation below), but the 50% reduction off $0.20 matches the new $0.10
Anthropic-page rate exactly, so the correction was applied with high confidence from the
direct Anthropic source alone. Updated `claude-sonnet-5-5`'s `cache_read_input_tokens` /
`input_cached_tokens` / `input_cache_read` from `2e-7` to `0.1e-6` in the pricing file; every
other field (input, output, cache-write 5m/1h) is unchanged. Every other price already in
the file — including every `gpt-6-astra`/`gpt-6-sol`/`gpt-6.1-sol`/`gpt-6-luna`,
`gpt-5.6-sol`/`terra`/`luna`, the full `gpt-5.x`/`gpt-4.x`/o-series/legacy OpenAI catalog,
`gpt-5-chat-latest`, `claude-opus-5-5`, `claude-haiku-5-5`, and `gemini-3.6/3.8-flash`/
`3.5-flash-lite` tier — matched verbatim; no other updates were needed. The OpenAI
deprecations page confirms no new deprecation was announced between October 9 and October
13, 2026, and the "Legacy GPT model snapshots" batch (`gpt-3.5-turbo-0125`, `gpt-4-0613`,
`gpt-4-1106-preview`, `gpt-4-turbo`/`gpt-4-turbo-2024-04-09`, `gpt-4.1-nano`,
`gpt-4o-2024-05-13`, `o1`/`o1-2024-12-17`, `o1-pro`/`o1-pro-2025-03-19`,
`o3-mini`/`o3-mini-2025-01-31`, `o4-mini`/`o4-mini-2025-04-16`) still shuts down October 23,
2026 — still in the future as of this run, so no `openAIModels` removal yet; re-check on or
after that date per the 2026-10-09/2026-10-12 entries below. The Anthropic deprecations page
confirms `claude-sonnet-4-5-20250929` is still only `Deprecated` (retirement November 30,
2026, not yet passed) and `claude-haiku-4-5-20251001`'s tentative retirement
("Not sooner than October 15, 2026") has not been formally announced with a firm date —
both left unchanged in `anthropicModels`. The Gemini deprecations page confirms
`gemini-2.5-pro`/`gemini-2.5-flash`/`gemini-2.5-flash-lite` still have "No shutdown date
announced" (access-restriction only, not a deprecation), and `gemini-2.0-flash-thinking-exp-01-21`/
`gemini-1.5-pro`/`gemini-1.5-flash`/`gemini-1.5-flash-8b` are still absent from both the
Gemini models catalog and the deprecations page (neither confirmed available nor shut
down) — standing ambiguous gap, left unchanged in `googleAIStudioModels`. One new fetch
limitation found this run: targeted single-model WebFetch queries against
`ai.google.dev/gemini-api/docs/pricing` for `gemini-3.7-flash` and `gemini-3.5-flash`
(the non-Lite, non-3.6/3.8 siblings) each returned "model not found on this page" even
though the models catalog page lists both as active (not shut down) — see the new
"Gemini 3.x pricing-page single-model fetch gap" entry in
`provider-sources-and-price-keys.md`. Treated as a fetch/extraction artifact, not evidence
of removal; both prices left unchanged and not marked independently re-confirmed this run.
The 2026-09-30 run before it re-fetched the full Anthropic pricing page (model table,
cache-hits footnote, Fast mode and Batch tables), the Anthropic models-overview
comparison table, the OpenAI aggregate Standard/Long-Context/Fast-mode/Flex
pricing tables, the full OpenAI model catalog, both Gemini pricing pages (3.x
and 2.5 families, with explicit Free/Paid column separation), the Gemini
models catalog, the AWS Bedrock pricing page, and the TypeSafe Jev models
page. This run found one new model: **GPT-6.1 Sol** (`gpt-6.1-sol`), a new
sibling alongside the still-active `gpt-6-sol` — same $2/$10 input/output and
$2.50 cache-write rate, but half the cached-input price ($0.10/MTok vs.
$0.20/MTok). See `provider-sources-and-price-keys.md`'s "September 30 2026"
entry for the full six-tier pricing and matchPattern detail. Every other price
checked this run — including every existing Anthropic, OpenAI, and Gemini row
below, the AWS Bedrock Public Extended Access limitation, and the TypeSafe Jev
`jev-1.13.0` pricing — matched verbatim; no other updates were needed. The
2026-09-29 run before it re-fetched the full Anthropic pricing page (model table,
cache-hits footnote, Fast mode and Batch tables), the Anthropic models-overview
comparison table, the OpenAI aggregate Standard/Fast-mode/Flex pricing summary,
the full OpenAI model catalog, a dedicated re-fetch of `gpt-5-chat-latest`'s own
model page, and both Gemini pricing pages (3.x and 2.5 families) plus the
Gemini models catalog. This run found one new model, released the day before
the audit: **Claude Sonnet 5.5** (`claude-sonnet-5-5`), Anthropic's new
Sonnet-tier flagship (Sonnet 5 demoted to legacy), priced identically to
`claude-sonnet-5` ($2/$10 input/output, standard 0.1x cache-read multiplier, no
Fast mode, flat 1M context) — see `provider-sources-and-price-keys.md`'s
"September 29 2026" entry for full detail. Every other price checked this run —
including every existing Anthropic, OpenAI, and Gemini row below — matched
verbatim. The 2026-09-22 run before it re-fetched the full Anthropic pricing page, the Anthropic
models-overview comparison table, the OpenAI aggregate Standard/Batch/Flex/Fast-mode
pricing tables plus the full model catalog, and both Gemini pricing pages (3.x and
2.5 families) plus the Gemini models catalog, with a follow-up verbatim-quote fetch
for `gemini-3.5-flash-lite`/`gemini-3.1-flash-lite`/`gemini-3.1-pro-preview`/
`gemini-3-flash-preview`. This run found two new model families and added all
three of their members: **Claude Opus 5.5** (`claude-opus-5-5`, Anthropic's new
recommended default, priced at half of Claude Opus 5 with a non-standard 0.05x
cache-read multiplier) and **GPT-6 Sol** / **GPT-6 Luna** (`gpt-6-sol`,
`gpt-6-luna`, filling out the GPT-6 family below `gpt-6-astra` with the same
six-tier Standard/Fast-mode/Flex/Large-Context shape). Every other price checked
this run — including every existing Anthropic, OpenAI, and Gemini row below —
matched verbatim; see `provider-sources-and-price-keys.md`'s "September 22 2026
audit" entry for full detail and the new models' own dedicated entries for exact
figures and matchPatterns. The 2026-09-14 run before it re-fetched the full Anthropic pricing table (plus the
models-overview table), the full OpenAI standard/Fast-mode/Flex pricing tables plus
the full model catalog page, both Gemini pricing pages (2.5-family and 3.x-family)
plus the Gemini models catalog, and a dedicated re-fetch of `gpt-5-chat-latest`'s own
model page. The original audit left prices unchanged, but its claim that Gemini
Priority had no request-time selector was incorrect. The focused follow-up verified
the documented `service_tier` parameter and added 13 Priority tiers across 11 Gemini
text models, including the two Pro large-context variants. Existing Standard prices
are unchanged. See the resolved Priority finding below and
`provider-sources-and-price-keys.md` for rates, selectors, and downgrade handling.
The 2026-09-10 run before it re-fetched the same set of official pages and also found
no drift beyond confirming `gpt-6-astra` (added 2026-09-03, not yet reflected in the
prior 2026-09-02 snapshot below) and ran the deterministic validator's
`--usage-key-model` check against **every** model in the file at once (not just
changed entries) — see unresolved finding #11 below for the pre-existing
alias-coverage gaps that full sweep surfaced. All rows below except the `gpt-6-astra`
row are carried over unchanged from the 2026-09-02 snapshot, which
itself re-fetched the full Anthropic pricing table (plus the models-overview table,
model-deprecations page, and the dedicated Mythos 5.1 page), the full OpenAI
standard/Fast-mode/Flex pricing tables (plus dedicated pages for `gpt-5.6-sol`,
`gpt-5.3-codex`, and `gpt-5.6-cyber`), and the Gemini AI Studio pricing/models pages
(with explicit Free/Paid column separation). That run found and added
`claude-fable-5-1`, `claude-mythos-5-1`, and `gemini-3.8-flash`; gave `gpt-5.3-codex`
a previously undocumented Fast mode tier; and found but deliberately left unadded
`gpt-5.6-cyber` (restricted cybersecurity endpoint, Daybreak-program-gated — now known
to have siblings `gpt-5.5-cyber`/`gpt-5.4-cyber`, see provider-sources-and-price-keys.md's
2026-09-10 entry).

| Provider | Model / pricing entry | Pricing checked | Price confirmed | Tiering checked | Tiering correct | Change | Official source(s) | Comments |
| -------- | --------------------- | --------------- | --------------- | --------------- | --------------- | ------ | ------------------- | -------- |
| OpenAI | gpt-6-astra | Input $10/MTok, Cached $1/MTok, Cache write $12.50/MTok, Output $50/MTok | Yes | Large Context (>272K) 2x/2x/2x/1.5x; Fast mode 2x base; Flex 0.5x base; Ultrafast 6x base ($60/$6/$75/$300, long-context $120/$12/$150/$450) | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-6-astra https://developers.openai.com/api/docs/guides/ultrafast-mode | Added 2026-09-03, re-confirmed unchanged 2026-09-10, 2026-09-14, and 2026-09-22. Ultrafast (`service_tier: "ultrafast"`) and Ultrafast · Large context tiers added 2026-09-30; it is the only model on the Ultrafast pricing tab. Eight-tier gpt-5.6-sol-style key set. |
| OpenAI | gpt-6-sol | Input $2/MTok, Cached $0.20/MTok, Cache write $2.50/MTok, Output $10/MTok | Yes | Large Context (>272K) 2x/2x/2x/1.5x; Fast mode 2x applicable tier; Flex 0.5x applicable tier | Yes | None | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-6-sol | Added 2026-09-22, re-confirmed unchanged 2026-09-30. Six-tier gpt-6-astra-style key set; same 1,050,000-token context window and 272K large-context threshold as gpt-6-astra. Still a distinct, separately-priced model ID from the newer gpt-6.1-sol. |
| OpenAI | gpt-6.1-sol | Input $2/MTok, Cached $0.10/MTok, Cache write $2.50/MTok, Output $10/MTok | Yes | Large Context (>272K) 2x/2x/2x/1.5x; Fast mode 2x applicable tier (large-context Fast row directly quoted); Flex 0.5x applicable tier (Flex·Large-Context derived, not separately published) | Yes | Added | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-6.1-sol | Added 2026-09-30. Six-tier gpt-6-sol-style key set; same context window and threshold as gpt-6-sol/gpt-6-astra. Cached-input price is half of gpt-6-sol's ($0.10 vs $0.20/MTok); every other base rate is identical. |
| OpenAI | gpt-6-luna | Input $0.10/MTok, Cached $0.01/MTok, Cache write $0.125/MTok, Output $0.50/MTok | Yes | Large Context (>272K) 2x/2x/2x/1.5x; Fast mode 2x applicable tier; Flex 0.5x applicable tier | Yes | Added | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-6-luna | Added 2026-09-22. Six-tier gpt-6-astra-style key set; same context window and threshold as gpt-6-astra/gpt-6-sol. |

| Provider | Model / pricing entry | Pricing checked | Price confirmed | Tiering checked | Tiering correct | Change | Official source(s) | Comments |
| -------- | --------------------- | --------------- | --------------- | --------------- | --------------- | ------ | ------------------ | -------- |
| Anthropic | claude-fable-5-1 | Input $10/MTok, Output $50/MTok, 5m $12.50/MTok, 1h $20/MTok, read $0.25/MTok (0.025x, not the standard 0.1x) | Yes | Flat 1M context; no Fast mode | Yes | Added | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/models/overview | New model, now Anthropic's recommended choice for "demanding reasoning and long-horizon agentic work" (ahead of Fable 5, now listed as legacy). Cache-read discount is 0.025x per an explicit page footnote, not the usual 0.1x. matchPattern mirrors `claude-fable-5` with a `-1` suffix. |
| Anthropic | claude-mythos-5-1 | Same as claude-fable-5-1 | Yes | Flat 1M context; no Fast mode | Yes | Added | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/models/mythos-5-1/overview | Limited availability (Project Glasswing), mirrors claude-mythos-5's simpler API-only matchPattern (no Bedrock/GCP variants). |
| Anthropic | claude-fable-5 | Input $10/MTok, Output $50/MTok, 5m $12.50/MTok, 1h $20/MTok, read $1/MTok | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged; now listed as "legacy (still available)" behind Fable 5.1 but pricing is the same. |
| Anthropic | claude-mythos-5 | Same as claude-fable-5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-opus-5-5 | Input $4/MTok, Output $20/MTok, 5m $5/MTok, 1h $8/MTok, read $0.20/MTok (0.05x, not the standard 0.1x) | Yes | Flat 1M context; Fast mode $8/$40 confirmed available | Yes | Added | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/models/overview | New model, now Anthropic's recommended default ("For long-running agentic coding and knowledge work") ahead of Opus 5. Cache-read discount is 0.05x per an explicit page footnote (a third distinct multiplier alongside the 0.025x Fable 5.1/Mythos 5.1 rate and the standard 0.1x). Fast-mode cache read/write derived by applying the documented multipliers to the $8 Fast-mode base (not the $4 Standard base): read $0.40, 5m write $10, 1h write $16. matchPattern mirrors claude-opus-5 with a `-5` suffix. |
| Anthropic | claude-opus-5 | Input $5/MTok, Output $25/MTok, 5m $6.25/MTok, 1h $10/MTok, read $0.50/MTok | Yes | Flat 1M context; Fast mode $10/$50 confirmed available | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-opus-4-8 | Same as Opus 5, Fast mode $10/$50 confirmed available | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-opus-4-7 | Same as Opus 5 base rate; **Fast mode NOT available** (requests with `speed:"fast"` error) | Yes | Flat 1M context; no Fast mode tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Explicitly confirmed via page text this run. File already correctly has only a Standard tier (no Fast mode) — do not add one without re-checking this page. |
| Anthropic | claude-opus-4-6 | Same as Opus 5 base rate; **Fast mode NOT available** (bills at standard rate) | Yes | Flat 1M context; no Fast mode tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Explicitly confirmed via page text this run. File already correctly has only a Standard tier. |
| Anthropic | claude-opus-4-5-20251101 | Same as Opus 5 | Yes | Single Standard tier in file (no separate Large Context tier); page wording on the 1M-flat-context list is ambiguous for 4.5 specifically but the main pricing table shows no separate rate, so the file's single-tier treatment is correct either way | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-opus-4-1-20250805 | Input $15/MTok, Output $75/MTok, 5m $18.75/MTok, 1h $30/MTok, read $1.50/MTok | Yes | Deprecated — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/about-claude/model-deprecations | Still "retired, except on Bedrock and Google Cloud"; deprecations page now shows a firm retirement date of August 5, 2026 (previously open-ended). |
| Anthropic | claude-opus-4-20250514 | Input $15/MTok, Output $75/MTok, 5m $18.75/MTok, 1h $30/MTok, read $1.50/MTok | Yes | Retired except Google Cloud — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/about-claude/model-deprecations | Re-confirmed present; deprecations page shows firm retirement date June 15, 2026. |
| Anthropic | claude-sonnet-5 | Input $2/MTok, Output $10/MTok; 5m $2.50/MTok, 1h $4/MTok, read $0.20/MTok | Yes | Flat 1M context; permanent pricing (no Sep 1 2026 increase) | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged; the $2/$10 permanent-pricing note is still on the page verbatim. Now "legacy (still available)" behind Sonnet 5.5. |
| Anthropic | claude-sonnet-5-5 | Input $2/MTok, Output $10/MTok; 5m $2.50/MTok, 1h $4/MTok, read $0.10/MTok (0.05x, corrected 2026-10-13; was $0.20/MTok standard 0.1x at launch) | Yes | Flat 1M context; no Fast mode (only Opus 5.5/5/4.8 have it) | Yes | Updated | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/models/overview https://platform.claude.com/docs/en/models/sonnet-5-5/overview | Released 2026-09-28, the current Sonnet-tier flagship (Sonnet 5 demoted to legacy). Input/output/cache-write pricing numerically identical to claude-sonnet-5; cache-read price was corrected 2026-10-13 from the standard 0.1x multiplier to a non-standard 0.05x multiplier per the pricing page's cache-hits footnote, which now lists Sonnet 5.5 alongside Opus 5.5 (both 0.05x) separately from the 0.025x Fable 5.1/Mythos 5.1 rate. AWS Bedrock's pricing page independently corroborates a "Starting October 7, 2026" 50%-off cache-read change for this model. matchPattern mirrors claude-sonnet-5 with a `-5` suffix, verified not to collide with it via the match-pattern tester. |
| Anthropic | claude-sonnet-4-6 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-sonnet-4-5-20250929 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | No large-context tier (200k hard cap) | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-sonnet-4-20250514 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | Retired except Bedrock/Google Cloud — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed present on current page's main table, unchanged. |
| Anthropic | claude-haiku-4-5-20251001 | Input $1/MTok, Output $5/MTok, 5m $1.25/MTok, 1h $2/MTok, read $0.10/MTok | Yes | No large-context tier | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-3-5-haiku-20241022 | Input $0.80/MTok, Output $4/MTok, 5m $1/MTok, 1h $1.60/MTok, read $0.08/MTok | Yes | Retired except Bedrock/Google Cloud | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed present, unchanged. |
| Anthropic | claude-3.7-sonnet-20250219 / claude-3.5-sonnet-20241022 / claude-3-5-sonnet-20240620 / claude-3-opus-20240229 / claude-3-sonnet-20240229 / claude-3-haiku-20240307 | Legacy prices retained | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run; retired, out of "flagship" scope. |
| AWS Bedrock | claude-3-5-sonnet-20240620 / claude-3.5-sonnet-20241022 (Public Extended Access SKU) | $6.00/MTok input, $30.00/MTok output, $7.50/MTok cache write, $0.60/MTok cache read | Yes (re-confirmed 2026-09-30) | Distinct dated SKU, not a context-length tier | Not applicable | Unresolved | https://aws.amazon.com/bedrock/pricing/ | Re-confirmed unchanged 2026-09-30; permanent documented limitation (model-ID string match cannot distinguish billing SKU). |
| OpenAI | gpt-5.6-sol | Input $4/MTok, Cached $0.40/MTok, Cache write $5.00/MTok, Output $20/MTok | Yes | Large Context (>272K): $8/$0.80/$10.00/$30; Fast mode 2x base; Flex 0.5x base | Yes | None | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.6-sol | Promotional price cut from Aug 24 2026 reconfirmed still active, still "available at least through November 21, 2026" — re-verify after that date. |
| OpenAI | gpt-5.6-terra | Input $2/MTok, Cached $0.20/MTok, Cache write $2.50/MTok, Output $12/MTok | Yes | Large Context (>272K): $4/$0.40/$5.00/$18 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.6-luna | Input $0.20/MTok, Cached $0.02/MTok, Cache write $0.25/MTok, Output $1.20/MTok | Yes | Large Context (>272K): $0.40/$0.04/$0.50/$1.80 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.6-cyber | Input $12.50/MTok, Cached $1.25/MTok, Cache write $15.625/MTok, Output $75/MTok | Yes | Large Context (>272K) at the same 2x/1.5x multiplier as sol/terra/luna | Yes | Unresolved (deliberately not added) | https://developers.openai.com/api/docs/models/gpt-5.6-cyber | New model found this run: a specialized, Daybreak-program-gated cybersecurity endpoint (Responses API only). Deliberately left out of the pricing file and `types.ts` — see provider-sources-and-price-keys.md for the scope rationale. |
| OpenAI | gpt-5.5-2026-04-23 (alias gpt-5.5) | Input $5/MTok, Cached $0.50/MTok, Output $30/MTok | Yes | Large Context (>272K): $10/$1.00/$45 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.5-pro-2026-04-23 (alias gpt-5.5-pro) | Input $30/MTok, Output $180/MTok; no cache | Yes | Large Context (>272K): $60/$270 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4 (and dated snapshot gpt-5.4-2026-03-05) | Input $2.50/MTok, Cached $0.25/MTok, Output $15/MTok | Yes | Large Context (>272K): $5.00/$0.50/$22.50 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4-pro (and dated snapshot) | Input $30/MTok, Output $180/MTok; no cache | Yes | Large Context (>272K): $60/$270 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4-mini (and dated snapshot) | Input $0.75/MTok, Cached $0.075/MTok, Output $4.50/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4-nano (and dated snapshot) | Input $0.20/MTok, Cached $0.02/MTok, Output $1.25/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.3-codex | Input $1.75/MTok, Cached $0.175/MTok, Output $14.00/MTok | Yes | No large-context tier (400k context window); Fast mode $3.50/$0.35/$28.00 | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.3-codex | Standard price unchanged. Added a previously-undocumented Fast mode tier found in the aggregate pricing page's "Specialized models" Fast-mode section (not on the model's own dedicated page). Also completed the Standard tier's alias set (`cache_read_input_tokens`, `reasoning_tokens`) to match the mature OpenAI reasoning-model template. |
| OpenAI | gpt-5.2-2025-12-11 | Input $1.75/MTok, Cached $0.175/MTok, Output $14.00/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.2-pro-2025-12-11 | Input $21/MTok, Output $168/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.1-2025-11-13 | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-2025-08-07 | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-mini-2025-08-07 | Input $0.25/MTok, Cached $0.025/MTok, Output $2/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-nano-2025-08-07 | Input $0.05/MTok, Cached $0.005/MTok, Output $0.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-pro-2025-10-06 | Input $15/MTok, Output $120/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-chat-latest | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | Yes | No provider tiering (128,000 token context window; max input 272,000) | Not applicable | None | https://developers.openai.com/api/docs/models/gpt-5-chat-latest | Re-fetched directly 2026-09-14 (dedicated model page): unchanged. Still absent from the aggregate standard-pricing table by design; that table's summarized row for this alias again showed a stale $5.00/$0.50/$30.00 artifact (matching pre-Aug-24 gpt-5.6-sol figures) this run — do not trust the aggregate table for this alias, always use the dedicated model page. |
| OpenAI | gpt-4.1-2025-04-14 | Input $2/MTok, Cached $0.50/MTok, Output $8/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4.1-mini-2025-04-14 | Input $0.40/MTok, Cached $0.10/MTok, Output $1.60/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4.1-nano-2025-04-14 | Input $0.10/MTok, Cached $0.025/MTok, Output $0.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4o-2024-08-06 | Input $2.50/MTok, Cached $1.25/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4o-2024-05-13 | Input $5/MTok, Output $15/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4o-mini-2024-07-18 | Input $0.15/MTok, Cached $0.075/MTok, Output $0.60/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o1 | Input $15/MTok, Cached $7.50/MTok, Output $60/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o1-pro | Input $150/MTok, Output $600/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o3-pro | Input $20/MTok, Output $80/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o3-2025-04-16 | Input $2/MTok, Cached $0.50/MTok, Output $8/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o3-mini-2025-01-31 | Input $1.10/MTok, Cached $0.55/MTok, Output $4.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o4-mini-2025-04-16 | Input $1.10/MTok, Cached $0.275/MTok, Output $4.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4-turbo-2024-04-09 | Input $10/MTok, Output $30/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4-0613 | Input $30/MTok, Output $60/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-3.5-turbo / gpt-3.5-turbo-0125 | Input $0.50/MTok, Output $1.50/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-3.5-turbo-1106 | Input $1.00/MTok, Output $2.00/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-3.5-turbo-instruct | Input $1.50/MTok, Output $2.00/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | davinci-002 | Input $2.00/MTok, Output $2.00/MTok (base/non-fine-tuned) | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | babbage-002 | Input $0.40/MTok, Output $0.40/MTok (base/non-fine-tuned) | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-2.5-flash | Input $0.30 (text/image/video) $1.00 (audio), Output $2.50, Cache read $0.03/$0.10 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-2.5-flash-lite | Input $0.10 (text/image/video) $0.30 (audio), Output $0.40, Cache read $0.01/$0.03 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-2.5-pro | Input $1.25/$2.50 (≤200k/>200k), Output $10/$15, Cache read $0.125/$0.25 | Yes | Large Context (>200K) confirmed | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. Also confirmed the file correctly omits grounding keys for this model (2.5-family grounding is $35/1,000, a different rate from 3.x's $14/1,000 — no shared-constant bug). |
| Google | gemini-3.5-flash | Input $1.50, Output $9.00, Cache read $0.15 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-3.5-flash-lite | Input $0.30 (text/image/video/audio), Output $2.50, Cache read $0.03 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged via this run's targeted Paid-tier fetch. |
| Google | gemini-3.1-flash-lite | Input $0.25/$0.50 (text/audio), Output $1.50, Cache read $0.025/$0.05 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Re-confirmed unchanged. |
| Google | gemini-3.1-flash-lite-preview | Same as GA gemini-3.1-flash-lite | No | No large-context tier | Not applicable | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/models | Still not separately listed on either official page; not re-verified independently. |
| Google | gemini-3.1-pro-preview | Input $2/$4 (≤200k/>200k), Output $12/$18 | Yes | Large Context (>200K) confirmed | Yes | None | https://ai.google.dev/pricing | Re-confirmed unchanged. |
| Google | gemini-3-flash-preview | Input $0.50/$1.00 (text/audio), Output $3.00, Cache read $0.05/$0.10 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Re-confirmed unchanged. |
| Google | gemini-3-pro-preview | Input $2/$4 (≤200k/>200k), Output $12/$18 | No | Large Context (>200K) set in file | Not applicable | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/models | Still not listed on either official page this run; existing prices retained, not re-verified. |
| Google | gemini-3.6-flash | Input $0.75, Output $3.75, Cache read $0.075 (all through Dec 31, 2026; reverts to $1.50/$7.50/$0.15 from Jan 1, 2027) | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed still on introductory pricing; wording and step-up date unchanged. Now the "previous-generation" Flash model behind gemini-3.7-flash and gemini-3.8-flash. |
| Google | gemini-3.7-flash | Same introductory pricing/step-up date as gemini-3.6-flash | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/models | Re-confirmed unchanged; description changed from "New Stable" to "previous-generation" now that gemini-3.8-flash is GA. |
| Google | gemini-3.8-flash | Input $0.75, Output $3.75, Cache read $0.075 (through Dec 31, 2026; steps to $1.50/$7.50/$0.15 Jan 1, 2027) | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing https://ai.google.dev/gemini-api/docs/models | Re-confirmed unchanged. |
| Google | gemini-4-argon | Standard: Input $2.00, Output $10.00 (incl. thinking), Cache read $0.10 (through Nov 30, 2026; steps to $4.00/$20.00/$0.20 Dec 1, 2026). Priority (`service_tier: "priority"`, 1.8x Standard at every date): $3.60/$18.00/$0.18 through Nov 30, 2026, doubling with Standard on Dec 1, 2026 | Yes | No context-length pricing threshold (flat 1,048,576-token window); Standard + Priority tiers only | Yes | Added | https://ai.google.dev/gemini-api/docs/models https://ai.google.dev/gemini-api/docs/models/gemini-4-argon https://ai.google.dev/gemini-api/docs/pricing | New flagship reasoning model, "New Stable" status. 1M unified input/output context, max output 1,048,576 with long decode (65,536 default). Text/image/video/audio/PDF input, text-only output, thinking (low/medium/high) billed at the output rate, function calling, Search + Maps grounding ($14/1,000 queries, same shared quota as other Gemini 3.x-and-newer models), implicit-only caching (no explicit cache-write key). Different step-up date (Dec 1, 2026) than the 3.6/3.7/3.8-flash family's Jan 1, 2027 date — do not conflate. Added to `googleAIStudioModels` only; `vertexAIModels` left unresolved because the Vertex AI lifecycle page redirects outside the allowed WebFetch domain list (see the standing quirk note in provider-sources-and-price-keys.md). |
| Google | gemini-2.0-flash / gemini-2.0-flash-001 | Input $0.10, Output $0.40 | No | Deprecated (shut down June 1, 2026) | Not applicable | None | https://ai.google.dev/pricing | Not re-verified this run; retained for backward compatibility. |

## Unresolved findings (updated 2026-09-14)

1. **claude-opus-4-1-20250805 / claude-opus-4-20250514 retirement** — Both still listed
   as "retired, except on Bedrock and Google Cloud" (Opus 4.1) or "except on Google
   Cloud" (Opus 4) on the main pricing page, but the model-deprecations page now shows
   firm past retirement dates (August 5, 2026 and June 15, 2026 respectively). Entries
   retained; re-check whether they are fully removed from the pricing page in the next
   audit.

2. **AWS Bedrock "Claude 3.5 Sonnet (Public Extended Access)" pricing** — Confirmed real
   (Aug 4 2026) but not representable in Langfuse's schema (model-ID string match only).
   Permanent, documented limitation; not re-checked this run.

3. **Legacy Claude 3.x / 3.5 / 3.7 models not on the current pricing page** — Not
   re-verified this run (`claude-3.7-sonnet-20250219`, `claude-3.5-sonnet-20241022`,
   `claude-3-5-sonnet-20240620`, `claude-3-opus-20240229`, `claude-3-sonnet-20240229`,
   `claude-3-haiku-20240307`). Existing prices retained. Low priority, retired/legacy.

4. **gemini-3.1-flash-lite-preview and gemini-3-pro-preview** — Still not separately
   listed on the official AI Studio pricing or models pages. Existing prices retained
   without fresh confirmation. Re-verify if these move from preview to GA.

5. **gemini-3.6-flash / gemini-3.7-flash / gemini-3.8-flash promotional pricing reverts
   2027-01-01** — All three models are confirmed on introductory pricing ($0.75/$3.75/MTok
   input/output, $0.075/MTok cache read) "through December 31, 2026," stepping up to
   $1.50/$7.50/$0.15 "starting January 1, 2027." The pricing file currently holds the
   discounted price (correct for now); update all three entries to the higher rate on or
   after 2027-01-01. Same time-based-tiering limitation previously seen with
   `claude-sonnet-5` — Langfuse's schema cannot express a calendar-date price step, so the
   file always holds the currently active rate.

6. **OpenAI "cache writes" is still gpt-5.6-family-only (now four members)** — The
   distinct 1.25x-of-input cache-write billing dimension applies to `gpt-5.6-sol`,
   `gpt-5.6-terra`, `gpt-5.6-luna`, and the newly found (but deliberately unadded)
   `gpt-5.6-cyber`. Every other checked OpenAI model still shows "—" for cache writes.
   Re-check this column whenever a new OpenAI reasoning model is added.

7. **Base vs. fine-tuning legacy pricing confusion is a real historical bug class** — See
   the davinci-002/babbage-002 fix (Aug 7 2026). When auditing any OpenAI base model that
   also has a legacy fine-tuning tier (`gpt-3.5-turbo`, `davinci-002`, `babbage-002`, and
   the fine-tunable snapshots `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`,
   `gpt-4.1-nano-2025-04-14`, `gpt-4o-2024-08-06`, `gpt-4o-mini-2024-07-18`,
   `o4-mini-2025-04-16`), confirm which table a fetched price came from before applying it
   to the bare (non-`ft:`) entry.

8. **Legacy/embedding/base-completion catalog tail not covered this run** — Entries such
   as `text-ada-001`, `text-babbage-001`, `text-curie-001`, `text-davinci-00{1,2,3}`,
   `text-embedding-*`, the Vertex `*-bison*`/`*-gecko*` PaLM family, `claude-1.x`/`claude-2.x`,
   and `gemini-1.0-*`/`gemini-pro` were not re-fetched this run, consistent with prior
   audits, since they are long-retired and out of the "flagship text/chat/reasoning model"
   scope.

9. **Gemini and OpenAI specialized-modality/restricted-access model waves confirmed out
   of scope** — `gemini-omni-flash`, `gemini-3.1-flash-live-preview`,
   `gemini-3.1-flash-tts-preview`, `gemini-3.5-live-translate-preview`, the
   `veo-3.1-*-generate-preview` pair, the `lyria-3-*`/`lyria-realtime-exp` family, and
   `gemini-robotics-er-2-preview` (found 2026-08-21, video/audio/TTS/music/robotics
   endpoints) plus `gpt-5.6-cyber` and the `gpt-daybreak-*-latest` aliases (found
   2026-09-02, a gated specialized cybersecurity endpoint and floating aliases). None
   were added, per the automated-audit rule to skip modality-specific or
   restricted-access endpoints. Re-investigate only if one of them gains a standard
   text-generation mode with open access and its own per-token text pricing.

10. **Selectable models with no matching pricing regex — confirmed still a known,
    intentional gap** — Last fully cross-checked 2026-08-24: `gemini-1.5-pro`,
    `gemini-1.5-flash`, `gemini-1.5-flash-8b`, `gemini-2.0-pro-exp-02-05`,
    `gemini-2.0-flash-exp`, `gemini-2.0-flash-thinking-exp-01-21`,
    `gemini-2.5-flash-preview-09-2025`, `gemini-2.5-flash-lite-preview-09-2025` have no
    matching pricing entry — retired/experimental IDs with no official pricing page
    entry, not a new finding. Not re-run this cycle (no new selectable model was added to
    `types.ts` outside the ones this audit itself added, which do have matching entries).

11. **Pre-existing usage-key alias-coverage gaps found via a full-file validator sweep
    (2026-09-10)** — Running `validate-pricing-file.mjs` with `--usage-key-model`
    supplied for every model in the file at once (not just changed entries) surfaces
    structural alias-family gaps on legacy entries that were never touched by an alias
    fix. None of these were changed this run — no official pricing evidence prompted an
    edit, and backfilling dozens of unrelated legacy entries in one audit would not be a
    surgical, evidence-driven change. Confirmed gaps as of 2026-09-10:
    - **Anthropic input/output missing the `_tokens` alias**: `claude-1.1`, `claude-1.2`,
      `claude-1.3`, `claude-2.0`, `claude-2.1`, `claude-instant-1`, `claude-instant-1.2`,
      `claude-3-opus-20240229`, `claude-3-haiku-20240307` have only `input`/`output`, not
      `input_tokens`/`output_tokens`.
    - **Gemini input/output missing every non-`input`/`output` alias**: `gemini-1.0-pro`,
      `gemini-1.0-pro-001`, `gemini-1.0-pro-latest`, `gemini-pro`, `gemini-1.5-pro-latest`,
      `gemini-2.0-flash`, `gemini-2.0-flash-001`, `gemini-2.0-flash-lite-preview`,
      `gemini-2.0-flash-lite-preview-02-05` have only `input`/`output`, not
      `input_text`/`input_modality_1`/`prompt_token_count`/`promptTokenCount` (and the
      output equivalents). `gemini-live-2.5-flash-native-audio` additionally lacks even
      the bare `input`/`output` keys (it uses modality-specific
      `input_text`/`input_audio`/`input_image`/`output_text`/`output_audio` only, which
      may be correct for a live/audio model rather than a genuine gap — not re-derived
      this run).
    - **OpenAI reasoning models missing the `reasoning_tokens` alias**: `o1`, `o1-2024-12-17`,
      `o1-preview`, `o1-preview-2024-09-12`, `o1-mini`, `o1-mini-2024-09-12`, `o3-mini`,
      `o3-mini-2025-01-31`, `o3-pro`, `o3-pro-2025-06-10`, `o1-pro`, `o1-pro-2025-03-19`,
      `gpt-5-pro`, `gpt-5-pro-2025-10-06`, `gpt-5.2-pro`, `gpt-5.2-pro-2025-12-11`,
      `gpt-5-chat-latest` have `output_reasoning_tokens`/`output_reasoning` but not the
      third `reasoning_tokens` alias. `o1`-family and `o1-preview`/`o1-mini` additionally
      lack the `cache_read_input_tokens` alias (only have `input_cached_tokens`/
      `input_cache_read`), as does `gpt-5-chat-latest`. `gpt-4.5-preview` and its dated
      snapshot lack `cache_read_input_tokens` too.
    Treat this as a standing, documented backlog rather than something to silently patch
    inside an unrelated price-confirmation audit; a future task that explicitly scopes
    "backfill legacy alias coverage" should address it deliberately, entry by entry,
    rather than as an audit side-effect.

## Resolved Priority finding (September 14 2026)

Gemini Priority is representable through `modelParameters.service_tier: "priority"`.
The [Priority guide](https://ai.google.dev/gemini-api/docs/priority-inference) and
[OpenAI compatibility guide](https://ai.google.dev/gemini-api/docs/openai#flex-and-priority-inference)
document the selector. The catalog includes all 11 text models listed in the
Priority guide, with combined Priority/context tiers for both Pro models.
The older snapshot rows above describe Standard prices; the current Priority rates
and exact model list are in `provider-sources-and-price-keys.md`.

Record the actual response tier from `x-gemini-service-tier` in model parameters:
Google can downgrade requests and bill Standard. Native Gemini response-header
capture is not automatic in Langfuse. This catalog update does not implement SDK
instrumentation, Vertex-specific billing, Flex, storage costs, or historical repricing.
