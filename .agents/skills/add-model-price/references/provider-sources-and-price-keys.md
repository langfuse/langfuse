# Provider Sources and Price Keys

## Official Pricing Sources

Always fetch pricing from the provider's official docs before editing.

| Provider                  | Source                                                                           |
| ------------------------- | -------------------------------------------------------------------------------- |
| Anthropic Claude          | `https://platform.claude.com/docs/en/about-claude/pricing`                       |
| OpenAI                    | `https://developers.openai.com/api/docs/pricing`                                 |
| Google Gemini (AI Studio) | `https://ai.google.dev/pricing`                                                  |
| Google Gemini (Vertex AI) | `https://cloud.google.com/vertex-ai/generative-ai/pricing#gemini-models`         |
| AWS Bedrock               | `https://aws.amazon.com/bedrock/pricing/`                                        |
| Azure OpenAI              | `https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/` |

### Known source quirks (as of 2026-06)

- **OpenAI** — `openai.com/api/pricing/` often returns HTTP 403 to automated fetchers.
  Use `https://developers.openai.com/api/docs/pricing` instead as that is often permitted.
  Use `https://developers.openai.com/api/docs/models/all` to discover model-by-model info and pricing.
  If this page fails, leave OpenAI prices unchanged and report the 403 as an unresolved finding.
- **OpenAI matchPattern prefix** — All OpenAI model entries must include `(openai\/)?`
  as an optional prefix in their matchPattern (e.g., `(?i)^(openai\/)?(gpt-4o)$`).
  Entries missing this prefix will not match model IDs sent with the `openai/` prefix.
  The `o4-mini` and `o4-mini-2025-04-16` entries were found missing this prefix in
  June 2026 and corrected. Verify any new OpenAI entries include it.
- **Google Gemini** — The AI Studio page (`ai.google.dev/pricing`) and the Vertex AI
  page (`cloud.google.com/vertex-ai/generative-ai/pricing`) can show different prices
  for the same model (e.g. Gemini 2.0 Flash: AI Studio $0.10/MTok vs Vertex $0.15/MTok
  as of June 2026). When they differ, prefer the AI Studio page for AI Studio–specific
  models and Vertex for Vertex-specific ones; leave the file unchanged and report the
  discrepancy when uncertain which applies.
- **Gemini 1.5 models** — `gemini-1.5-pro`, `gemini-1.5-flash`, and `gemini-1.5-flash-8b`
  are no longer listed on either official Gemini pricing page as of June 2026. They
  appear to be retired/deprecated. Do not add or modify their pricing without a concrete
  official source.
- **Gemini experimental / preview model IDs** — Models such as
  `gemini-2.0-flash-exp`, `gemini-2.0-pro-exp-02-05`, `gemini-2.0-flash-thinking-exp-01-21`,
  `gemini-2.5-flash-preview-09-2025`, and `gemini-2.5-flash-lite-preview-09-2025` are
  in the selectable model lists but have no standalone pricing entry on official pages.
  Do not add pricing for them without explicit official evidence.
- **Gemini 2.0 Flash** — `gemini-2.0-flash` and `gemini-2.0-flash-001` are in the
  selectable model lists and have pricing entries in the file, but as of June 2026
  these models are no longer listed on the official AI Studio pricing page. Treat the
  existing prices as the last known values; do not update without a concrete official
  source.
- **Gemini 3 Pro Preview** — `gemini-3-pro-preview` is in the selectable model lists
  and the pricing file but is NOT listed on the official AI Studio pricing page as of
  June 2026. Its prices ($2.00/≤200k, $4.00/>200k input; $12.00/$18.00 output) were
  set when the model was first added; do not update without explicit official evidence.
- **`gemini-3-pro-preview` and `gemini-3.1-flash-lite-preview` confirmed shut down
  (found September 3 2026)** — A targeted fetch of
  `https://ai.google.dev/gemini-api/docs/models` (its "Previous models" section) shows
  both explicitly labeled: "Gemini 3 Pro Preview (Shut down)" and "Gemini 3.1
  Flash-Lite Preview (Shut down)". Neither has a pricing row on
  `https://ai.google.dev/pricing` (confirmed again this run; `gemini-3.1-flash-lite`,
  without "Preview", does have a current row and is unaffected). This resolves the
  long-standing "still not listed" ambiguity in prior audits' unresolved findings —
  both are now confirmed retired, not merely undocumented previews. Per the
  automated-audit scope (adding/pricing changes only, no removal category is
  authorized), the pricing entries were left in place unchanged since historical
  traces that already used these model IDs still need cost lookups, and the
  selectable-model-list entries in `types.ts` were also left in place and reported
  as an unresolved finding rather than removed — a future task that explicitly asks
  to prune shut-down selectable models should remove them from `vertexAIModels` /
  `googleAIStudioModels` while keeping the pricing JSON entries intact.
- **Gemini cache-read ratio** — Google Gemini models consistently price cached input at
  10% of the base input price (e.g. Gemini 2.5 Flash: $0.30/MTok input → $0.03/MTok
  cached). If a cache-read price in the file diverges from this ratio, treat it as
  suspicious and verify against the official page before correcting.
