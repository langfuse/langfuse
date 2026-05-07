# Provider Sources and Price Keys

## Official Pricing Sources

Always fetch pricing from the provider's official docs before editing.

| Provider | Source |
| --- | --- |
| Anthropic Claude | `https://platform.claude.com/docs/en/about-claude/pricing` |
| OpenAI | `https://openai.com/api/pricing/` |
| Google Gemini | `https://ai.google.dev/pricing` |
| AWS Bedrock | `https://aws.amazon.com/bedrock/pricing/` |
| Azure OpenAI | `https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/` |

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
