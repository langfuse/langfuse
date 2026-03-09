---
name: add-model-price
description: Use when adding or updating model pricing entries in Langfuse, including default-model-prices.json, matchPattern regexes, pricing tiers, tokenizer IDs, and related LLM type definitions.
---

# Add Model Price

Use this skill when working on model pricing entries, `matchPattern` regexes,
pricing tiers, tokenizer IDs, or shared model type definitions.

## When to Apply

- Editing `worker/src/constants/default-model-prices.json`
- Editing `packages/shared/src/server/llm/types.ts`
- Adding a new priced model
- Updating provider prices, cache pricing, or tier conditions
- Expanding regex coverage for Bedrock, Vertex, Azure, or provider-prefixed
  model names

## How to Read This Skill

- Start with [AGENTS.md](AGENTS.md) for the full schema, provider source URLs,
  regex patterns, validation rules, and worked examples.
- Use the compiled guide whenever you need provider-specific price-key mapping
  or multi-tier examples.

## Core Rules

- Use official provider pricing, not heuristics.
- Store prices per token, not per million tokens.
- Keep exactly one default pricing tier with `isDefault: true`,
  `priority: 0`, and empty `conditions`.
- Refresh `updatedAt` whenever you modify an existing entry.
- Update `packages/shared/src/server/llm/types.ts` when the model should be
  selectable in product flows.

## Full Compiled Guide

Read [AGENTS.md](AGENTS.md) for the detailed workflow and reference material.