- **`ai.google.dev/pricing` has separate Free-tier and Paid-tier columns — do not confuse
  them (resolved July 31 2026)** — The official Gemini pricing table has both a "Free of
  charge" column and a "Paid tier" column per row. A model row can legitimately read
  "Context caching price: Not available | $0.025/MTok (paid)" — the "Not available" only
  describes the free tier. Prior audits (July 23, 25, 27 2026) saw contradictory
  "available" vs "not available" summaries for `gemini-3.1-flash-lite` context caching
  because WebFetch's summarizer sometimes collapsed the two columns into one answer. A
  July 31 2026 fetch that explicitly asked to quote the row verbatim confirmed: Free tier
  = "Not available", Paid tier = "$0.025/MTok (text/image/video), $0.05/MTok (audio)",
  plus a **storage price** of $1.00 per 1M tokens per hour for the paid tier (a
  time-based holding cost with no equivalent usage key in Langfuse's pricing schema —
  do not attempt to represent it). Langfuse prices the paid/API tier, so
  `gemini-3.1-flash-lite`'s existing cache pricing ($0.025/MTok text/image/video,
  $0.05/MTok audio = 2.5e-8 / 5e-8 per token) is CONFIRMED CORRECT; no change was made.
  This resolves unresolved finding #5 from the July 27 2026 audit memory. Lesson: when a
  provider pricing page has multiple tiers/columns per model, ask WebFetch to quote the
  exact row verbatim (not "does caching exist") to avoid column-collapse artifacts.
- **Anthropic flat large-context models** — The Anthropic pricing page lists models with
  "full 1M token context window at standard pricing" in a dedicated "Long context pricing"
  section. As of July 2026 this list includes: Claude Fable 5, Claude Mythos 5, Claude
  Mythos Preview, Claude Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 5, and Sonnet 4.6. These
  models must NOT have a Large Context tier in the pricing file. Models not on this list
  (e.g. Sonnet 4.5, Haiku 4.5) may retain a Large Context tier if it was previously set.
  The Sonnet 4.6 Large Context tier was found and removed during the June 2026 audit.
- **Claude Sonnet 5 pricing is now permanent (resolved August 14 2026)** — The API model ID
  is `claude-sonnet-5` (no date suffix; pinned snapshot, not an alias). Pricing is $2/$10
  per input/output MTok; cache write 5m = $2.50/MTok, 1h = $4/MTok, read = $0.20/MTok. This
  was originally announced as introductory pricing through August 31, 2026 with a scheduled
  increase to $3/$15 on September 1, 2026, but the official pricing page now states that
  increase "will not occur" and the $2/$10 rate "is now the standard price". No file change
  was needed (the file already held $2/$10). Do not re-flag a September 1, 2026 price
  increase for this model in future audits. AWS Bedrock ID: `anthropic.claude-sonnet-5`.
  The model is in the flat long-context list (no Large Context tier). Added to pricing file
  and `anthropicModels` in July 2026 audit.
- **Claude Mythos Preview** — Listed in the Anthropic long-context pricing section and on
  the models page (access is invitation-only via Project Glasswing) but has NO separate
  pricing row in the main model pricing table and NO selectable-model entry in types.ts.
  Do not add a pricing entry without an explicit official price.
