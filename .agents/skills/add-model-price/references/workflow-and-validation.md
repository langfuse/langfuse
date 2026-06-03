# Workflow and Validation

## Step-by-Step Workflow

### 1. Fetch Official Pricing

Open the provider's official pricing page and collect input, output, cache
write, and cache read prices.

### 2. Generate a Lowercase ID

```bash
uuidgen
```

Convert the output to lowercase before using it.

### 3. Create or Update the Entry

Use nearby models in `worker/src/constants/default-model-prices.json` as the
template, then:

- add the new entry near related models
- refresh `updatedAt` when editing an existing entry

Example for a model with `$5` input, `$25` output, `$6.25` cache write, and
`$0.50` cache read per million tokens:

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

### 4. Update Shared Model Types When Needed

If the model should be available in playground or LLM-as-judge flows, add it to
the correct array in `packages/shared/src/server/llm/types.ts`.

Common arrays include:

- `anthropicModels`
- `openAIModels`
- `vertexAIModels`
- `googleAIStudioModels`

Do not add a new model as the first entry in one of these arrays. The first
entry is used as a default model in some test or evaluation paths, and newer
models may not be available to all users yet.

### 5. Validate the Result

Run the bundled validator:

```bash
node .agents/skills/add-model-price/scripts/validate-pricing-file.mjs
```

For quick manual inspection, use `jq`:

```bash
jq '.[] | select(.modelName == "claude-opus-4-6")' worker/src/constants/default-model-prices.json
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
10. Regex patterns must be valid

## Testing Model Matching

Use the bundled tester before finishing any `matchPattern` change:

```bash
node .agents/skills/add-model-price/scripts/test-match-pattern.mjs --model <modelName> --accept <sample...> --reject <sample...>
```

Use representative accepted and rejected model IDs for every provider format the
regex is intended to cover.

## Common Mistakes

- Guessing prices instead of using official provider docs
- Using MTok values directly instead of per-token values
- Forgetting the `_tier_default` suffix on the default tier ID
- Forgetting to escape regex metacharacters such as `.`
- Forgetting to refresh `updatedAt`

## Existing Model Templates

Use nearby entries as templates:

- `claude-opus-4-5-20251101` for Anthropic multi-provider patterns
- `gpt-4o` for a simple OpenAI pattern
- `gemini-2.5-pro` for a multi-tier Gemini entry
