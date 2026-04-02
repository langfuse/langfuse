# Add Model Price

Guide for adding or updating model pricing entries in Langfuse. Use this when
editing `worker/src/constants/default-model-prices.json`,
`packages/shared/src/server/llm/types.ts`, model `matchPattern` values,
tokenizer IDs, or pricing tiers.

## Purpose

This guide keeps model pricing changes consistent across providers and runtime
surfaces so Langfuse can calculate token costs accurately.

## How to Use This Skill

1. Read [references/schema-and-tiers.md](references/schema-and-tiers.md) for
   the JSON shape and pricing-tier rules.
2. Read
   [references/provider-sources-and-price-keys.md](references/provider-sources-and-price-keys.md)
   for official pricing URLs, per-token conversion, and provider-specific usage
   keys.
3. Read [references/match-patterns.md](references/match-patterns.md) when you
   need to add or expand regex coverage.
4. Read
   [references/workflow-and-validation.md](references/workflow-and-validation.md)
   for the end-to-end edit workflow, validation rules, and common mistakes.

## Deterministic Helpers

- Validate the pricing file:
  `node .agents/skills/add-model-price/scripts/validate-pricing-file.mjs`
- Test a regex directly:
  `node .agents/skills/add-model-price/scripts/test-match-pattern.mjs --pattern '(?i)^(openai/)?(gpt-4o)$' --accept gpt-4o openai/gpt-4o --reject gpt-4o-mini`
- Test the regex for an existing model entry:
  `node .agents/skills/add-model-price/scripts/test-match-pattern.mjs --model gpt-4o --accept gpt-4o openai/gpt-4o --reject gpt-4o-mini`

## Quick Start Checklist

### Adding a New Model

- [ ] Gather official pricing from the provider documentation
- [ ] Generate a lowercase UUID for the model entry
- [ ] Create a `matchPattern` that covers supported provider formats
- [ ] Add at least one default pricing tier
- [ ] Insert the pricing entry into
      `worker/src/constants/default-model-prices.json`
- [ ] Update `packages/shared/src/server/llm/types.ts` if the model should be
      selectable in playground or evaluation flows
- [ ] Validate the JSON after editing

### Updating an Existing Model

- [ ] Update the relevant prices, keys, tiers, or regexes
- [ ] Refresh `updatedAt` to today's ISO-8601 timestamp
- [ ] Validate the JSON after editing

## Target Files

- Pricing data:
  `worker/src/constants/default-model-prices.json`
- Shared model types:
  `packages/shared/src/server/llm/types.ts`
- Validation logic:
  `packages/shared/src/features/model-pricing/validation.ts`
- Matching logic:
  `packages/shared/src/server/pricing-tiers/matcher.ts`
- Tests:
  `worker/src/__tests__/pricing-tier-matcher.test.ts`

## Data Structure

### Complete Model Entry Schema

```json
{
  "id": "uuid-generated-with-uuidgen",
  "modelName": "model-name-identifier",
  "matchPattern": "(?i)^regex-pattern$",
  "createdAt": "ISO-8601-timestamp",
  "updatedAt": "ISO-8601-timestamp",
  "tokenizerConfig": null,
  "tokenizerId": "claude|openai|null",
  "pricingTiers": [
    {
      "id": "model-uuid_tier_default",
      "name": "Standard",
      "isDefault": true,
      "priority": 0,
      "conditions": [],
      "prices": {
        "input": 0.000005,
        "output": 0.000025
      }
    }
  ]
}
```

### Required Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Unique lowercase UUID |
| `modelName` | string | Primary model identifier |
| `matchPattern` | string | Regex for matching model names |
| `createdAt` | string | ISO-8601 timestamp set on creation |
| `updatedAt` | string | ISO-8601 timestamp refreshed whenever the entry changes |
| `pricingTiers` | array | At least one pricing tier |

### Optional Fields

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `tokenizerId` | string | `null` | `"claude"`, `"openai"`, or `null` |
| `tokenizerConfig` | object | `null` | Custom tokenizer settings |

## Pricing Tier Structure

### Default Tier

Every model must have exactly one default tier:

```json
{
  "id": "{model-id}_tier_default",
  "name": "Standard",
  "isDefault": true,
  "priority": 0,
  "conditions": [],
  "prices": {}
}
```