- **OpenAI WebFetch permissions** — In CI or restricted harness runs the WebFetch tool may
  be blocked by the harness permissions layer (error: "Claude requested permissions to use
  WebFetch, but you haven't granted it yet"), not a website-level HTTP 403. If the
  `developers.openai.com/api/docs/pricing` fetch fails for either reason, leave OpenAI
  prices unchanged and report it as an unresolved finding.
- **GPT-5.6 model family (added July 2026)** — OpenAI introduced a three-variant naming
  scheme for GPT-5.6: `gpt-5.6-sol` (flagship, $5/$0.50/$30 per MTok input/cached/output),
  `gpt-5.6-terra` (balanced, $2.50/$0.25/$15), and `gpt-5.6-luna` (cost-efficient,
  $1.00/$0.10/$6.00). All three are reasoning models; no date-stamped snapshot versions were
  present at launch. If dated versions appear (e.g. `gpt-5.6-sol-2026-07-xx`), add them
  as separate pricing entries following the gpt-5.4 / gpt-5.5 precedent.
  **Long context pricing** applies when input tokens exceed **272,000**: prices are 2× input
  and 1.5× output for the full request (cached input also doubles). Individual model page
  URLs: `https://developers.openai.com/api/docs/models/gpt-5.6-sol` (and -terra, -luna).
  Long context prices: sol $10/$1.00/$45, terra $5/$0.50/$22.50, luna $2/$0.20/$9
  per MTok input/cached/output. Added Large Context (>272K) tiers to the pricing file in
  July 2026. The threshold of 272K is unique to this family; most other models use 200K.
- **Gemini 3.6 Flash (added July 2026; introductory price cut found August 14 2026)** —
  `gemini-3.6-flash` appeared on the official AI Studio pricing page in July 2026 at
  $1.50/MTok input, $7.50/MTok output, cache read $0.15/MTok (10% cache-read ratio). No
  large-context tier. Added to pricing file and selectable model lists (`vertexAIModels`,
  `googleAIStudioModels`) in the July 22 2026 audit. Note: despite the higher version
  number, output price ($7.50) is lower than gemini-3.5-flash ($9.00); this is correct per
  the official page (improved efficiency at same input price). On August 14 2026, two
  independent targeted verbatim fetches (both `ai.google.dev/pricing` and
  `ai.google.dev/gemini-api/docs/pricing`, each explicitly separating Free/Paid columns)
  found Google had introduced introductory pricing for this model: $0.75/MTok input,
  $3.75/MTok output, $0.075/MTok cache read, explicitly "through December 31, 2026",
  stepping up to $1.50/$7.50/$0.15 (the original price above) "starting January 1, 2027".
  The pricing file was updated to the discounted rate; revert to $1.50/$7.50/$0.15 on or
  after 2027-01-01. Grounding/web-search pricing ($14 per 1,000 requests = 0.014/query,
  shared free quota across all Gemini 3.x models) is unchanged and confirmed via a
  dedicated grounding-pricing fetch.
- **Gemini 3.7 Flash (added August 14 2026)** — `gemini-3.7-flash` is a new GA ("New
  Stable") release confirmed via `https://ai.google.dev/gemini-api/docs/models`, described
  as "Our latest and most capable Flash model, built for complex coding, agentic workflows,
  and reliable multi-step execution" — the direct successor to `gemini-3.6-flash` (now
  described as the "previous-generation Flash model"). It launched at the exact same
  current introductory price as `gemini-3.6-flash`: $0.75/MTok input, $3.75/MTok output,
  $0.075/MTok cache read, "through December 31, 2026", stepping up to $1.50/$7.50/$0.15
  "starting January 1, 2027" — confirmed via two independent fetches of
  `ai.google.dev/pricing` and `ai.google.dev/gemini-api/docs/pricing`. Because a single,
  generically-worded WebFetch prompt about this page range previously mis-summarized both
  3.6 and 3.7 Flash (and even 3.1 Flash-Lite, a long-GA priced model) as "Free of charge"
  by picking the Free-tier column instead of Paid, always use a fetch prompt that
  explicitly asks to separate Free vs. Paid columns for these rows, per the existing
  Gemini free/paid column-collapse lesson above. No large-context tier. Grounding/web-search
  pricing ($14 per 1,000 requests) confirmed to apply uniformly to Gemini 3.x models
  including this one. Added to pricing file (mirroring the `gemini-3.6-flash` key set) and
  to `vertexAIModels`/`googleAIStudioModels` in `types.ts`, not as the first entry.
  matchPattern: `(?i)^(google(ai)?\/)?(gemini-3.7-flash)$`.
- **Gemini 3.5 Flash-Lite (added July 2026; cache pricing corrected August 2026)** —
  `gemini-3.5-flash-lite` appeared on the official AI Studio pricing page in July 2026 at
  $0.30/MTok input, $2.50/MTok output. No large-context tier. The entry was initially added
  on July 22 2026 with cache pricing; the cache keys were removed on July 23 2026 after the
  page appeared to show "Not available" for context caching on this model. Two independent
  verbatim-quote fetches on August 4 2026 (of both `ai.google.dev/pricing` and
  `ai.google.dev/gemini-api/docs/pricing`, each explicitly asked to separate the Free-tier
  column from the Paid-tier column) found the **Paid tier** context-caching read price is
  **$0.03/MTok** (exactly 10% of the $0.30 input price, matching Google's universal Gemini
  cache-read ratio), plus a $1.00/MTok/hour storage price (time-based, not representable —
  see the `gemini-3.1-flash-lite` storage-price note above). Only the **Free tier** says "Not
  available". Cache-read pricing (`input_cached_tokens` / `cached_content_token_count` at
  0.03e-6) was re-added to the pricing file on August 4 2026. Lesson: this model's context-
  caching availability has flip-flopped across at least 4 audit runs (Jul 22 add, Jul 23
  remove, Jul 25/27/31 confirm-removed, Aug 4 re-add) purely due to free/paid column
  collapsing in WebFetch summaries — always request a verbatim quote that explicitly names
  both columns for this specific page, and prefer cross-checking both
  `ai.google.dev/pricing` and `ai.google.dev/gemini-api/docs/pricing` when the two prior
  answers disagree.
- **Claude Opus 5 (added July 2026)** — `claude-opus-5` appeared on the official Anthropic pricing and models pages in July 2026. API ID: `claude-opus-5` (no date suffix, pinned snapshot). Bedrock ID: `anthropic.claude-opus-5`. Google Cloud ID: `claude-opus-5`. Pricing: $5/$25 MTok input/output, 5m cache $6.25/MTok, 1h cache $10/MTok, cache read $0.50/MTok — same as Opus 4.8/4.7/4.6. The model is in the flat long-context list (1M token context at standard pricing; no Large Context tier). Fast mode is available at $10/$50 MTok (shared price point with Opus 4.8). Added to pricing file and `anthropicModels` in the July 25 2026 audit. matchPattern: `(?i)^((anthropic\/)?claude-opus-5|(eu\.|us\.|apac\.|global\.)?anthropic\.claude-opus-5(-v1(:0)?)?)$`.
- **gpt-5-chat-latest confirmed pricing** — This alias has confirmed pricing at $1.25/MTok
  input, $0.125/MTok cached input, $10.00/MTok output, verified via its specific model page
  `https://developers.openai.com/api/docs/models/gpt-5-chat-latest` (July 2026 audit).
  A prior audit WebFetch of the overview pricing page returned an artifact suggesting
  "$5/$30", which was confusion with gpt-5.6-sol pricing. When a pricing summary for a
  model alias appears inconsistent with what the file holds, always fetch the specific
  model page (`https://developers.openai.com/api/docs/models/<model-id>`) to confirm.
