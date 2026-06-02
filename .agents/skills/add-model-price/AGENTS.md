# Add Model Price

Use this entrypoint when an agent opens `AGENTS.md` directly while adding or
updating model pricing in Langfuse.

Start with `SKILL.md` for trigger guidance, the reference map, and helper
commands. Then open only the focused reference file needed for the task:

- `references/schema-and-tiers.md` for the JSON shape and pricing-tier rules.
- `references/provider-sources-and-price-keys.md` for official pricing sources,
  per-token conversion, and provider-specific usage keys.
- `references/match-patterns.md` when editing model `matchPattern` regexes.
- `references/workflow-and-validation.md` for the end-to-end edit workflow,
  validation rules, and common mistakes.

Useful helpers:

- `node .agents/skills/add-model-price/scripts/validate-pricing-file.mjs`
- `node .agents/skills/add-model-price/scripts/test-match-pattern.mjs --model <modelName> --accept <sample...> --reject <sample...>`
