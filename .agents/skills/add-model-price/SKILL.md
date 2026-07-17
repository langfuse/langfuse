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
- Auditing default model prices for stale, missing, or unmatched provider
  pricing
- Auditing official provider docs for newly released major models that should
  receive default pricing and, when appropriate, selectable-model coverage

## How to Read This Skill

- Use this `SKILL.md` as the high-level workflow and helper index.
- Open only the specific reference file that matches the task.

## Quick Start Checklist

### Adding a New Model

- Gather official pricing from the provider documentation.
- Generate a lowercase UUID for the model entry.
- Create a `matchPattern` that covers supported provider formats.
- Add at least one default pricing tier.
- Insert the pricing entry into `worker/src/constants/default-model-prices.json`.
- Update `packages/shared/src/server/llm/types.ts` if the model should be
  selectable in playground or evaluation flows.
- Validate the JSON after editing.

### Updating an Existing Model

- Update the relevant prices, keys, tiers, or regexes.
- Refresh `updatedAt` to today's ISO-8601 timestamp.
- Validate the JSON after editing.

## Reference Map

| Topic                           | Read this when                                                                        | File                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Schema and tier rules           | You need the entry shape or pricing-tier invariants                                   | [references/schema-and-tiers.md](references/schema-and-tiers.md)                               |
| Provider sources and price keys | You need official pricing URLs, per-token conversion, or provider-specific usage keys | [references/provider-sources-and-price-keys.md](references/provider-sources-and-price-keys.md) |
| Match patterns                  | You are editing `matchPattern` regexes or provider coverage                           | [references/match-patterns.md](references/match-patterns.md)                                   |
| Workflow and validation         | You are applying the end-to-end edit process or checking common mistakes              | [references/workflow-and-validation.md](references/workflow-and-validation.md)                 |
| Automated audit mode            | You are running a scheduled/default-price audit and need CI-safe edit rules           | [references/automated-audit.md](references/automated-audit.md)                                 |
| Audit memory                    | You need optional per-model context retained from a useful prior automated audit      | [references/model-audit-memory.md](references/model-audit-memory.md)                           |

## Deterministic Helpers

- Pricing file validator:
  `node .agents/skills/add-model-price/scripts/validate-pricing-file.mjs`
- Match-pattern tester:
  `node .agents/skills/add-model-price/scripts/test-match-pattern.mjs --model <modelName> --accept <sample...> --reject <sample...>`
- Direct regex tester:
  `node .agents/skills/add-model-price/scripts/test-match-pattern.mjs --pattern '(?i)^(openai/)?(gpt-4o)$' --accept gpt-4o openai/gpt-4o --reject gpt-4o-mini`