- **gpt-5.3-codex (added July 2026)** — `gpt-5.3-codex` appeared on the OpenAI pricing
  page and model page in July 2026, described as "the most capable agentic coding model".
  Pricing: $1.75/MTok input, $0.175/MTok cached input, $14.00/MTok output. Context window:
  400k tokens; max output 128k tokens. No large-context tier. No date-stamped snapshot at
  launch. Standard OpenAI matchPattern: `(?i)^(openai\/)?(gpt-5.3-codex)$`. Added to pricing
file and `openAIModels`in July 27 2026 audit. Official sources:`https://developers.openai.com/api/docs/pricing` and
  `https://developers.openai.com/api/docs/models/gpt-5.3-codex`.
- **GPT-5.6 Sol price cut (found August 24 2026)** — OpenAI cut pricing for
  `gpt-5.6-sol` only; `gpt-5.6-terra` and `gpt-5.6-luna` are unchanged (re-confirmed
  identical to their July 31 2026 values below). Confirmed via 3 independent WebFetch
  calls: the aggregate standard-pricing-table dump, a targeted verbatim quote of the
  Standard-table row, and a dedicated fetch of
  `https://developers.openai.com/api/docs/models/gpt-5.6-sol` (which states the change is
  "a 20% reduction in input pricing and a 33% reduction in output pricing" with
  "promotional pricing available at least through November 21, 2026" — re-check after that
  date). New standard (≤272K) price: $4.00/MTok input, $0.40/MTok cached input, $5.00/MTok
  cache write, $20.00/MTok output (previously $5.00/$0.50/$6.25/$30.00). New Large Context
  (>272K) price: $8.00/$0.80/$10.00/$30.00 (previously $10.00/$1.00/$12.50/$45.00). The
  2x-input/1.5x-output large-context multiplier and the 1.25x-of-input cache-write
  multiplier both still hold exactly on the new base price. The Fast mode and Flex tiers
  (added August 20 2026) were independently re-fetched and also scale off the new base at
  their existing multipliers: Fast mode 2x base ($8.00/$0.80/$10.00/$40.00 standard,
  $16.00/$1.60/$20.00/$60.00 large-context), Flex 0.5x base ($2.00/$0.20/$2.50/$10.00
  standard, $4.00/$0.40/$5.00/$15.00 large-context). All six pricing-file tiers for
  `gpt-5.6-sol` were updated to match. Lesson: an aggregate WebFetch table dump can look
  identical in shape to a real price change vs. a hallucinated/garbled one (the first dump
  this run showed self-inconsistent numbers that didn't match any documented multiplier) —
  always cross-check a suspicious price-table result with a second, targeted verbatim-quote
  fetch and the model's own dedicated page before trusting it, and verify the documented
  formulas (large-context multiplier, cache-write multiplier) still reconcile with the new
  numbers before applying them.
- **GPT-5.6 Terra / Luna price cut (found July 31 2026)** — OpenAI lowered pricing for
  `gpt-5.6-terra` and `gpt-5.6-luna` sometime between the July 27 and July 31 2026 audits;
  `gpt-5.6-sol` was unchanged. Confirmed via 4 independent WebFetch calls (the overview
  pricing page fetched twice plus each model's dedicated page): `gpt-5.6-terra` is now
  $2.00/MTok input, $0.20/MTok cached input, $12.00/MTok output (previously
  $2.50/$0.25/$15.00); `gpt-5.6-luna` is now $0.20/MTok input, $0.02/MTok cached input,
  $1.20/MTok output (previously $1.00/$0.10/$6.00). The >272K Large Context tier still
  applies at 2x input / 1.5x output, with cached input also doubling (preserving the 10%
  cache-to-input ratio): terra large-context $4.00/$0.40/$18.00, luna large-context
  $0.40/$0.04/$1.80. `gpt-5.6-sol` remains $5.00/$0.50/$30.00 standard,
  $10.00/$1.00/$45.00 large-context — unchanged. Updated in the pricing file during the
  July 31 2026 audit. Official sources: `https://developers.openai.com/api/docs/pricing`,
  `https://developers.openai.com/api/docs/models/gpt-5.6-terra`,
  `https://developers.openai.com/api/docs/models/gpt-5.6-luna`. Lesson: do not assume a
  model family's siblings keep moving in lockstep — verify each model ID's own page even
  when the whole family was fully priced in a recent prior audit.
- **GPT-5.4 / GPT-5.5 Large Context (>272K) tier resolved (August 4 2026)** — Prior audits
  (through July 31 2026) left the exact large-context threshold and rates for `gpt-5.4`,
  `gpt-5.4-pro`, `gpt-5.5`, and `gpt-5.5-pro` as an unresolved finding. A row-by-row verbatim
  dump of the OpenAI pricing page's Standard/Batch/Flex tables (asking explicitly for every
  column, including any row literally labeled "cache writes") plus each model's own page
  confirmed the **272,000-token threshold already used for the gpt-5.6 family applies to
  these models too**, at the same 2x input / 1.5x output multiplier (cached input also 2x,
  preserving the 10% cache-to-input ratio): `gpt-5.4` large-context $5.00/$0.50/$22.50,
  `gpt-5.4-pro` large-context $60.00/—/$270.00 (no caching), `gpt-5.5` large-context
  $10.00/$1.00/$45.00, `gpt-5.5-pro` large-context $60.00/—/$270.00. None of these four
  have a cache-write price (confirmed via both the aggregate table, which shows "—" for
  their cache-writes columns, and each model's own page, which states cache reads have "no
  separate write fee"). Added Large Context tiers to all four pricing-file entries (and
  their dated-snapshot siblings `gpt-5.4-2026-03-05`, `gpt-5.4-pro-2026-03-05`) in the
  August 4 2026 audit; `gpt-5.4-mini`/`gpt-5.4-nano` (and dated siblings) confirmed to have
  no large-context tier (dashes in both columns) and were left unchanged. Official sources:
  `https://developers.openai.com/api/docs/pricing`,
  `https://developers.openai.com/api/docs/models/gpt-5.4`,
  `https://developers.openai.com/api/docs/models/gpt-5.5`.
- **OpenAI "cache writes" is a real, distinct billing dimension — currently gpt-5.6 family
  only (confirmed August 4 2026)** — The OpenAI pricing page's Standard/Batch/Flex tables
  have a literal "Short context cache writes" / "Long context cache writes" column,
  separate from "cached input" (cache reads). It is priced at 1.25x the base input rate for
  that context tier and is documented per-model ("Cache writes are billed at 1.25x the
  uncached input token rate."). As of August 4 2026 this column is populated (non-dash)
  **only** for `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` — every other checked
  OpenAI model (`gpt-5.5`, `gpt-5.5-pro`, `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`,
  `gpt-5.4-nano`, `gpt-5.2`, `gpt-5.1`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `o3`, `o4-mini`,
  `gpt-4o`, `gpt-4.1`) shows "—" for cache writes and only bills the standard discounted
  cache-read rate. The gpt-5.6 family's pricing-file entries already carry
  `input_cache_creation` / `cache_write_tokens` at the correct 1.25x rate from an earlier
  audit — no change needed there. Future audits should re-check this column whenever a new
  OpenAI reasoning model is added, since this is apparently expanding beyond a single
  family and is easy to miss if only "cached input" is checked.
- **Claude Sonnet 4.5 Large Context tier removed as incorrect (August 4 2026)** — The
  pricing file previously had a "Large Context" tier (>200K input, 2x input / 1.5x output)
  for `claude-sonnet-4-5-20250929`, flagged unresolved across several prior audits because
  Anthropic's pricing page does not publish a separate rate for it. The official
  `context-windows` page (`https://platform.claude.com/docs/en/build-with-claude/context-windows`)
  confirms Claude Sonnet 4.5 has a **hard 200k-token context window** (not on the 1M-token
  list with Sonnet 5/4.6/Opus 4.5+/Fable 5/Mythos 5) and that exceeding a model's context
  window returns a 400 error rather than being billed at a premium — so an "input > 200,000"
  condition can never legitimately fire for this model. The tier was removed; the model now
  has only the Standard tier, matching the precedent set by `claude-haiku-4-5-20251001`
  (also a 200k-context model with no Large Context tier). If a future model is documented
  with a _soft_ extended-context cap that bills at a premium rate past a threshold below its
  hard context-window limit, that would justify a real tier — verify the hard context-window
  size first before trusting an existing Large Context tier on a non-1M-context Claude model.
- **AWS Bedrock "Claude 3.5 Sonnet (Public Extended Access)" pricing confirmed real but not
  representable (updated August 4 2026)** — A targeted, non-aggregated fetch of
  `https://aws.amazon.com/bedrock/pricing/` asking specifically for every Claude 3.5 Sonnet
  row verbatim confirms this is a real, distinct SKU (not a summarization artifact as
  suspected in the July 31 2026 audit): "Claude 3.5 Sonnet (Public Extended Access,
  Effective 1 Dec 2025)" and "Claude 3.5 Sonnet v2 (Public Extended Access, Effective 1 Dec
  2025)" are both billed at $6.00/MTok input, $30.00/MTok output — double the $3/$15
  standard API rate the pricing file uses for `claude-3-5-sonnet-20240620` /
  `claude-3.5-sonnet-20241022` — with cache write $7.50/MTok and cache read $0.60/MTok
  (same 1.25x/0.1x multipliers as standard pricing, just on the doubled base rate). This
  applies only on specific Bedrock regions. **Still not actionable**: Langfuse's pricing
  schema matches a `matchPattern` against the model-ID string alone and has no dimension for
  "which cloud/tier is this specific Bedrock request billed under" — the same Bedrock model
  ID string (`anthropic.claude-3-5-sonnet-20240620-v1:0` etc.) is used for both the standard
  and the Public Extended Access rate, and Langfuse cannot tell them apart from usage data
  alone. Do not add a second pricing entry for this SKU; it would create an unresolvable
  matchPattern collision with the existing entry. Leave as a documented, confirmed
  limitation rather than an open question in future audits.
- **Gemini specialized-modality model wave (found August 21 2026, out of scope)** — The
  official Gemini models page (`ai.google.dev/gemini-api/docs/models`) now lists several
  new model IDs beyond `gemini-3.7-flash`: `gemini-omni-flash` ("Fast, conversational video
  generation and editing... turn text and images into video"), `gemini-3.1-flash-live-preview`
  ("Live API model for real-time dialogue and voice-first AI applications"),
  `gemini-3.1-flash-tts-preview` ("Powerful, low-latency speech generation"),
  `gemini-3.5-live-translate-preview` ("real-time speech to speech translation"), plus
  `veo-3.1-generate-preview`/`veo-3.1-lite-generate-preview` (video), `lyria-3-pro-preview`/
  `lyria-3-clip-preview`/`lyria-realtime-exp` (music), and `gemini-robotics-er-2-preview`
  (robotics). A targeted fetch of each model's description confirmed none is a
  general-purpose text/chat model with standard per-token text pricing — they are video
  generation, live/voice-only, text-to-speech, speech-to-speech translation, music
  generation, and robotics endpoints. Per the automated-audit skip rule for
  modality-specific endpoints, none were added to the pricing file or `types.ts`. Future
  audits do not need to re-investigate this family unless one of them gains a standard
  text-generation mode with its own per-token text pricing.
- **gpt-5-chat-latest confirmed again (August 21 2026)** — Re-fetched
  `https://developers.openai.com/api/docs/models/gpt-5-chat-latest` directly (it is absent
  from the aggregate standard-pricing-table dump, consistent with every prior audit).
  Confirmed unchanged: $1.25/MTok input, $0.125/MTok cached input, $10/MTok output, 128,000
  token context window, no large-context tier. Matches the file exactly
  (id `8ba72ee3-ebe8-4110-a614-bf81094447e5`).
- **OpenAI base-model vs. fine-tuning-legacy price mixups (fixed August 7 2026)** — The
  OpenAI pricing page lists some base model names in two different tables: the "Standard"
  table (bare inference pricing, what a `matchPattern` with no `ft:` prefix should use) and
  a separate "Fine-tuning" table, which shows a Training cost plus a **different, usually
  higher** Input/Output inference rate for legacy fine-tuned variants of that same base
  model. The pricing file's plain `davinci-002` and `babbage-002` entries (created January
  2024, never updated) had been priced at the Fine-tuning table's rate ($12/$12 and
  $1.60/$1.60 respectively) instead of the Standard table's base rate ($2.00/$2.00 and
  $0.40/$0.40). Confirmed via three independent targeted fetches that explicitly asked the
  page to distinguish the two tables. Corrected both entries to the Standard/base rate; the
  separate `ft:davinci-002` / `ft:babbage-002` entries already correctly held the
  fine-tuning rate and were left unchanged. When auditing any OpenAI base model that also
  has a legacy fine-tuning tier (currently: `gpt-3.5-turbo`, `davinci-002`, `babbage-002`,
  and the fine-tunable snapshots `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`,
  `gpt-4.1-nano-2025-04-14`, `gpt-4o-2024-08-06`, `gpt-4o-mini-2024-07-18`,
  `o4-mini-2025-04-16`), explicitly confirm which table a fetched price came from before
  applying it to the bare (non-`ft:`) entry — a summarizer can silently pick either table
  when both rows share the same model name.