Rules for the default tier:

- `isDefault` must be `true`
- `priority` must be `0`
- `conditions` must be `[]`

### Additional Tiers

Use extra tiers for context-window or usage-based pricing:

```json
{
  "id": "uuid-for-tier",
  "name": "Large Context (>200K)",
  "isDefault": false,
  "priority": 1,
  "conditions": [
    {
      "usageDetailPattern": "(input|prompt|cached)",
      "operator": "gt",
      "value": 200000,
      "caseSensitive": false
    }
  ],
  "prices": {}
}
```

Supported condition operators: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`

## Official Pricing Sources

Always fetch pricing from the provider's official docs before editing. Do not
infer or estimate missing values.

| Provider | Source |
| --- | --- |
| Anthropic Claude | `https://platform.claude.com/docs/en/about-claude/pricing` |
| OpenAI | `https://openai.com/api/pricing/` |
| Google Gemini | `https://ai.google.dev/pricing` |
| AWS Bedrock | `https://aws.amazon.com/bedrock/pricing/` |
| Azure OpenAI | `https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/` |

Gather:

1. Base input token price per million tokens
2. Output token price per million tokens
3. Cache write price when supported
4. Cache read price when supported
5. Any long-context pricing tiers
6. All model ID formats that Langfuse should match

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

### Anthropic Claude Models

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

### OpenAI Models

```json
{
  "input": "<input_price>",
  "input_cached_tokens": "<cached_input_price>",
  "input_cache_read": "<cached_input_price>",
  "output": "<output_price>"
}
```

### Google Gemini Models

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

## Match Pattern Examples

### Anthropic Claude: API + Bedrock + Vertex

```regex
(?i)^(anthropic\/)?(claude-opus-4-6|(eu\\.|us\\.|apac\\.)?anthropic\\.claude-opus-4-6-v1(:0)?|claude-opus-4-6)$
```

Matches:

- `claude-opus-4-6`
- `anthropic/claude-opus-4-6`
- `anthropic.claude-opus-4-6-v1:0`
- `us.anthropic.claude-opus-4-6-v1:0`
- `claude-opus-4-6`

### With Version Date

```regex
(?i)^(anthropic\/)?(claude-opus-4-5-20251101|(eu\\.|us\\.|apac\\.)?anthropic\\.claude-opus-4-5-20251101-v1:0|claude-opus-4-5@20251101)$
```

### OpenAI

```regex
(?i)^(openai\/)?(gpt-4o)$
```

### Google Gemini

```regex
(?i)^(google\/)?(gemini-2.5-pro)$
```

### Pattern Components

| Component | Purpose | Example |
| --- | --- | --- |
| `(?i)` | Case-insensitive match | `gpt-4o` and `GPT-4O` |
| `^...$` | Full-string match | Avoids partial matches |
| `(provider\/)?` | Optional provider prefix | `openai/gpt-4o` |
| `(eu\\.|us\\.|apac\\.)?` | Optional AWS region prefix | `us.anthropic.model` |
| `(:0)?` | Optional version suffix | Bedrock model versions |
| `@date` | Vertex AI version format | `claude-3-5-sonnet@20240620` |

## Step-by-Step Workflow

### 1. Fetch Official Pricing

Open the official provider pricing page and capture the model's input, output,
cache write, and cache read prices.

### 2. Generate a Lowercase UUID

```bash
uuidgen
```

Convert the output to lowercase before using it.

### 3. Create the JSON Entry

Example for a model with $5 input, $25 output, $6.25 cache write, and
$0.50 cache read:

```json
{
  "id": "13458bc0-1c20-44c2-8753-172f54b67647",
  "modelName": "claude-opus-4-6",
  "matchPattern": "(?i)^(anthropic\/)?(claude-opus-4-6|(eu\\.|us\\.|apac\\.)?anthropic\\.claude-opus-4-6-v1(:0)?|claude-opus-4-6)$",
  "createdAt": "2026-03-09T00:00:00.000Z",
  "updatedAt": "2026-03-09T00:00:00.000Z",
  "tokenizerConfig": null,
  "tokenizerId": "claude",
  "pricingTiers": [
    {
      "id": "13458bc0-1c20-44c2-8753-172f54b67647_tier_default",
      "name": "Standard",
      "isDefault": true,
      "priority": 0,
      "conditions": [],
      "prices": {
        "input": 5e-6,
        "input_tokens": 5e-6,
        "output": 25e-6,
        "output_tokens": 25e-6,
        "cache_creation_input_tokens": 6.25e-6,
        "input_cache_creation": 6.25e-6,
        "cache_read_input_tokens": 0.5e-6,
        "input_cache_read": 0.5e-6
      }
    }
  ]
}
```

