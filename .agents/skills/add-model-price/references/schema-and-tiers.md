# Schema and Tiers

## Target Files

- Pricing data: `worker/src/constants/default-model-prices.json`
- Shared model types: `packages/shared/src/server/llm/types.ts`

## Complete Model Entry Schema

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

## Required Fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Unique lowercase ID used by the pricing file |
| `modelName` | string | Primary model identifier |
| `matchPattern` | string | Regex used to match provider model names |
| `createdAt` | string | ISO-8601 timestamp set on creation |
| `updatedAt` | string | ISO-8601 timestamp refreshed whenever the entry changes |
| `pricingTiers` | array | At least one pricing tier |

## Optional Fields

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `tokenizerId` | string | `null` | Usually `"claude"`, `"openai"`, or `null` |
| `tokenizerConfig` | object | `null` | Custom tokenizer settings |

## Default Tier

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

Rules:

- `isDefault` must be `true`
- `priority` must be `0`
- `conditions` must be `[]`

## Additional Tiers

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

Supported operators: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`