- **Premium speed-tier pricing (`service_tier`/`speed`) is documented for far more
  models than the initial rollout covered (implemented 2026-08-20)** — The
  `model_parameters` tier-condition mechanism landed in PR #16204 (2026-08-18) and was
  used to add a "Fast mode" tier (`service_tier` in `["fast","priority"]`) to exactly
  four OpenAI entries: `gpt-5.5-2026-04-23`, `gpt-5.6-sol`, `gpt-5.6-terra`, and
  `gpt-5.6-luna`. Two independent `developers.openai.com/api/docs/pricing` fetches this
  run (one broad, one asking to quote the "Fast mode" table verbatim, plus a request to
  quote the separate "Flex" table verbatim) confirm OpenAI documents official Fast mode
  and Flex processing prices for many more models:
  - **Fast mode** (`service_tier: "fast"` or `"priority"`; "Priority processing" was
    renamed "Fast mode" on 2026-07-30, both values still accepted) — confirmed
    per-MTok short-context prices (input / cached input / output; cache writes only
    where shown): `gpt-5.4` $5.00/$0.50/$30.00, `gpt-5.4-mini` $1.50/$0.15/$9.00,
    `gpt-5.2` $3.50/$0.35/$28.00, `gpt-5.1` $2.50/$0.25/$20.00, `gpt-5` $2.50/$0.25/$20.00,
    `gpt-5-mini` $0.45/$0.045/$3.60, `gpt-4.1` $3.50/$0.875/$14.00, `gpt-4.1-mini`
    $0.70/$0.175/$2.80, `gpt-4.1-nano` $0.20/$0.05/$0.80, `gpt-4o` $4.25/$2.125/$17.00,
    `gpt-4o-2024-05-13` $8.75/—/$26.25, `gpt-4o-mini` $0.25/$0.125/$1.00, `o3`
    $3.50/$0.875/$14.00, `o4-mini` $2.00/$0.50/$8.00. (`gpt-5.5` Fast mode price was
    already re-confirmed as unchanged at $12.50/$1.25/$75.00 in the pricing file.)
  - **Flex** (`service_tier: "flex"`, a discount tier, roughly half of standard) —
    confirmed for `gpt-5.6-sol` $2.50/$0.25/$15.00, `gpt-5.6-terra` $1.00/$0.10/$6.00,
    `gpt-5.6-luna` $0.10/$0.01/$0.60, `gpt-5.5` $2.50/$0.25/$15.00, `gpt-5.4`
    $1.25/$0.13/$7.50, plus `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.4-pro`, `gpt-5.2`,
    `gpt-5.1`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `o3`, and `o4-mini` (prices seen but
    not individually re-quoted during the audit; all were re-read from the live table
    before implementation). The pricing file now represents these with
    `modelParameters.service_tier in ["flex"]`.
  - **Anthropic has the same class of gap**: the pricing page's "Fast mode pricing"
    section documents Claude Opus 5 / Claude Opus 4.8 Fast mode at $10/$50 per MTok
    input/output (`speed: "fast"` request parameter), but neither `claude-opus-5` nor
    `claude-opus-4-8` has a Fast-mode tier in the pricing file (both are single-tier
    `Standard`-only entries before the follow-up). The generated Anthropic Python SDK's
    beta `MessageCreateParamsBase` confirms the request field is `speed`, with values
    `"standard" | "fast"`; Anthropic's separate `service_tier` field controls capacity
    and is not the Fast-mode discriminator. The pricing file therefore matches
    `modelParameters.speed in ["fast"]`.
  - The 2026-08-20 follow-up added every Fast and Flex tier listed above to alias and
    dated-snapshot entries, plus combined Flex/large-context tiers where the documented
    > 272K multiplier applies. It also added the two Anthropic Fast-mode tiers, including
    > the documented prompt-cache multipliers.

