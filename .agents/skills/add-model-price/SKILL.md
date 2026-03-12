---
name: add-model-price
description: Use when editing worker/src/constants/default-model-prices.json, packages/shared/src/server/llm/types.ts, pricing tiers, tokenizer IDs, or matchPattern regexes for OpenAI, Anthropic, Bedrock, Vertex, Azure, or Gemini model pricing.
---

# Add Model Price

Use this skill for model pricing changes in `worker/` and shared LLM type
updates in `packages/shared/`.

## When to Apply

- Editing `worker/src/constants/default-model-prices.json`
- Editing `packages/shared/src/server/llm/types.ts`
- Adding a new priced model
- Updating provider prices, cache pricing, or tier conditions
- Expanding regex coverage for Bedrock, Vertex, Azure, or provider-prefixed
  model names

## How to Read This Skill

- Start with [AGENTS.md](AGENTS.md) for the high-level workflow and helper
  scripts.
- Then open only the specific reference file that matches the task.

## Reference Map

| Topic | Read this when | File |
| --- | --- | --- |
| Schema and tier rules | You need the entry shape or pricing-tier invariants | [references/schema-and-tiers.md](references/schema-and-tiers.md) |
| Provider sources and price keys | You need official pricing URLs, per-token conversion, or provider-specific usage keys | [references/provider-sources-and-price-keys.md](references/provider-sources-and-price-keys.md) |
| Match patterns | You are editing `matchPattern` regexes or provider coverage | [references/match-patterns.md](references/match-patterns.md) |
| Workflow and validation | You are applying the end-to-end edit process or checking common mistakes | [references/workflow-and-validation.md](references/workflow-and-validation.md) |

## Deterministic Helpers

- Pricing file validator:
  `node .agents/skills/add-model-price/scripts/validate-pricing-file.mjs`
- Match-pattern tester:
  `node .agents/skills/add-model-price/scripts/test-match-pattern.mjs --model <modelName> --accept <sample...> --reject <sample...>`
