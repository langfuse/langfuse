# Provider Sources and Price Keys

## Official Pricing Sources

Always fetch pricing from the provider's official docs before editing.

| Provider | Source |
| --- | --- |
| Anthropic Claude | `https://platform.claude.com/docs/en/about-claude/pricing` |
| OpenAI | `https://openai.com/api/pricing/` |
| Google Gemini (AI Studio) | `https://ai.google.dev/pricing` |
| Google Gemini (Vertex AI) | `https://cloud.google.com/vertex-ai/generative-ai/pricing#gemini-models` |
| AWS Bedrock | `https://aws.amazon.com/bedrock/pricing/` |
| Azure OpenAI | `https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/` |

### Known source quirks (as of 2026-06)

- **OpenAI** — `openai.com/api/pricing/` returns HTTP 403 to automated fetchers. No
  accessible alternative has been confirmed. If this page fails, leave OpenAI prices
  unchanged and report the 403 as an unresolved finding.
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
| --- | --- |
| `$5 / MTok` | `5e-6` |
| `$25 / MTok` | `25e-6` |
| `$0.50 / MTok` | `0.5e-6` |
| `$6.25 / MTok` | `6.25e-6` |

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