- **Claude Fable 5.1 / Claude Mythos 5.1 (added September 2 2026)** — Anthropic
  released `claude-fable-5-1` (now the recommended model for "demanding reasoning and
  long-horizon agentic work" ahead of `claude-fable-5`, which the models-overview page
  now lists under "Legacy models (still available)") and `claude-mythos-5-1`
  (limited availability via Project Glasswing, mirroring `claude-mythos-5`). Both are
  priced identically to their non-`5-1` siblings for base input ($10/MTok), output
  ($50/MTok), 5m cache write ($12.50/MTok), and 1h cache write ($20/MTok) — but **cache
  hits are priced at 0.025x base input ($0.25/MTok) instead of the standard 0.1x
  multiplier** used by every other Claude model including `claude-fable-5` and
  `claude-mythos-5`. Confirmed verbatim via the pricing page's model table and its
  footnote: "Cache hits and refreshes on Claude Fable 5.1 and Claude Mythos 5.1 are
  priced at 0.025x the base input price. All other models use the standard 0.1x
  multiplier." No Fast mode (only Opus 5 / Opus 4.8 have Fast mode). Both are on the
  flat 1M-context list. API ID / Bedrock ID / Google Cloud ID: `claude-fable-5-1` and
  `claude-mythos-5-1` (dateless pinned snapshots, following the `claude-fable-5`
  pattern with `-1` appended — verify this doesn't collide with the non-`5-1` sibling's
  `matchPattern`, since both are anchored with `$` and the `-1` suffix prevents overlap
  either direction). Official sources:
  `https://platform.claude.com/docs/en/about-claude/pricing`,
  `https://platform.claude.com/docs/en/models/overview`,
  `https://platform.claude.com/docs/en/models/mythos-5-1/overview`.
