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
- update `packages/shared/src/server/llm/types.ts` when the model should be
  selectable in product flows

### 4. Validate the Result

Run the bundled validator:

```bash
node .agents/skills/add-model-price/scripts/validate-pricing-file.mjs
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
