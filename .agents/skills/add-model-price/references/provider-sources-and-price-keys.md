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
- **Claude Sonnet 5 introductory pricing** — The API model ID is `claude-sonnet-5` (no
  date suffix; pinned snapshot, not an alias). Introductory pricing of $2/$10 per
  input/output MTok is in effect through August 31, 2026; standard pricing of $3/$15 will
  apply from September 1, 2026. Cache write 5m = $2.50/MTok, 1h = $4/MTok, read =
  $0.20/MTok during introductory period. Since the pricing schema cannot express
  time-based tiers, the file holds the current introductory prices; update to $3/$15 and
  cache equivalents ($3.75/$6/$0.30) after August 31, 2026. AWS Bedrock ID:
  `anthropic.claude-sonnet-5`. The model is in the flat long-context list (no Large
  Context tier). Added to pricing file and `anthropicModels` in July 2026 audit.
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
- **Gemini 3.6 Flash (added July 2026)** — `gemini-3.6-flash` appeared on the official AI Studio
  pricing page in July 2026 at $1.50/MTok input, $7.50/MTok output, cache read $0.15/MTok
  (10% cache-read ratio). No large-context tier. Added to pricing file and selectable model lists
  (`vertexAIModels`, `googleAIStudioModels`) in the July 22 2026 audit. Note: despite the higher
  version number, output price ($7.50) is lower than gemini-3.5-flash ($9.00); this is correct
  per the official page (improved efficiency at same input price).
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
  file and `openAIModels` in July 27 2026 audit. Official sources:
  `https://developers.openai.com/api/docs/pricing` and
  `https://developers.openai.com/api/docs/models/gpt-5.3-codex`.
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
  with a *soft* extended-context cap that bills at a premium rate past a threshold below its
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