- **Fast mode confirmed NOT available on Claude Opus 4.7 or Opus 4.6 (confirmed
  September 2 2026)** — The pricing page's "Fast mode pricing" section states
  verbatim: "Fast mode is not available on Claude Opus 4.7 (requests with
  `speed: "fast"` return an error) or Claude Opus 4.6 (requests run at standard speed
  and are billed at standard rates)." Only Claude Opus 5 and Claude Opus 4.8 have a
  Fast mode tier ($10/$50 per MTok input/output). The pricing file already reflects
  this correctly (`claude-opus-4-7` and `claude-opus-4-6` have only a Standard tier;
  `claude-opus-5` and `claude-opus-4-8` each have a Fast mode tier) — no change was
  needed, but do not add a Fast mode tier to Opus 4.7 or Opus 4.6 in a future audit
  without first re-checking this page, since the two are easy to conflate with their
  Fast-mode-supporting siblings.
- **gpt-5.3-codex Fast mode tier (added September 2 2026)** — OpenAI documents Fast
  mode pricing for `gpt-5.3-codex` at $3.50/MTok input, $0.35/MTok cached input,
  $28.00/MTok output (exactly 2x the standard $1.75/$0.175/$14.00 rate), but **only in
  the main pricing page's Fast-mode table's "Specialized models" section** — the
  model's own dedicated page (`https://developers.openai.com/api/docs/models/gpt-5.3-codex`)
  does not mention Fast mode at all. A first fetch of the dedicated model page alone
  incorrectly suggested no Fast mode tier existed; a second fetch of the aggregate
  `developers.openai.com/api/docs/pricing` page, asked specifically to check the
  "Specialized models" rows of the Fast mode table, found the row. Lesson: for
  Codex-family (and possibly other "Specialized models" section) entries, always check
  that aggregate table section even when the model's own page looks silent on Fast
  mode. Also added the previously-missing `cache_read_input_tokens` and
  `reasoning_tokens` aliases to this entry's Standard tier (it only had the narrower
  `input_cached_tokens`/`input_cache_read` and `output_reasoning_tokens`/
  `output_reasoning` aliases) so both tiers expose the same complete key set, per the
  usage-key matrix's OpenAI reasoning-model template.
