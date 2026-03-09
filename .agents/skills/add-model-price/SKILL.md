---
name: add-model-price
description: Use when adding or updating model pricing entries in Langfuse, including default-model-prices.json, matchPattern regexes, pricing tiers, tokenizer IDs, and related LLM type definitions.
---

# Add Model Price

## When to Use This Skill

Use this skill when changing:
- `worker/src/constants/default-model-prices.json`
- `packages/shared/src/server/llm/types.ts`
- model `matchPattern` values
- pricing tiers or cache pricing fields

## Workflow

1. Fetch pricing from the official provider source.
2. Convert provider pricing from per-million tokens to per-token values.
3. Generate lowercase UUIDs for new entries and tiers.
4. Add or update the pricing entry in
   `worker/src/constants/default-model-prices.json`.
5. Update `packages/shared/src/server/llm/types.ts` if the model must be
   available in Langfuse type definitions.
6. Set `updatedAt` to the current ISO timestamp when modifying an existing
   entry.
7. Validate the JSON after editing.

## Rules

- Every model must have exactly one default pricing tier.
- The default tier must use `isDefault: true`, `priority: 0`, and empty
  `conditions`.
- `matchPattern` should cover provider-specific variants you intend to support.
- Prefer explicit regex coverage for Anthropic, OpenAI, Bedrock, Vertex, or
  other platform-specific naming variants instead of loose matching.
- Do not guess provider pricing. Use official documentation.

## Common Checks

- `tokenizerId` matches the provider behavior.
- Cache write and cache read pricing are added when supported.
- Any long-context or conditional pricing becomes a non-default tier.
- The model name and pattern fit existing naming conventions.

## Finish Checklist

- JSON is valid.
- `updatedAt` is refreshed for edits.
- The regex matches expected provider model names.
- Shared LLM types are updated when required.
