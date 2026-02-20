---
name: add-model-price
description: Add new LLM model pricing entries to Langfuse's default-model-prices.json. Use when adding model prices, updating model pricing, creating model entries, adding Claude/OpenAI/Anthropic/Google/Gemini/AWS Bedrock/Azure/Vertex AI model pricing, working with matchPattern regex, pricingTiers, or model cost configuration. Covers model price JSON structure, regex patterns for multi-provider matching, tiered pricing with conditions, cache pricing, and validation rules.
---

# Add Model Price

## Purpose

Guide for adding new LLM model pricing entries to Langfuse's default model prices configuration. This enables accurate cost tracking across different model providers and deployment platforms.

## When to Use This Skill

Automatically activates when:
- Adding a new model to the pricing database
- Updating model pricing information
- Working with `default-model-prices.json`
- Creating model matchPattern regex
- Configuring pricingTiers or tiered pricing
- Adding prices for Claude, OpenAI, Anthropic, Google, Gemini, AWS Bedrock, Azure, or Vertex AI models

---

## Quick Start Checklist

- [ ] **Gather model info**: Fetch official pricing from provider documentation URL
- [ ] **Generate UUID**: Run `uuidgen` for the model entry ID (use lowercase)
- [ ] **Create matchPattern**: Regex covering all provider formats
- [ ] **Define pricingTiers**: At minimum, one default tier with standard prices
- [ ] **Add pricing entry**: Insert into `/worker/src/constants/default-model-prices.json`
- [ ] **Add to LLM types**: Add model to `/packages/shared/src/server/llm/types.ts` (for playground/LLM-as-judge)
- [ ] **Validate JSON**: Run `jq . default-model-prices.json` to verify syntax

---

## File Location

**Target File**: `/worker/src/constants/default-model-prices.json`

This JSON file contains an array of model pricing definitions used for cost calculation.

---

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
|-------|------|-------------|
| `id` | string | Unique UUID (use `uuidgen` command, lowercase) |
| `modelName` | string | Primary model identifier |
| `matchPattern` | string | Regex for matching model names |
| `createdAt` | string | ISO-8601 timestamp |
| `updatedAt` | string | ISO-8601 timestamp |
| `pricingTiers` | array | At least one pricing tier |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tokenizerId` | string | null | "claude", "openai", or null |
| `tokenizerConfig` | object | null | Custom tokenizer settings |

---

## Pricing Tier Structure

### Default Tier (Required)

Every model must have exactly one default tier:

```json
{
  "id": "{model-id}_tier_default",
  "name": "Standard",
  "isDefault": true,
  "priority": 0,
  "conditions": [],
  "prices": { }
}
```

**Rules for Default Tier:**
- `isDefault`: Must be `true`
- `priority`: Must be `0`
- `conditions`: Must be empty array `[]`

### Additional Tiers (Optional)

For usage-based pricing (e.g., large context pricing):

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
  "prices": { }
}
```

**Condition Operators:** `gt`, `gte`, `lt`, `lte`, `eq`, `neq`

---

## Gathering Pricing Information

**IMPORTANT**: Always fetch pricing from official provider documentation. Never use heuristics or assumptions.

### Official Pricing Sources

| Provider | URL |
|----------|-----|
| Anthropic Claude | https://platform.claude.com/docs/en/about-claude/pricing |
| OpenAI | https://openai.com/api/pricing/ |
| Google Gemini | https://ai.google.dev/pricing |
| AWS Bedrock | https://aws.amazon.com/bedrock/pricing/ |
| Azure OpenAI | https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/ |

### Required Information to Gather

1. **Base input token price** (per MTok)
2. **Output token price** (per MTok)
3. **Cache write price** (if caching supported)
4. **Cache read price** (if caching supported)
5. **Long context pricing** (if different tiers exist)
6. **Model ID formats** for all platforms (API, Bedrock, Vertex)

---

## Price Conversion

Prices in the JSON are **per token**, not per million tokens.