- **gpt-5.6-cyber found, confirmed out of scope (September 2 2026)** — OpenAI's
  models-listing page lists `gpt-5.6-cyber`, described as "Our most advanced
  cybersecurity model for authorized vulnerability research and security testing,"
  priced at $12.50/MTok input, $1.25/MTok cached input, $15.625/MTok cache write
  (1.25x input, matching the gpt-5.6-family pattern), $75.00/MTok output, with the
  same >272K long-context multiplier as the rest of the gpt-5.6 family. It requires
  separate approval through OpenAI's "Daybreak" program and supports only the
  Responses API. Not added: unlike the general-purpose gpt-5.6 sol/terra/luna models,
  this is a gated, specialized-use endpoint most Langfuse customers cannot call
  regardless of pricing-file coverage. Treat as a documented, deliberate scope
  exclusion rather than a gap to re-investigate every run unless a future task
  explicitly asks to cover restricted/specialized OpenAI models. Also noted:
  `gpt-daybreak-red-latest` and `gpt-daybreak-blue-latest` are floating aliases (not
  pinned snapshots) currently pointing at `gpt-5.6-cyber` and `gpt-5.6-sol`
  respectively — do not add pricing entries for `-latest`-style floating aliases.
- **Gemini 3.8 Flash (added September 2 2026)** — `gemini-3.8-flash` is confirmed via
  `https://ai.google.dev/gemini-api/docs/models` as the new "New Stable" GA release,
  described as "Our most intelligent Flash model, engineered for long-horizon software
  engineering, autonomous agents, and complex enterprise workflows" — the direct
  successor to `gemini-3.7-flash` (whose description changed to "Our previous-generation
  Flash model," matching the same demotion pattern seen when 3.7 superseded 3.6). It
  launched at the exact same introductory price as `gemini-3.6-flash`/`gemini-3.7-flash`:
  $0.75/MTok input, $3.75/MTok output, $0.075/MTok cache read, "through December 31,
  2026," stepping up to $1.50/$7.50/$0.15 "starting January 1, 2027" — confirmed via a
  targeted verbatim fetch of `ai.google.dev/gemini-api/docs/pricing` that explicitly
  separated the Free/Paid columns. Added to the pricing file (mirroring the
  `gemini-3.7-flash` key set exactly, including `grounding_queries`/`web_search_queries`
  at 0.014/query) and to `vertexAIModels`/`googleAIStudioModels` in `types.ts`, not as
  the first entry. matchPattern: `(?i)^(google(ai)?\/)?(gemini-3.8-flash)$`. This is now
  a third model sharing the same Jan 1, 2027 price step-up — see unresolved finding in
  `model-audit-memory.md` about updating all three (3.6, 3.7, 3.8 Flash) on/after that
  date.
- **Gemini 2.5-family grounding price is a different rate than 3.x — confirmed the
  pricing file correctly has no grounding keys on 2.5-family models (September 2
  2026)** — `gemini-2.5-pro`/`gemini-2.5-flash`/`gemini-2.5-flash-lite` grounding is
  "1,500 RPD (free), then $35 per 1,000 grounded prompts" per the official pricing
  page, a different rate from the Gemini 3.x $14-per-1,000 rate. Verified via `jq` that
  none of the three 2.5-family pricing-file entries carry a `grounding_queries` key —
  the 0.014/query rate is correctly scoped to 3.x models only. No change needed; this
  confirms the existing scoping is correct rather than being a shared/hardcoded bug.

Capture:

1. Base input token price per million tokens
2. Output token price per million tokens
3. Cache write price when supported
4. Cache read price when supported
5. Any long-context or conditional pricing
6. All model ID variants that Langfuse should match

## Price Conversion

Values in `default-model-prices.json` are per token, not per million tokens.

| Provider Price | JSON Value |
| -------------- | ---------- |
| `$5 / MTok`    | `5e-6`     |
| `$25 / MTok`   | `25e-6`    |
| `$0.50 / MTok` | `0.5e-6`   |
| `$6.25 / MTok` | `6.25e-6`  |

Formula:

```text
price_per_token = price_per_mtok / 1_000_000
```

## Provider Usage Keys

Use [provider-usage-key-matrix.md](provider-usage-key-matrix.md) as the single
source of truth for OpenAI, Gemini, Anthropic, and Bedrock usage aliases. Do not
copy a partial key set from this pricing-source reference or from an older model
entry.
