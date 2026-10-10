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
| TypeSafe (Jev)            | `https://docs.typesafe.ai/models`                                                |

## Official Model Lifecycle Sources

Use these to decide whether a selectable model is still served. See "Selectable
Model Availability" in `automated-audit.md` for the removal criteria.

- Anthropic Claude: `https://platform.claude.com/docs/en/about-claude/model-deprecations`
- OpenAI: `https://developers.openai.com/api/docs/deprecations`
- Google Gemini (AI Studio): `https://ai.google.dev/gemini-api/docs/models`
  (shut-down models are labeled "Shut down") and
  `https://ai.google.dev/gemini-api/docs/deprecations`
- Google Gemini (Vertex AI):
  `https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions`.
  It redirects to
  `docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions`;
  if the fetch is blocked on that redirect, report it as unresolved and do not
  remove Vertex AI entries without other official evidence.

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
  both are now confirmed retired, not merely undocumented previews. The pricing
  entries stay in place because historical traces that already used these model IDs
  still need cost lookups. Their selectable-model entries meet the removal criteria
  in `automated-audit.md`: a manual October 2026 cleanup removed them from
  `vertexAIModels`, and they should be removed from `googleAIStudioModels` once the
  shutdown status is re-confirmed on the official models page.
- **Gemini cache-read ratio** — Google Gemini models consistently price cached input at
  10% of the base input price (e.g. Gemini 2.5 Flash: $0.30/MTok input → $0.03/MTok
  cached). Priority tables can round this differently (3.5 Flash-Lite: $0.05 cache
  read on $0.54 input); use the published rate. If a cache-read price in the file diverges from this ratio, treat it as
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