### 4. Insert the Entry

Add the entry to the JSON array in
`worker/src/constants/default-model-prices.json`. Keep related models grouped
together.

### 5. Update Shared Model Types When Needed

If the model should be available in the playground or LLM-as-judge flows, add
it to the correct array in `packages/shared/src/server/llm/types.ts`.

Model arrays include:

- `anthropicModels`
- `openAIModels`
- `vertexAIModels`
- `googleAIStudioModels`

Do not add a new model as the first entry in one of these arrays. The first
entry is used as a default model in some test or evaluation paths and newer
models may not be available to all users yet.

### 6. Validate the Change

```bash
jq . worker/src/constants/default-model-prices.json > /dev/null
```

You can also inspect a specific entry:

```bash
jq '.[] | select(.modelName == "claude-opus-4-6")' worker/src/constants/default-model-prices.json
```

## Multi-Tier Example

For models with long-context pricing:

```json
{
  "id": "uuid-here",
  "modelName": "model-name",
  "matchPattern": "...",
  "pricingTiers": [
    {
      "id": "uuid-here_tier_default",
      "name": "Standard",
      "isDefault": true,
      "priority": 0,
      "conditions": [],
      "prices": {
        "input": 5e-6,
        "output": 25e-6
      }
    },
    {
      "id": "uuid-for-large-context-tier",
      "name": "Large Context (>200K)",
      "isDefault": false,
      "priority": 1,
      "conditions": [
        {
          "usageDetailPattern": "(input|prompt|cached)",
          "operator": "gt",
          "value": 200000,
          "caseSensitive": false
        }
      ],
      "prices": {
        "input": 10e-6,
        "output": 37.5e-6
      }
    }
  ]
}
```

## Validation Rules

1. Exactly one default tier must have `isDefault: true`
2. The default tier must have `priority: 0`
3. The default tier must have `conditions: []`
4. Non-default tiers must have `priority > 0`
5. Non-default tiers must have at least one condition
6. Priorities must be unique within a model
7. Tier names must be unique within a model
8. Each tier must contain at least one price
9. All tiers must expose the same usage-type keys
10. Regex patterns must be valid and safe

## Common Mistakes

### Guessing Instead of Using Official Pricing

Wrong:

```json
{
  "cache_creation_input_tokens": "input_price * 1.25"
}
```

Correct:

```json
{
  "cache_creation_input_tokens": 6.25e-6
}
```

### Using MTok Values Directly

Wrong:

```json
{
  "input": 5
}
```

Correct:

```json
{
  "input": 5e-6
}
```

### Missing the Default Tier Suffix

Wrong:

```json
{
  "id": "some-uuid"
}
```

Correct:

```json
{
  "id": "model-uuid_tier_default"
}
```

### Invalid Regex Escaping

Wrong:

```json
{
  "matchPattern": "anthropic.claude"
}
```

Correct:

```json
{
  "matchPattern": "anthropic\\.claude"
}
```

### Forgetting to Update `updatedAt`

Wrong:

```json
{
  "updatedAt": "2025-12-12T15:00:06.513Z"
}
```

Correct:

```json
{
  "updatedAt": "2026-03-09T00:00:00.000Z"
}
```

## Testing Model Matching

After adding a model, verify that the regex matches the intended provider
variants:

```javascript
const pattern = new RegExp(matchPattern);
console.log(pattern.test("claude-opus-4-6")); // true
console.log(pattern.test("anthropic/claude-opus-4-6")); // true
console.log(pattern.test("anthropic.claude-opus-4-6-v1:0")); // true
console.log(pattern.test("us.anthropic.claude-opus-4-6-v1:0")); // true
```

## Existing Model Templates

Use nearby entries as templates:

- `claude-opus-4-5-20251101` for Anthropic multi-provider patterns
- `gpt-4o` for a simple OpenAI pattern
- `gemini-2.5-pro` for a multi-tier Gemini entry
