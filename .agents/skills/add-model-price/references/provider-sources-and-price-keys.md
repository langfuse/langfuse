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

## Common Price Keys by Provider

### Anthropic Claude

```json
{
  "input": "<base_input_price>",
  "input_tokens": "<base_input_price>",
  "output": "<output_price>",
  "output_tokens": "<output_price>",
  "cache_creation_input_tokens": "<cache_write_price>",
  "input_cache_creation": "<cache_write_price>",
  "cache_read_input_tokens": "<cache_read_price>",
  "input_cache_read": "<cache_read_price>"
}
```

### OpenAI

```json
{
  "input": "<input_price>",
  "input_cached_tokens": "<cached_input_price>",
  "input_cache_read": "<cached_input_price>",
  "output": "<output_price>"
}
```

### Google Gemini

```json
{
  "input": "<input_price>",
  "input_modality_1": "<input_price>",
  "prompt_token_count": "<input_price>",
  "promptTokenCount": "<input_price>",
  "input_cached_tokens": "<cached_price>",
  "cached_content_token_count": "<cached_price>",
  "output": "<output_price>",
  "output_modality_1": "<output_price>",
  "candidates_token_count": "<output_price>",
  "candidatesTokenCount": "<output_price>"
}
```