- **Claude Sonnet 5.5 (added September 29 2026)** — Anthropic released
  `claude-sonnet-5-5` on September 28, 2026 ("Latest"), confirmed via
  `https://platform.claude.com/docs/en/about-claude/pricing`,
  `https://platform.claude.com/docs/en/models/overview`, and its dedicated
  model page `https://platform.claude.com/docs/en/models/sonnet-5-5/overview`.
  It supersedes `claude-sonnet-5` as the current Sonnet-tier model (Sonnet 5
  moved to "Legacy models (still available)"). API ID / alias / Bedrock ID /
  Google Cloud ID / Microsoft Foundry ID / Claude Platform on AWS ID are all
  the dateless `claude-sonnet-5-5` / `anthropic.claude-sonnet-5-5` pattern.
  Pricing is numerically identical to `claude-sonnet-5`: $2/MTok input,
  $10/MTok output, 5m cache write $2.50/MTok, 1h cache write $4/MTok, cache
  read $0.20/MTok (standard 0.1x multiplier — the pricing page's cache-hits
  footnote only lists Fable 5.1/Mythos 5.1 at 0.025x and Opus 5.5 at 0.05x as
  non-standard, so Sonnet 5.5 is not an exception). On the flat 1M-context
  list (1M context window, 128K max output, no Large Context tier) since it is
  a Claude 4.6-or-later-generation model. **No Fast mode**: the Fast mode
  pricing table lists only Claude Opus 5.5, Claude Opus 5, and Claude Opus
  4.8 — no Sonnet or Haiku model has ever had a Fast-mode tier. Batch is
  $1/$5 (50% of standard, matching `claude-sonnet-5`'s Batch row exactly) but,
  per existing precedent, no Batch tier was added (no Anthropic model in this
  file has one). Added to the pricing file mirroring `claude-sonnet-5`'s exact
  key set and to `anthropicModels` in `types.ts` immediately after
  `claude-sonnet-5`, not as the first entry. matchPattern:
  `(?i)^((anthropic\/)?claude-sonnet-5-5|(eu\.|us\.|apac\.|au\.|jp\.|global\.)?anthropic\.claude-sonnet-5-5(-v1(:0)?)?)$`
  — verified via the bundled match-pattern tester that this does not collide
  with `claude-sonnet-5`'s pattern (both fully anchored with `^...$`, mirroring
  the `claude-opus-5` / `claude-opus-5-5` precedent).
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
  - **Ultrafast** (`service_tier: "ultrafast"`, documented September 30 2026) —
    OpenAI's fastest tier, guide at
    `https://developers.openai.com/api/docs/guides/ultrafast-mode`. The pricing
    page's "Ultrafast" tab lists only `gpt-6-astra`: $60/$6/$75/$300 short-context
    and $120/$12/$150/$450 long-context (>272K) per MTok input / cached input /
    cache writes / output, i.e. 6x Standard. `gpt-6-astra` carries an `Ultrafast`
    tier and an `Ultrafast · Large context (>272K)` tier, ordered with the other
    combined service-tier + large-context tiers ahead of the single-condition
    tiers. `gpt-5.6-sol` has preview-only Ultrafast access with no published
    price; do not add a tier for it until the pricing page lists one.
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
- **GPT-6 Astra (added September 3 2026)** — `gpt-6-astra` is OpenAI's new
  flagship reasoning model ("Our most capable model, built for the hardest
  end-to-end work"), confirmed via `https://developers.openai.com/api/docs/pricing`
  and its dedicated model page `https://developers.openai.com/api/docs/models/gpt-6-astra`.
  API ID: `gpt-6-astra` (no date-stamped snapshot at launch, following the
  gpt-5.6 family's dateless-launch precedent). Context window 1,050,000 tokens
  (max input 922,000), max output 128,000 tokens, prompt caching and reasoning
  tokens supported. Standard pricing: $10/MTok input, $1/MTok cached input,
  $12.50/MTok cache write (1.25x input, matching the gpt-5.6-family pattern),
  $50/MTok output. **Large Context tier applies above 272,000 input tokens**
  (the same threshold as the gpt-5.6 family, not the 200K used by most other
  OpenAI models): 2x input/cache prices and 1.5x output for the full request —
  $20/$2/$25/$75. Fast mode (`service_tier` in `["fast","priority"]`) is 2x the
  applicable tier's rate: $20/$2/$25/$100 standard, $40/$4/$50/$150 large
  context (Fast mode is documented as unavailable for EU data residency
  requests — Langfuse's pricing schema cannot condition on data residency, so
  the tier is added unconditionally like every other Fast-mode tier). Flex
  (`service_tier: "flex"`) is 0.5x the applicable tier's rate: $5/$0.50/$6.25/$25
  standard, $10/$1/$12.50/$37.50 large context. Added to the pricing file
  mirroring the `gpt-5.6-sol` six-tier key set exactly (Standard, Fast mode ·
  Large context, Flex · Large context, Fast mode, Flex, Large Context) and to
  `openAIModels` in `types.ts` (not as the first entry). matchPattern:
  `(?i)^(openai/)?(gpt-6-astra)$`. Confirmed via two independent WebFetch
  calls (aggregate pricing table plus the dedicated model page) that returned
  consistent numbers. **Batch pricing intentionally not added**: the pricing
  page also documents a Batch tier at 50% of Standard (same discount as Flex),
  but no OpenAI model in this file has ever had a Batch tier represented —
  Batch is a distinct async submission endpoint (results collected up to 24h
  later via a separate Batches API) rather than a `service_tier` value on a
  normal chat/response request, so it would not appear in ordinary Langfuse
  ingestion usage data the way `fast`/`priority`/`flex` do. Treat this as the
  established scope boundary rather than a gap to fill without first
  confirming Langfuse actually observes a `service_tier: "batch"` (or
  equivalent) value in real ingested usage payloads for any provider request
  path.
- **Gemini 2.5-family grounding price is a different rate than 3.x — confirmed the
  pricing file correctly has no grounding keys on 2.5-family models (September 2
  2026)** — `gemini-2.5-pro`/`gemini-2.5-flash`/`gemini-2.5-flash-lite` grounding is
  "1,500 RPD (free), then $35 per 1,000 grounded prompts" per the official pricing
  page, a different rate from the Gemini 3.x $14-per-1,000 rate. Verified via `jq` that
  none of the three 2.5-family pricing-file entries carry a `grounding_queries` key —
  the 0.014/query rate is correctly scoped to 3.x models only. No change needed; this
  confirms the existing scoping is correct rather than being a shared/hardcoded bug.
- **September 6 2026 audit: full re-fetch found no price or catalog drift; a newer
  Gemini specialized-model wave confirmed out of scope** — Re-fetched the full
  Anthropic pricing table, the OpenAI aggregate Standard/Fast-mode/Flex pricing
  tables plus the dedicated `gpt-6-astra` model page, and the Gemini AI Studio
  pricing pages (`ai.google.dev/pricing` for the 2.5 family, plus
  `ai.google.dev/gemini-api/docs/pricing` and `ai.google.dev/gemini-api/docs/models`
  for the 3.x family and full model catalog). Every price already in the pricing
  file — including `gpt-6-astra`'s six tiers and `gemini-3.8-flash`'s introductory
  rate — matched verbatim; no updates were needed. `ai.google.dev/gemini-api/docs/models`
  now additionally lists `gemini-3.5-transcribe` / `gemini-3.5-transcribe-live`
  (speech-to-text), `gemini-omni-1.1-flash` (video generation/editing, replacing the
  August 21 2026 wave's `gemini-omni-flash` name), `gemini-2.5-computer-use-preview-10-2025`
  (UI automation), `deep-research-preview-04-2026` (research agent), and
  `antigravity-preview-05-2026` — confirmed via a targeted fetch to be "a
  general-purpose managed agent that autonomously plans, reasons, runs code, manages
  files, and browses the web inside a secure, isolated Linux sandbox," i.e. an agentic
  product with no standard `generateContent` per-token text pricing, not a chat model.
  None of these five are a general-purpose text/chat completion model with standard
  per-token text pricing, so none were added, consistent with the existing
  modality-specific/restricted-access skip rule. Re-investigate only if one of them
  gains a standard text-generation mode with its own per-token text pricing.
- **September 8 2026 audit: no price or catalog drift; `gemini-2.0-flash` shutdown
  status confirmed; another Gemini specialized-model wave confirmed out of scope** —
  Re-fetched the full Anthropic pricing table, the OpenAI aggregate Standard pricing
  table (all short- and long-context tiers for the gpt-5.x/gpt-6 families plus
  gpt-4.1/gpt-4o/o3/o4-mini), and both Gemini pricing pages
  (`ai.google.dev/pricing` for the 2.5 family, `ai.google.dev/gemini-api/docs/pricing`
  for the 3.x family) plus `ai.google.dev/gemini-api/docs/models`. Every price already
  in the file matched verbatim; no updates were needed. Two new pieces of
  information: (1) `ai.google.dev/gemini-api/docs/models` now explicitly labels
  `gemini-2.0-flash` "(Shut down)" under previous models — this resolves the
  long-standing "not re-verified, retained for backward compatibility" note on this
  entry into a confirmed-retired status. The pricing entry stays for historical
  cost lookups, and the selectable-model entries are removal candidates, same
  treatment as the `gemini-3-pro-preview` precedent above; (2) the models page now additionally lists
  `gemini-3.1-flash-image` ("Nano Banana 2"), `gemini-3.1-flash-lite-image` ("Nano
  Banana 2 Lite"), `gemini-3-pro-image` ("Nano Banana Pro"), `gemini-embedding-2-preview`,
  `gemini-embedding-001`, `gemini-2.5-flash-native-audio-preview-12-2025`,
  `gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts`,
  `deep-research-max-preview-04-2026`, and `gemini-robotics-er-1.6-preview` — image
  generation, embedding, native-audio, text-to-speech, and robotics endpoints, none a
  general-purpose text/chat model with standard per-token text pricing, so none were
  added, consistent with the existing modality-specific skip rule.
- **September 9 2026 audit: full re-fetch found no price or catalog drift; Gemma
  confirmed free-only; AWS Bedrock Amazon Nova confirmed a pre-existing, not
  newly released, coverage gap** — Re-fetched the full Anthropic pricing table
  (plus the models overview table), the OpenAI aggregate Standard/Fast-mode/Flex
  pricing tables, both Gemini pricing pages (`ai.google.dev/gemini-api/docs/pricing`
  for the 3.x family, `ai.google.dev/pricing` implicitly re-confirmed via the 2.5
  family rows), the Gemini models catalog page, and the AWS Bedrock pricing page.
  Every price already in the file — including all `gpt-6-astra` and `gemini-3.8-flash`
  tiers — matched verbatim; no updates were needed. Two clarifications: (1) a
  targeted fetch of the official pricing page confirms `Gemma 4` (and the Gemma
  family generally) is listed with "Input price: Free of charge | Output price:
  Free of charge" and "Paid Tier ... Not available" — it has no hosted per-token
  API pricing on Google's own page, so it is out of scope for a Langfuse default
  pricing entry (not merely unchecked); (2) AWS Bedrock's pricing page prominently
  lists **Amazon Nova** as a foundation-model family, but `types.ts` and the
  pricing file have never had a Nova entry — this is a pre-existing gap (Nova
  launched in Dec 2024, well before this audit's history), not a newly released
  model this run. Adding Nova would require its own model-ID/matchPattern and
  Bedrock usage-key research (Nova is not an Anthropic-format model, per the
  "Other Bedrock models" section below) and was left as a reportable gap rather
  than a surgical same-run addition. Also reconfirmed the AWS Bedrock "Claude 3.5
  Sonnet (Public Extended Access)" pricing is unchanged ($6.00/$30.00 input/output,
  $7.50/$0.60 cache write/read) — same documented, non-representable limitation
  as before. The Gemini models catalog also still lists the same image-generation
  (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`),
  audio/TTS/translate, robotics, and agent-product waves noted in the September 6
  and September 8 2026 entries above — no new modality-specific model needed
  re-investigation.
- **September 10 2026 audit: full re-fetch found no price or catalog drift;
  OpenAI Daybreak cybersecurity family confirmed to include more than
  `gpt-5.6-cyber`** — Re-fetched the full Anthropic pricing table plus the
  models-overview table, the OpenAI aggregate Standard/Fast-mode/Flex pricing
  tables plus the full model catalog (`developers.openai.com/api/docs/models/all`),
  and both Gemini pricing pages (`ai.google.dev/gemini-api/docs/pricing` for the
  3.x family, `ai.google.dev/pricing` for the 2.5 family) plus the Gemini models
  catalog page. Every price already in the file — including every `gpt-6-astra`,
  `gemini-3.8-flash`, `claude-fable-5-1`/`claude-mythos-5-1`, and `gpt-5.3-codex`
  tier — matched verbatim; no updates were needed. One clarification: the OpenAI
  model catalog groups `gpt-5.6-cyber` together with previously-unseen
  `gpt-5.5-cyber` and `gpt-5.4-cyber` under a "Cyber/Daybreak models" heading, and
  separately lists `gpt-oss-120b`/`gpt-oss-20b` as open-weight (self-hosted, no
  OpenAI-hosted per-token price) models. Per the existing `gpt-5.6-cyber` scope
  exclusion (gated Daybreak-program endpoint), `gpt-5.5-cyber` and `gpt-5.4-cyber`
  are the same class of restricted, specialized-use endpoint and were not added;
  no pricing was visible for either in this run's fetch, so there is nothing to
  add even if the scope exclusion were lifted. Treat the whole Daybreak cyber
  family (currently three members) as one standing scope exclusion rather than
  re-investigating each member separately in future audits.
- **Gemini Priority inference (verified September 14 2026)** — The
  [Priority guide](https://ai.google.dev/gemini-api/docs/priority-inference)
  documents `service_tier: "priority"` on the Interactions API. The
  [OpenAI-compatible API](https://ai.google.dev/gemini-api/docs/openai#flex-and-priority-inference)
  supports the same parameter. This is per-request Gemini Developer API
  processing, not a Vertex capacity reservation.
  Use the existing `model_parameters` condition on `service_tier`, with
  `operator: "in"` and `values: ["priority"]`. Do not include OpenAI's `fast`
  alias. For Pro models, evaluate Priority + >200K before plain Priority and
  standard Large Context (ascending priorities 1, 2, 3).
  Read the actual tier from the response's `x-gemini-service-tier` header:
  requests can be downgraded to Standard and billed at Standard rates. Record
  that actual value in Langfuse `modelParameters.service_tier`; the catalog
  matcher cannot read HTTP headers. Generic OTEL `gen_ai.request.service_tier`
  captures only the requested tier, and native Gemini response-header capture
  is not automatic. Missing tier data falls back to ordinary context pricing.
  The [paid pricing tables](https://ai.google.dev/gemini-api/docs/pricing)
  supply the following Priority USD/MTok rates (input / output / cache read):

  | Model | Input | Output, including thinking | Cache read |
  | --- | --- | --- | --- |
  | gemini-3.6-flash / 3.7-flash / 3.8-flash | 1.35 | 6.75 | 0.135 |
  | gemini-3.5-flash | 2.70 | 16.20 | 0.27 |
  | gemini-3.5-flash-lite | 0.54 | 4.50 | 0.05 |
  | gemini-3.1-flash-lite | 0.45 | 2.70 | 0.045 |
  | gemini-3-flash-preview | 0.90 | 5.40 | 0.09 |
  | gemini-3.1-pro-preview, <=200K / >200K | 3.60 / 7.20 | 21.60 / 32.40 | 0.36 / 0.72 |
  | gemini-2.5-pro, <=200K / >200K | 2.25 / 4.50 | 18 / 27 | 0.225 / 0.45 |
  | gemini-2.5-flash | 0.54 | 4.50 | 0.054 |
  | gemini-2.5-flash-lite | 0.18 | 0.72 | 0.018 |

  Preserve all existing input, cache-read (including `input_cache_read`), output,
  and reasoning aliases in each new tier. Existing audio-input keys use
  $0.90/MTok for 3.1 Flash-Lite, $1.80 for 2.5 Flash, and $0.54 for 2.5 Flash-Lite.
  Keep existing grounding rates unchanged. Do not infer a universal multiplier:
  3.5 Flash-Lite explicitly lists a $0.05 cache rate. The 3.6/3.7/3.8 Flash rates
  are introductory through December 31, 2026; recheck their January 1 increase.
  These are Developer API rates; do not infer Vertex regional or reserved-capacity
  pricing from them. Retired previews, media models, Flex, cache storage, and new
  modality buckets require separate evidence and are outside this change.
- **September 15 2026 audit: full re-fetch found no price or catalog drift;
  "GPT-Rosalind" found and confirmed out of scope** — Re-fetched the Anthropic
  pricing page, the Anthropic models-overview table, the OpenAI aggregate
  Standard/Fast-mode/Flex pricing tables, the full OpenAI model catalog
  (`developers.openai.com/api/docs/models/all`), both Gemini pricing pages
  (`ai.google.dev/gemini-api/docs/pricing` for the 3.x family,
  implicitly re-confirmed for the 2.5 family), and the Gemini models catalog
  page. Every price already in the file — including every `gpt-6-astra`,
  `gemini-3.6/3.7/3.8-flash`, and `claude-fable-5-1`/`claude-mythos-5-1` tier —
  matched verbatim; no updates were needed. The Anthropic models-overview table
  lists no model beyond the existing lineup. One new finding: the OpenAI model
  catalog now lists **"GPT-Rosalind"** under a "Life sciences" heading,
  described only as "Life sciences reasoning for approved organizations." A
  dedicated model-page fetch (`developers.openai.com/api/docs/models/gpt-rosalind`)
  404s, and the catalog page shows no model ID/slug or per-token price for it,
  only a pointer to the pricing page. This is the same class of restricted,
  approved-organizations-only specialized endpoint as the Daybreak cyber family
  (`gpt-5.6-cyber`/`gpt-5.5-cyber`/`gpt-5.4-cyber`) — not added to the pricing
  file or `types.ts` per the existing restricted-access skip rule, and there is
  no confirmed model ID or price to add even if the scope exclusion were
  lifted. Re-investigate only if OpenAI publishes a public model ID and
  per-token price for it.
- **September 17 2026 audit: full re-fetch found no price or catalog drift;
  GPT-Rosalind and the Daybreak cyber family now show prices in the aggregate
  table but remain unconfirmed and restricted** — Re-fetched the Anthropic
  pricing page, the Anthropic models-overview table, the OpenAI aggregate
  Standard/Fast-mode/Flex/Batch pricing tables, the full OpenAI model catalog,
  and the Gemini pricing and models catalog pages. Every price already in the
  file — including every `gpt-6-astra`, `gemini-3.6/3.7/3.8-flash`, and
  `claude-fable-5-1`/`claude-mythos-5-1` tier, plus a re-confirmation of
  `gpt-5-chat-latest` via its dedicated model page ($1.25/$0.125/$10, no
  large-context tier) — matched verbatim; no updates were needed. Two
  refinements to prior restricted-access findings: (1) the OpenAI aggregate
  pricing table's "Life Sciences" section now lists a price for
  **`gpt-rosalind-research`** ($5/MTok input, $0.50/MTok cached input, $25/MTok
  output, no cache-write column), a more specific slug than the bare
  "GPT-Rosalind" name seen in the September 15 2026 catalog entry — but a
  dedicated fetch of `developers.openai.com/api/docs/models/gpt-rosalind-research`
  still 404s, and the model catalog still describes it as "approved
  organizations only." Treat this price as unconfirmed (no dedicated official
  page corroborates the slug or the number) and the model as still out of
  scope under the existing restricted-access skip rule; (2) the aggregate
  table's "Cyber Models" section now also shows a price for **`gpt-5.5-cyber`**
  ($12.50/MTok input, $1.25/MTok cached input, $75/MTok output, no cache-write
  column shown, standard tier only) — same restricted Daybreak-program class as
  `gpt-5.6-cyber`, still not added. `gpt-5.4-cyber` (the third Daybreak cyber
  sibling) still shows no price in this run's fetch. Re-investigate the whole
  Daybreak/Rosalind restricted family only if OpenAI publishes public,
  unauthenticated documentation confirming a model ID and price on its own
  dedicated page.
- **Claude Opus 5.5 (added September 22 2026)** — Anthropic released
  `claude-opus-5-5`, now the recommended default on the models-overview
  comparison table ("For long-running agentic coding and knowledge work"),
  confirmed via `https://platform.claude.com/docs/en/about-claude/pricing` and
  `https://platform.claude.com/docs/en/models/overview`. API ID / alias /
  Bedrock ID / Google Cloud ID / Microsoft Foundry ID / Claude Platform on AWS
  ID are all the dateless `claude-opus-5-5` / `anthropic.claude-opus-5-5`
  pattern (mirroring `claude-opus-5`, one more `-5` segment). Pricing: $4/MTok
  input, $20/MTok output, 5m cache write $5/MTok, 1h cache write $8/MTok — all
  half of Claude Opus 5's rate. **Cache hits are priced at 0.05x base input
  ($0.20/MTok), not the standard 0.1x multiplier** — confirmed verbatim via
  the pricing page's cache-hits footnote, which now lists three non-standard
  multipliers side by side: 0.025x for Fable 5.1/Mythos 5.1, 0.05x for Opus
  5.5, 0.1x for every other model. Fast mode is available at $8/$40 input/output
  (`speed: "fast"`, same mechanism as Opus 5/4.8); the page's Fast-mode table
  only lists Input/Output, so — consistent with how the existing
  `claude-opus-5`/`claude-opus-4-8` Fast-mode tiers were derived — the Fast-mode
  cache read/write prices were computed by applying the documented cache
  multipliers (0.05x read, 1.25x 5m write, 2x 1h write) to the *Fast-mode* base
  input price, not the Standard base input price: $0.40/MTok read, $10/MTok 5m
  write, $16/MTok 1h write. On the flat 1M-context list (no Large Context
  tier). Batch is $2/$10 (50% of standard, per the page's Batch table) but, per
  existing precedent, no Batch tier was added to the pricing file since no
  Anthropic model has ever had one represented (Batch is a distinct API
  endpoint, not a `model_parameters` condition observable in ordinary
  ingestion usage). matchPattern:
  `(?i)^((anthropic\/)?claude-opus-5-5|(eu\.|us\.|apac\.|au\.|jp\.|global\.)?anthropic\.claude-opus-5-5(-v1(:0)?)?)$`
  — verified this does not collide with `claude-opus-5`'s pattern since both
  are fully anchored with `^...$`.
- **GPT-6 Sol / GPT-6 Luna (added September 22 2026)** — OpenAI expanded the
  GPT-6 family beyond `gpt-6-astra` with two more flagship-tier models,
  confirmed via `https://developers.openai.com/api/docs/pricing` (aggregate
  Standard/Batch/Flex/Fast-mode tables) and their dedicated model pages
  `https://developers.openai.com/api/docs/models/gpt-6-sol` and `.../gpt-6-luna`.
  Both share `gpt-6-astra`'s exact shape: 1,050,000-token context window (max
  input 922,000, max output 128,000), prompt caching and reasoning tokens
  supported, and the same >272,000-input-token Large Context threshold at 2x
  input/cache and 1.5x output. `gpt-6-sol` ("complex coding and agentic
  workflows"): standard $2/$0.20/$2.50/$10 input/cached/cache-write/output;
  large context $4/$0.40/$5.00/$15; Fast mode is 2x the applicable tier
  ($4/$0.40/$5.00/$20 standard, $8/$0.80/$10.00/$30 large context — confirmed
  against the aggregate table's Fast-mode row); Flex is 0.5x the applicable
  tier ($1.00/$0.10/$1.25/$5.00 standard, $2.00/$0.20/$2.50/$7.50 large
  context — confirmed against the aggregate table's Flex row, which is
  numerically identical to the Batch row at this multiplier, consistent with
  the `gpt-6-astra`/`gpt-5.6-sol` precedent). `gpt-6-luna` ("most efficient
  model for focused, high-volume tasks"): standard $0.10/$0.01/$0.125/$0.50;
  large context $0.20/$0.02/$0.25/$0.75; Fast mode $0.20/$0.02/$0.25/$1.00
  standard, $0.40/$0.04/$0.50/$1.50 large context; Flex $0.05/$0.005/$0.0625/$0.25
  standard, $0.10/$0.01/$0.125/$0.375 large context. Both added to the pricing
  file mirroring `gpt-6-astra`'s exact six-tier key set (Standard, Fast mode ·
  Large context, Flex · Large context, Fast mode, Flex, Large Context) and to
  `openAIModels` in `types.ts` (immediately after `gpt-6-astra`, not as the
  first entry). matchPatterns: `(?i)^(openai/)?(gpt-6-sol)$` and
  `(?i)^(openai/)?(gpt-6-luna)$`. Batch pricing intentionally not added, per
  the same `gpt-6-astra`-precedent scope boundary (Batch is a distinct async
  endpoint, not an ordinary `service_tier` value Langfuse observes in
  synchronous request usage).
- **September 22 2026 audit: full re-fetch found Claude Opus 5.5 and GPT-6
  Sol/Luna as the only drift; everything else confirmed unchanged** —
  Re-fetched the full Anthropic pricing page (all sections, not just the
  model table), the Anthropic models-overview comparison table, the OpenAI
  aggregate Standard/Batch/Flex/Fast-mode pricing tables plus the full model
  catalog, and both Gemini pricing pages (3.x family and 2.5 family) plus the
  Gemini models catalog, with a follow-up verbatim-quote fetch that confirmed
  full input/output/cache pricing for `gemini-3.5-flash-lite`,
  `gemini-3.1-flash-lite`, `gemini-3.1-pro-preview`, and
  `gemini-3-flash-preview` (all unchanged). No further new general-purpose
  text/chat models were found: the Gemini models catalog's new entries this
  run (`gemini-3.8-live`, `gemini-3.8-live-extended-thinking`,
  `gemini-omni-1.1-flash`, `lyria-3.5`, more `gemini-robotics-er-2-preview`
  variants) are all Live/voice, video, music, or robotics endpoints, consistent
  with the existing modality-specific skip rule. `gpt-5.3-codex` and
  `gpt-5-chat-latest` were not independently re-fetched this run (no drift
  signal for either); their prices are carried forward from the September 2
  and September 17 2026 confirmations respectively. The Daybreak
  cyber/Rosalind restricted family and the AWS Bedrock Public Extended Access
  SKU were not re-checked this run — no new evidence, standing exclusions.
- **September 28 2026 audit: full re-fetch found no price or catalog drift;
  resolved a standing Flex-pricing verification gap** — Re-fetched the full
  Anthropic pricing page (model table, cache-hit footnote, Fast mode and Batch
  tables), the Anthropic models-overview comparison table, the OpenAI
  aggregate Standard/Long-Context/Fast-mode/Flex pricing tables, the full
  OpenAI model catalog, both Gemini pricing pages (3.x and 2.5 families), the
  Gemini models catalog, and the TypeSafe Jev models page. Every price already
  in the file — including every `gpt-6-astra`/`gpt-6-sol`/`gpt-6-luna`,
  `claude-opus-5-5`, and `gemini-3.6/3.7/3.8-flash` tier — matched verbatim; no
  updates were needed. This run's Flex-table fetch explicitly re-quoted
  `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.2`, `gpt-5.1`, `gpt-5`, `gpt-5-mini`,
  `gpt-5-nano`, `o3`, and `o4-mini`, which the August 20 2026 audit entry above
  had flagged as "prices seen but not individually re-quoted during the audit"
  — all nine matched the pricing file exactly (verified with `jq` against the
  live JSON), so that caveat is now resolved for these models. `gpt-5.3-codex`
  and `gpt-5-chat-latest` were not independently re-fetched this run (no drift
  signal); their prices carry forward from the September 2 and September 17
  2026 confirmations. The Daybreak cyber/Rosalind restricted family, the AWS
  Bedrock Public Extended Access SKU, and the legacy Claude 3.x/Gemini 1.x
  catalog tail were not re-checked this run — no new evidence, standing
  exclusions.
- **GPT-6.1 Sol (added September 30 2026)** — OpenAI released `gpt-6.1-sol` as
  a distinct sibling alongside the existing `gpt-6-sol` (both remain active,
  separately priced model IDs — the model's own dedicated page directs users
  from the old page to the new one, but the old `gpt-6-sol` page and pricing
  row are still live). Confirmed via
  `https://developers.openai.com/api/docs/pricing` (Standard, Long-Context,
  Fast mode, and Flex tables, each independently re-quoted for this specific
  model ID) and `https://developers.openai.com/api/docs/models/gpt-6.1-sol`
  ("delivers near-Astra performance at a lower cost for complex coding,
  computer use, and professional work"). Same 1,050,000-token context window
  (max input 922,000, max output 128,000) and the same >272,000-input-token
  Large Context threshold as the rest of the GPT-6 family. Pricing is
  identical to `gpt-6-sol` for input ($2/MTok), cache write ($2.50/MTok), and
  output ($10/MTok) — but **cached input is $0.10/MTok, half of `gpt-6-sol`'s
  $0.20/MTok** (confirmed via three independent quotes of the Standard table
  row: `gpt-6.1-sol | $2.00 | $0.10 | $2.50 | $10.00`). Large Context
  (2x input/cache, 1.5x output): $4/$0.20/$5.00/$15. Fast mode
  (`service_tier` in `["fast","priority"]`, 2x applicable tier): $4/$0.20/$5.00/$20
  standard, $8/$0.40/$10.00/$30 large context (the large-context Fast row was
  directly quoted from the aggregate table, not just derived from the
  multiplier). Flex (`service_tier: "flex"`, 0.5x applicable tier):
  $1.00/$0.05/$1.25/$5.00 standard; no separate Flex-Large-Context row is
  published for this model (same gap as every other GPT-6-family member), so
  the Flex·Large-Context tier ($2/$0.10/$2.50/$7.50) was derived by applying
  the documented 0.5x multiplier to the Large Context tier, following the
  `gpt-6-sol`/`gpt-6-astra` precedent. No date-stamped snapshot at launch.
  Added to the pricing file mirroring `gpt-6-sol`'s exact six-tier key set and
  to `openAIModels` in `types.ts` immediately after `gpt-6-sol` (not as the
  first entry). matchPattern: `(?i)^(openai/)?(gpt-6.1-sol)$` — verified via
  the bundled match-pattern tester that it does not collide with `gpt-6-sol`,
  `gpt-6-luna`, or `gpt-6-astra` (all fully anchored with `^...$`; the
  unescaped `.` follows this file's existing convention for other dotted
  version numbers such as `gpt-5.6-sol` and `gemini-3.7-flash`, which likewise
  do not escape the literal dot).
- **September 29 2026 audit: Claude Sonnet 5.5 added, released the day before
  this run; everything else confirmed unchanged** — Re-fetched the full
  Anthropic pricing page (model table, cache-hits footnote, Fast mode and
  Batch tables), the Anthropic models-overview comparison table, the dedicated
  `claude-sonnet-5-5` model page, the OpenAI aggregate Standard/Fast-mode/Flex
  pricing summary, the full OpenAI model catalog, the dedicated
  `gpt-5-chat-latest` model page ($1.25/$0.125/$10, 128K context, no
  large-context tier — unchanged), both Gemini pricing pages (3.x and 2.5
  families, explicit Free/Paid column separation), and the Gemini models
  catalog. Every price already in the file — including every
  `gpt-6-astra`/`gpt-6-sol`/`gpt-6-luna`, `claude-opus-5-5`, and
  `gemini-3.6/3.7/3.8-flash` tier — matched verbatim; the only drift was the
  new Sonnet 5.5 model (see its own dedicated entry above). No further new
  general-purpose text/chat models were found: the Gemini models catalog's new
  entries this run (`gemini-3.8-live-extended-thinking`, another
  `gemini-omni-1.1-flash`/`lyria-3.5` mention, more robotics variants) are all
  Live/voice, video, or robotics endpoints, consistent with the existing
  modality-specific skip rule. The Daybreak cyber/Rosalind restricted family,
  the AWS Bedrock Public Extended Access SKU, and the legacy Claude
  3.x/Gemini 1.x catalog tail were not re-checked this run — no new evidence,
  standing exclusions.
- **Claude Haiku 5.5 (added October 7 2026)** — Anthropic released
  `claude-haiku-5-5`, confirmed via
  `https://platform.claude.com/docs/en/about-claude/pricing` and
  `https://platform.claude.com/docs/en/models/overview`. API ID / alias /
  Bedrock ID / Google Cloud ID / Microsoft Foundry ID / Claude Platform on AWS
  ID are all the dateless `claude-haiku-5-5` / `anthropic.claude-haiku-5-5`
  pattern. **Unlike every other Claude 4.6-or-later model, Haiku 5.5 is NOT on
  the flat 1M-context list** — the pricing page states explicitly: "Claude 4.6
  and later models (except Claude Haiku 5.5) ... include the full 1M token
  context window at standard pricing" and "Claude Haiku 5.5 is priced by
  prompt length: a prompt of over 100,000 tokens pays higher prices." It still
  has a 1M-token context window (per the models-overview comparison table),
  but the *price* steps up once the prompt exceeds 100,000 tokens — a materially
  lower threshold than the 200K/272K thresholds used elsewhere in the catalog.
  Standard tier (prompt <= 100,000 tokens): $0.10/MTok input, $0.125/MTok 5m
  cache write, $0.20/MTok 1h cache write, $0.01/MTok cache read (standard
  0.1x), $0.50/MTok output. Large Context tier (prompt > 100,000 tokens): all
  five rates exactly 5x the Standard tier ($0.50/$0.625/$1.00/$0.05/$2.50).
  Modeled as a `usageDetailPattern: "(input|prompt|cached)"`, `gt`, `100000`
  tier, mirroring the Gemini large-context tier mechanism rather than the
  service_tier/speed `model_parameters` mechanism. **No Fast mode**: the
  Fast-mode table lists only Opus 5.5/5/4.8. Batch is $0.05/$0.25 (<=100K) and
  $0.25/$1.25 (>100K) MTok input/output (50% of standard) but, per existing
  precedent, no Batch tier was added (no Anthropic model in this file has
  one). Added to the pricing file and to `anthropicModels` in `types.ts`
  immediately after `claude-haiku-4-5-20251001`'s sibling block (after
  `claude-opus-5-5`, not as the first entry). matchPattern:
  `(?i)^((anthropic\/)?claude-haiku-5-5|(eu\.|us\.|apac\.|au\.|jp\.|global\.)?anthropic\.claude-haiku-5-5(-v1(:0)?)?)$`
  — verified via the bundled match-pattern tester that it does not collide
  with `claude-haiku-4-5-20251001` or the Sonnet/Opus 5.5 siblings (all fully
  anchored with `^...$`).
- **October 7 2026 audit: Gemini selectable-model lifecycle cleanup; no price
  drift found** — Re-fetched the full Anthropic pricing page plus the
  models-overview comparison table (found Claude Haiku 5.5, see above; every
  other Anthropic price — including `claude-opus-4-1-20250805` and
  `claude-opus-4-20250514`, both still shown on the main pricing table despite
  being "retired, except on Bedrock/Google Cloud" — matched verbatim), the
  OpenAI aggregate Standard/Long-Context/Fast-mode/Flex pricing tables (every
  price already in the file, from `gpt-6-astra` down through `babbage-002`,
  matched verbatim; no new flagship model found), the Gemini 3.x pricing page
  (`gemini-3.8/3.7/3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`,
  `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview`
  all matched verbatim), and the Gemini models catalog plus deprecations page.
  The catalog and deprecations page together **confirm three already-suspected
  selectable-model removals and surface one more**: `gemini-3.1-flash-lite-preview`
  and `gemini-3-pro-preview` are explicitly labeled "(Shut down)" on
  `ai.google.dev/gemini-api/docs/models`; `gemini-2.0-flash` is labeled "(Shut
  down)" there and its deprecations-page shutdown date (June 1, 2026) has
  passed; `gemini-2.5-flash-lite-preview-09-2025` is not on the models page at
  all and its deprecations-page shutdown date (March 31, 2026) has also
  passed. All four were removed from `googleAIStudioModels` (already absent
  from `vertexAIModels` since the October manual cleanup referenced above).
  Their pricing entries stay in the file for historical cost lookups.
  `gemini-2.0-flash-thinking-exp-01-21`, `gemini-1.5-pro`, `gemini-1.5-flash`,
  and `gemini-1.5-flash-8b` are still not mentioned on either the models
  catalog or the deprecations page at all (neither "available" nor "shut
  down") — per the removal criteria this is still ambiguous, not a confirmed
  shutdown, so they were left in `googleAIStudioModels` unchanged; this
  remains an open, standing gap, not a new finding. A targeted re-fetch of
  `gemini-3.5-flash-lite`'s cache-read price on `ai.google.dev/gemini-api/docs/pricing`
  returned a bare "Not available" without the page's usual explicit Free/Paid
  column separation — the same column-collapse failure mode documented in the
  July/August 2026 entries above. Per that standing lesson, this single
  ambiguous result was not treated as evidence of a change; the file's
  existing $0.03/MTok cache-read price (confirmed via an explicit
  Free/Paid-separated fetch in a prior audit) was left unchanged.
  `gpt-5.3-codex`, `gpt-5-chat-latest`, and the full Gemini 2.5-family pricing
  page (`ai.google.dev/pricing`) were not independently re-fetched this run;
  AWS Bedrock and TypeSafe Jev were not re-checked either — no drift signal
  for any of them, prices carry forward from their last confirmed audit.
- **October 9 2026 audit: no price or catalog drift; a large OpenAI retirement
  batch scheduled for October 23, 2026 found (not yet actionable); Gemini
  2.5-family access-restriction note found (not a shutdown)** — Re-fetched the
  full Anthropic pricing page (model table, cache-hits footnote, Fast mode and
  Batch tables) and the Anthropic models-overview comparison table (no model
  beyond the existing lineup; retirement commitments for Fable 5.1/Opus
  5.5/Sonnet 5.5/Haiku 5.5 are all "not sooner than" one year after each
  model's launch), the OpenAI aggregate Standard pricing table, the full
  OpenAI model catalog, `https://developers.openai.com/api/docs/deprecations`,
  both Gemini pricing pages (`ai.google.dev/gemini-api/docs/pricing` for the
  3.x family, `ai.google.dev/pricing` for the 2.5 family), the Gemini models
  catalog, `ai.google.dev/gemini-api/docs/deprecations`, the AWS Bedrock
  pricing page, and the TypeSafe Jev models page. Every price already in the
  file — including every `gpt-6-astra`/`gpt-6-sol`/`gpt-6.1-sol`/`gpt-6-luna`,
  every `gpt-5.6`/`gpt-5.5`/`gpt-5.4` tier, `claude-opus-5-5`,
  `claude-haiku-5-5`, and `gemini-3.6/3.7/3.8-flash`'s introductory rate —
  matched verbatim; no updates were needed. Two findings:
  1. **OpenAI's deprecations page lists a 10-model "Legacy GPT model
     snapshots" retirement batch with shutdown date October 23, 2026**
     (announced 2026-04-22, confirmed via two independent verbatim-quote
     fetches of `developers.openai.com/api/docs/deprecations`):
     `gpt-3.5-turbo-0125` (alias `gpt-3.5-turbo`) → `gpt-5.6-terra`,
     `gpt-4-0613` (aliases `gpt-4`, `gpt-4-0613-completions`,
     `gpt-4-completions`) → `gpt-5.6-sol`, `gpt-4-1106-preview` →
     `gpt-5.6-sol`, `gpt-4-turbo` (alias `gpt-4-turbo-2024-04-09`) →
     `gpt-5.6-sol`, `gpt-4.1-nano` (alias `gpt-4.1-nano-2025-04-14`) →
     `gpt-5.6-luna`, `gpt-4o-2024-05-13` → `gpt-5.6-sol`, `o1` (alias
     `o1-2024-12-17`) → `gpt-5.6-sol`, `o1-pro` (alias `o1-pro-2025-03-19`) →
     `gpt-5.6-sol` (`reasoning.mode: pro`), `o3-mini` (alias
     `o3-mini-2025-01-31`) → `gpt-5.6-sol`, `o4-mini` (alias
     `o4-mini-2025-04-16`) → `gpt-5.6-terra`. **October 23, 2026 is still 14
     days after this audit's date (October 9, 2026) — the retirement date has
     not passed yet**, so per the removal criteria in `automated-audit.md`
     none of these were removed from `openAIModels` this run (it currently
     lists `gpt-4.1-nano`/`gpt-4.1-nano-2025-04-14`, `gpt-4-0613`,
     `gpt-4-1106-preview`, `gpt-3.5-turbo`/`gpt-3.5-turbo-0125`,
     `o3-mini`/`o3-mini-2025-01-31`, `o4-mini`/`o4-mini-2025-04-16`; it does
     not list bare `gpt-4-turbo`, `o1`/`o1-2024-12-17`, or
     `o1-pro`/`o1-pro-2025-03-19`, so those three have no selectable-array
     action regardless). **Re-check this exact page on or after October 23,
     2026 and remove the still-listed IDs from `openAIModels` once the page
     confirms the shutdown date has passed** (keep their pricing entries).
     Lesson for future audits: a first, generically-worded WebFetch of this
     page summarized the batch as "Past Shutdowns (Already Occurred)" even
     though the quoted date (October 23, 2026) was still in the future
     relative to the audit date — the summarizer anchored on the page's own
     "announced" date (2026-04-22) rather than today's date. A second fetch
     that explicitly asked for the literal shutdown-date string and explicitly
     asked whether the page states its own current/last-updated date (it does
     not) corrected this. Always sanity-check a deprecation-page date against
     the audit's own run date before treating a listed shutdown as already
     effective, the same way the existing Gemini free/paid column-collapse
     lesson requires a verbatim re-quote before trusting a summarized result.
  2. **Gemini 2.5 Pro / Flash / Flash-Lite show a new access-restriction
     notice, not a deprecation** — Both `ai.google.dev/pricing` and
     `ai.google.dev/gemini-api/docs/deprecations` now state: "To ensure
     reliable performance for everyone, we are limiting access to the 2.5
     models to users who have actively used them in the past." No shutdown
     date is given for the three GA 2.5 models themselves (their own preview
     snapshots, e.g. `gemini-2.5-flash-preview-09-25` and
     `gemini-2.5-flash-lite-preview-09-2025`, already have separate confirmed
     past shutdown dates, unaffected by this note). This restricts *new*
     callers rather than shutting the model down for existing users, so it
     meets none of the removal criteria in `automated-audit.md` (not shut
     down, no retirement date, not a preview superseded in-array, still
     callable through the text-generation endpoint for existing callers) —
     `gemini-2.5-pro`/`gemini-2.5-flash`/`gemini-2.5-flash-lite` were left in
     `vertexAIModels`/`googleAIStudioModels` unchanged. Pricing for all three
     also matched verbatim this run. Re-investigate only if a future fetch
     shows an actual shutdown date for the GA (non-preview) 2.5 models.
     `gemini-2.0-flash-lite` is independently confirmed "(Shut down)" on the
     models catalog and June 1, 2026 on the deprecations page, but it was
     already absent from both selectable arrays before this run (no action
     needed). The Vertex AI lifecycle page
     (`cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions`)
     still 301-redirects to a `docs.cloud.google.com` host outside the allowed
     WebFetch domain list — not fetched, consistent with the standing quirk
     documented above; `vertexAIModels` was not re-verified against it this
     run. The Daybreak cyber/Rosalind restricted family (this run's catalog
     fetch again showed only `gpt-5.6-cyber` and `gpt-rosalind-research`, not
     `gpt-5.5-cyber`/`gpt-5.4-cyber` — groupings of this restricted family
     continue to vary by fetch) and the AWS Bedrock Public Extended Access SKU
     were re-confirmed unchanged but remain standing, out-of-scope exclusions.
- **October 10 2026 audit: 13 long-retired Claude models removed from
  `anthropicModels`; no price drift; one ambiguous Gemini Flash disappearance
  found; one OpenAI deprecations-page date confirmed NOT yet passed** —
  Re-fetched the full Anthropic pricing page (model table, cache-hits
  footnote, Fast mode and Batch tables — every price for every currently
  active model matched verbatim, no updates needed), the Anthropic
  models-overview comparison table, and — for the first time with an explicit
  ask for the page's own "Model status" summary table — the full
  `model-deprecations` page. That table has a `Current state` column
  (`Active` / `Legacy` / `Deprecated` / `Retired`) that resolves several
  long-standing "not re-verified, low priority" notes from prior audits
  (see finding #1 and #3 in `model-audit-memory.md`'s prior unresolved list):
  `claude-opus-4-1-20250805` (retired Aug 5 2026), `claude-opus-4-20250514`
  (retired Jun 15 2026), `claude-sonnet-4-20250514` (retired Jun 15 2026),
  `claude-3-7-sonnet-20250219` (retired Feb 19 2026), `claude-3-5-haiku-20241022`
  (retired Feb 19 2026), and `claude-3-haiku-20240307` (retired Apr 20 2026)
  are all explicitly `Retired` with passed dates; the page's "Deprecation
  history" section additionally confirms `claude-3-5-sonnet-20241022` /
  `claude-3-5-sonnet-20240620` (retired Oct 28 2025), `claude-3-opus-20240229`
  (retired Jan 5 2026), `claude-3-sonnet-20240229` (retired Jul 21 2025),
  `claude-2.1` / `claude-2.0` (retired Jul 21 2025), and `claude-instant-1.2`
  (retired Nov 6 2024). The main pricing page's own model table now also
  labels `claude-opus-4-1`/`claude-opus-4`/`claude-sonnet-4`/`claude-3-5-haiku`
  "(retired, except on Bedrock and Google Cloud)" or "(... except on Google
  Cloud)" directly in the row — the first time that exception wording was
  read together with the deprecations page's firm dates in the same run.
  That Bedrock/Google-Cloud exception does **not** save these IDs in
  `anthropicModels`: that array feeds only `LLMAdapter.Anthropic`, whose
  connection defaults to `https://api.anthropic.com` with no Bedrock/Vertex
  routing (`packages/shared/src/server/llm/types.ts`'s `supportedModels` map
  gives `LLMAdapter.Bedrock` an empty array and `LLMAdapter.VertexAI` its own
  distinct `vertexAIModels` array) — confirmed by reading
  `buildAnthropicModel` in `packages/shared/src/server/llm/ai-sdk/providers/anthropic.ts`
  and the Anthropic connection form in
  `web/src/features/public-api/components/CreateLLMApiKeyForm.tsx`, which
  exposes a user-settable "API Base URL" but defaults to Anthropic's own host
  with no model-ID validation. A user who manually repoints that base URL at
  a Bedrock/Vertex-fronting proxy is an edge case the removal criteria does
  not need to accommodate, the same way other removed entries elsewhere in
  this file are not kept alive for hypothetical custom gateways. All 13 IDs
  were removed from `anthropicModels` (pricing entries kept, per the
  never-remove-pricing rule); `claude-sonnet-4-5-20250929` was **not**
  removed — the deprecations page's history section now shows it
  `Deprecated` (Sep 30 2026) with retirement **November 30, 2026**, which has
  not passed yet, so it stays until that date (re-check and remove then).
  Lesson for future audits: a dedicated ask for the deprecations page's own
  "Model status" summary table (not just scanning "Deprecation history"
  prose) surfaces `Current state`/dated retirement for every model at once —
  prefer that table over only reading the narrative history blocks.
  Separately: a targeted fetch of `developers.openai.com/api/docs/deprecations`
  asked to compute whether the already-known "Legacy GPT model snapshots"
  batch's **October 23, 2026** shutdown date had passed relative to today
  (October 10, 2026) incorrectly answered "already passed by approximately 13
  days" — October 23 is 13 days **after** October 10, not before. A follow-up
  fetch that asked only for a verbatim quote (no date computation) returned
  the correct raw text. **Lesson: never trust a WebFetch summary's own
  date-comparison claim; extract the raw date string and compare it to the
  audit's run date independently (mental math or `date -d` are sufficient —
  no need for a script) before treating a deprecation as effective.** No
  `openAIModels` removal was made this run — October 23, 2026 is still in the
  future. Also found via the same verbatim-quote fetch: a **second OpenAI
  deprecation batch dated April 1, 2027** retiring `gpt-5.3-codex` (→
  `gpt-6-sol`), `gpt-5.1` (→ `gpt-6-sol`), and `gpt-5.4-nano` (→ `gpt-6-luna`)
  — confirmed real text on the page, but 15+ months away; not actionable yet,
  re-check as that date approaches. One finding left unresolved rather than
  acted on: two independent targeted fetches (the Gemini 3.x pricing page and
  the Gemini models catalog, each asked specifically and only about these two
  model names) both reported **`gemini-3.7-flash` and `gemini-3.5-flash`
  (non-Lite) entirely absent** — no price row, no catalog entry, and no
  shutdown/deprecation label on either page or on
  `ai.google.dev/gemini-api/docs/deprecations` (which was also checked this
  run and says nothing about either ID). This does not cleanly meet any of
  the three removal criteria in `automated-audit.md` (no explicit shutdown
  label; neither is a preview/experimental/dated-snapshot ID; no evidence
  about endpoint callability either way) — both were left in `vertexAIModels`
  and `googleAIStudioModels` unchanged, pending a future audit's dedicated
  re-check (e.g. a fetch of Google's release-notes/changelog for an explicit
  retirement announcement, since `gemini-3.8-flash` is already in both arrays
  as a plausible successor if one is ever confirmed). AWS Bedrock (Claude 3.5
  Sonnet Public Extended Access, unchanged) and TypeSafe Jev ($42/Btok,
  unchanged) were also re-confirmed this run.

Capture:

1. Base input token price per million tokens
2. Output token price per million tokens
3. Cache write price when supported
4. Cache read price when supported
5. Any long-context or conditional pricing
6. All model ID variants that Langfuse should match

## Price Conversion

Values in `default-model-prices.json` are per token, not per million tokens.

Always write per-token prices as `<USD per MTok>e-6`, so the mantissa reads
directly as the provider's per-million-token price. Keep the `e-6` exponent even
for sub-dollar and sub-cent prices; never normalize to `1e-7`, `5e-8`, `1.5e-5`,
or plain decimals like `0.000001`. `0` is fine for free usage types. The only
exception is non-token usage (Gemini `grounding_queries` / `web_search_queries`
per-query prices, written as `14e-3` for $14 per 1K queries). The validator
enforces this on changed and selected entries; older entries may still use other
notation and are rewritten only when that entry changes for another reason.

| Provider Price  | JSON Value | Not         |
| --------------- | ---------- | ----------- |
| `$5 / MTok`     | `5e-6`     |             |
| `$25 / MTok`    | `25e-6`    | `2.5e-5`    |
| `$0.50 / MTok`  | `0.5e-6`   | `5e-7`      |
| `$0.10 / MTok`  | `0.1e-6`   | `1e-7`      |
| `$0.05 / MTok`  | `0.05e-6`  | `5e-8`      |
| `$6.25 / MTok`  | `6.25e-6`  | `0.00000625` |

Formula:

```text
price_per_token = price_per_mtok / 1_000_000
json_literal    = "<price_per_mtok>e-6"
```

- **TypeSafe Jev pricing (documented September 24 2026)** — `jev` is
  TypeSafe's decision model, not an LLM from the other covered providers. Its
  official price table is `https://docs.typesafe.ai/models` ("Price (per Btok /
  per Mtok) $42 / $0.042"; "Charged per input token. Output tokens are free."),
  and the `https://typesafe.ai/` homepage repeats "$42 Per Billion input
  tokens". Convert per billion tokens: `$42 / 1_000_000_000 = 4.2e-8` for
  `input`, with `output` at `0`. The entry keeps a single Standard tier: the
  models page documents no cache, batch, context-size, or modality tiers.
  Jev's usage object has only `input_tokens` and `output_tokens`, which
  Langfuse stores as `input` and `output`. Verify against TypeSafe's own docs
  only; Vercel AI Gateway and OpenRouter can proxy Jev (`TYPESAFE_UPSTREAMS`
  in `types.ts`), but their resale prices are not official evidence. Versioned
  IDs (`jev-1.13.0`) and the `jev-latest`/`jev-preview` aliases listed on the
  models page are already covered by the `matchPattern`. `typeSafeModels` in
  `types.ts` is not one of the selectable arrays the audit may edit; report a
  newly released Jev version that should become selectable as unresolved.

## Provider Usage Keys

Use [provider-usage-key-matrix.md](provider-usage-key-matrix.md) as the single
source of truth for OpenAI, Gemini, Anthropic, and Bedrock usage aliases. Do not
copy a partial key set from this pricing-source reference or from an older model
entry.
