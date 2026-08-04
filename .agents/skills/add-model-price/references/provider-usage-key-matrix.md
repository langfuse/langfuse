# Provider Usage-Key Matrix

Use this reference whenever adding or changing a model price entry. A price is
usable only when every usage key that Langfuse may persist for the supported
provider capability has a matching price.

## Required comparison

Before editing an entry, compare all three sources:

1. The official provider usage object and supported billing dimensions.
2. Langfuse ingestion normalization, especially
   `packages/shared/src/server/otel/OtelIngestionProcessor.ts`.
3. A mature sibling entry in `default-model-prices.json`.

Do not copy a sibling mechanically. Provider response shapes and model
capabilities change over time. Record unsupported capabilities as not
applicable instead of inventing keys or prices.

## Semantic alias rules

- Put every alias for one semantic bucket in every tier at the same price.
- Keep all tiers for one model on the same key set.
- Add cache, reasoning, modality, TTL, grounding, and tool keys only when the
  provider documents that capability and price.
- Never infer cache writes from ordinary input or from the presence of a cache
  read. Price a write premium only when an explicit write bucket is stored.

## OpenAI

For a reasoning model with prompt caching, use:

| Bucket               | Required keys when supported                                         |
| -------------------- | -------------------------------------------------------------------- |
| Input                | `input`                                                              |
| Cache read           | `input_cached_tokens`, `input_cache_read`, `cache_read_input_tokens` |
| Explicit cache write | `input_cache_creation`, `cache_write_tokens`                         |
| Output               | `output`                                                             |
| Reasoning            | `output_reasoning_tokens`, `output_reasoning`, `reasoning_tokens`    |

Use only the applicable families for models without caching or reasoning.
`gpt-5.6-sol` is the complete reasoning-and-caching template. Older
`gpt-5.5-2026-04-23` and the original `gpt-5.3-codex` addition demonstrate why
copying only the established six-key shape is insufficient.

## Anthropic and Bedrock Claude

Use this mature Claude set when prompt caching is supported:

| Bucket                  | Keys                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| Input                   | `input`, `input_tokens`                                              |
| Output                  | `output`, `output_tokens`                                            |
| Cache write             | `cache_creation_input_tokens`, `input_cache_creation`                |
| Five-minute cache write | `input_cache_creation_5m`                                            |
| One-hour cache write    | `input_cache_creation_1h`                                            |
| Cache read              | `cache_read_input_tokens`, `input_cache_read`, `input_cached_tokens` |

The TTL-specific prices can differ, so do not treat the 5-minute and 1-hour
keys as equal-price aliases. Verify which TTLs the model supports. Current
`claude-sonnet-4-6`, `claude-opus-4-6`, and `claude-opus-4-8` entries are mature
templates and include direct Anthropic plus regional Bedrock model IDs.

## Gemini

Use these core aliases for priced text-generation models:

| Bucket                     | Required keys                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Input                      | `input`, `input_text`, `input_modality_1`, `prompt_token_count`, `promptTokenCount`            |
| Output                     | `output`, `output_text`, `output_modality_1`, `candidates_token_count`, `candidatesTokenCount` |
| Cache read, when supported | `input_cached_tokens`, `cached_content_token_count`                                            |
| Reasoning, when supported  | `thoughts_token_count`, `thoughtsTokenCount`, `output_reasoning_tokens`, `output_reasoning`    |

Add `input_audio_tokens`, grounding/search aliases, or other modality/tool keys
only when the official model pricing has those distinct dimensions. Use
`gemini-3.1-pro-preview` as the mature reasoning, caching, and grounding
template, but remove capability families that official docs mark unavailable.

## Other Bedrock models

There is no universal Bedrock price-key set. Bedrock hosts model families with
different response and billing dimensions.

- Use the Anthropic matrix for Bedrock Claude.
- For Nova, Mistral, Llama, and other families, derive the key contract from
  the documented Bedrock usage object and Langfuse normalization.
- State why cache, reasoning, or modality families are not applicable.
- Do not reuse Claude cache keys or rates without provider evidence.

## Deterministic validation

The pricing validator always checks structural catalog invariants. It checks
semantic alias completeness for explicitly selected models or entries changed
relative to a base file:

```bash
node .agents/skills/add-model-price/scripts/validate-pricing-file.mjs \
  --usage-key-model gpt-5.6-sol

node .agents/skills/add-model-price/scripts/validate-pricing-file.mjs \
  --base /path/to/default-model-prices-before.json
```

Changed-entry validation avoids turning a focused addition into an unrelated
historical cleanup while preventing new incomplete alias families.