| Provider Pricing | JSON Value | Calculation |
|-----------------|------------|-------------|
| $5 / MTok | `5e-6` | $5 / 1,000,000 |
| $25 / MTok | `25e-6` | $25 / 1,000,000 |
| $0.50 / MTok | `0.5e-6` | $0.50 / 1,000,000 |
| $6.25 / MTok | `6.25e-6` | $6.25 / 1,000,000 |

**Formula**: `price_per_token = price_per_mtok / 1_000_000` or `price_per_mtok * 1e-6`

---

## Common Price Keys by Provider

### Anthropic Claude Models

```json
{
  "input": <base_input_price>,
  "input_tokens": <base_input_price>,
  "output": <output_price>,
  "output_tokens": <output_price>,
  "cache_creation_input_tokens": <cache_write_price>,
  "input_cache_creation": <cache_write_price>,
  "cache_read_input_tokens": <cache_read_price>,
  "input_cache_read": <cache_read_price>
}
```

### OpenAI Models

```json
{
  "input": <input_price>,
  "input_cached_tokens": <cached_input_price>,
  "input_cache_read": <cached_input_price>,
  "output": <output_price>
}
```

### Google Gemini Models

```json
{
  "input": <input_price>,
  "input_modality_1": <input_price>,
  "prompt_token_count": <input_price>,
  "promptTokenCount": <input_price>,
  "input_cached_tokens": <cached_price>,
  "cached_content_token_count": <cached_price>,
  "output": <output_price>,
  "output_modality_1": <output_price>,
  "candidates_token_count": <output_price>,
  "candidatesTokenCount": <output_price>
}
```

---

## Match Pattern Examples

### Anthropic Claude (API + Bedrock + Vertex)

```regex
(?i)^(anthropic\/)?(claude-opus-4-6|(eu\\.|us\\.|apac\\.)?anthropic\\.claude-opus-4-6-v1(:0)?|claude-opus-4-6)$
```

**Matches:**
- `claude-opus-4-6` (direct API)
- `anthropic/claude-opus-4-6` (with prefix)
- `anthropic.claude-opus-4-6-v1:0` (AWS Bedrock)
- `us.anthropic.claude-opus-4-6-v1:0` (regional Bedrock)
- `claude-opus-4-6` (GCP Vertex)

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
|-----------|---------|---------|
| `(?i)` | Case insensitive | Matches GPT-4o and gpt-4o |
| `^...$` | Full string match | Prevents partial matches |
| `(provider\/)?` | Optional provider prefix | `openai/gpt-4o` |
| `(eu\\.\\|us\\.\\|apac\\.)?` | AWS regions | `us.anthropic.model` |
| `(:0)?` | Optional version suffix | Bedrock model versions |
| `@date` | Vertex AI format | `claude-3-5-sonnet@20240620` |

---

## Step-by-Step: Adding a New Model

### Step 1: Fetch Official Pricing

Use WebFetch to get pricing from official documentation:
```
WebFetch URL: https://platform.claude.com/docs/en/about-claude/pricing
Prompt: Extract pricing for [model name] including input, output, cache write, cache read prices per MTok
```

### Step 2: Generate UUID

```bash
uuidgen
# Output: 13458BC0-1C20-44C2-8753-172F54B67647
# Convert to lowercase: 13458bc0-1c20-44c2-8753-172f54b67647
```

### Step 3: Create the Entry

Example for a model with $5 input, $25 output, $6.25 cache write, $0.50 cache read:

```json
{
  "id": "13458bc0-1c20-44c2-8753-172f54b67647",
  "modelName": "claude-opus-4-6",
  "matchPattern": "(?i)^(anthropic\/)?(claude-opus-4-6|(eu\\.|us\\.|apac\\.)?anthropic\\.claude-opus-4-6-v1(:0)?|claude-opus-4-6)$",
  "createdAt": "2026-02-09T00:00:00.000Z",
  "updatedAt": "2026-02-09T00:00:00.000Z",
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

### Step 4: Insert Entry

Add the entry to the JSON array in `/worker/src/constants/default-model-prices.json`.

**Placement**: Insert near related models (e.g., other Claude models together).

### Step 5: Add to LLM Types (for Playground & LLM-as-Judge)

To make the model available in the Langfuse playground and for LLM-as-a-judge evaluations, add it to the appropriate model array in `/packages/shared/src/server/llm/types.ts`.

**File**: `/packages/shared/src/server/llm/types.ts`

**Model Arrays by Provider:**
- `anthropicModels` - Anthropic Claude models
- `openAIModels` - OpenAI GPT models
- `vertexAIModels` - Google Vertex AI models
- `googleAIStudioModels` - Google AI Studio models

**IMPORTANT**: Do NOT add new models as the first entry in the array. The first entry is used as the default model for test LLM API calls, and newer models may not be available to all users yet.

**Example for Anthropic:**
```typescript
export const anthropicModels = [
  "claude-sonnet-4-5-20250929",  // Keep existing first entry
  "claude-haiku-4-5-20251001",
  "claude-opus-4-6",              // Add new model here (not first!)
  "claude-opus-4-5-20251101",
  // ... rest of models
] as const;
```

### Step 6: Validate

```bash
# Check JSON syntax
jq . /path/to/default-model-prices.json > /dev/null && echo "Valid JSON"

# Verify entry exists
jq '.[] | select(.modelName == "claude-opus-4-6")' /path/to/default-model-prices.json
```

---

## Multi-Tier Pricing Example

For models with long context pricing (e.g., different rates above 200K tokens):

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

---

## Validation Rules

The system validates pricing tiers with these rules:

1. **Exactly one default tier** with `isDefault: true`
2. **Default tier** must have `priority: 0` and empty `conditions: []`
3. **Non-default tiers** must have `priority > 0` and at least one condition
4. **All priorities** must be unique within a model
5. **All tier names** must be unique within a model
6. **Each tier** must have at least one price
7. **All tiers** must have identical usage type keys
8. **Regex patterns** must be valid and safe (no catastrophic backtracking)

---

## Common Mistakes

**Using heuristics instead of official pricing:**
```json
// Wrong - assuming cache is 1.25x input
"cache_creation_input_tokens": input_price * 1.25

// Correct - use exact value from official docs
"cache_creation_input_tokens": 6.25e-6
```

**Incorrect Price Format:**
```json
// Wrong - using MTok price directly
"input": 5

// Correct - price per token
"input": 5e-6
```

**Missing Tier ID Suffix:**
```json
// Wrong
"id": "some-uuid"

// Correct for default tier
"id": "model-uuid_tier_default"
```

**Invalid Regex Escaping:**
```json
// Wrong - unescaped dots
"matchPattern": "anthropic.claude"

// Correct - escaped dots
"matchPattern": "anthropic\\.claude"
```

---

## Testing Model Matching

After adding a model, test that the regex matches expected inputs:

```javascript
const pattern = new RegExp(matchPattern);
console.log(pattern.test("claude-opus-4-6")); // true
console.log(pattern.test("anthropic/claude-opus-4-6")); // true
console.log(pattern.test("anthropic.claude-opus-4-6-v1:0")); // true
console.log(pattern.test("us.anthropic.claude-opus-4-6-v1:0")); // true
```

---

## Reference: Existing Model Entries

Look at these existing entries as templates:

| Model Type | Example Entry | Notes |
|------------|---------------|-------|
| Anthropic Claude | `claude-opus-4-5-20251101` | Full multi-provider pattern |
| OpenAI GPT | `gpt-4o` | Simple pattern |
| Google Gemini | `gemini-2.5-pro` | Multi-tier with large context |

---

## Related Files

- **Pricing JSON**: `/worker/src/constants/default-model-prices.json`
- **LLM Types**: `/packages/shared/src/server/llm/types.ts` (model arrays for playground/LLM-as-judge)
- **Validation**: `/packages/shared/src/server/pricing-tiers/validation.ts`
- **Matcher**: `/packages/shared/src/server/pricing-tiers/matcher.ts`
- **Tests**: `/web/src/__tests__/async/model-pricing-tiers.servertest.ts`

---

**Skill Status**: COMPLETE
**Line Count**: ~340 lines
