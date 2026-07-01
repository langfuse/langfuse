# Automated Audit Mode

Use this reference when a scheduled or CI agent audits
`worker/src/constants/default-model-prices.json`.

## Goal

Produce either no diff or a surgical pricing/model-coverage diff backed by
official provider evidence. The audit must look for newly released major models,
not only validate rows already present in the pricing file. Prefer a small
report over an uncertain code change.

## Required Inputs

- Current pricing JSON:
  `worker/src/constants/default-model-prices.json`
- Selectable model lists:
  `packages/shared/src/server/llm/types.ts`
- Official provider pricing pages from
  `references/provider-sources-and-price-keys.md`
- Deterministic reports from:
  - `node .agents/skills/add-model-price/scripts/validate-pricing-file.mjs`

## Audit Steps

1. Run the deterministic validator.
2. Inspect selectable models and official provider model/pricing pages for
   recent major text, chat, reasoning, or multimodal LLM launches, renames,
   pricing changes, and gaps in Langfuse coverage. Do not limit the audit to
   model names already present in `default-model-prices.json`.
3. Fetch official provider pricing pages before changing prices or adding a
   model.
4. Apply only changes with clear official evidence:
   - corrected input, output, cache write, or cache read prices;
   - missing default pricing entries for selectable models;
   - missing default pricing entries for newly released major provider models
     when the official docs confirm the model ID, price unit, and usage shape;
   - narrow `matchPattern` additions for documented provider model IDs;
   - required `packages/shared/src/server/llm/types.ts` additions when a newly
     priced model should be selectable.
5. Capture durable provider-source URLs, model-ID variants, pricing-page quirks,
   or recurring audit rules in the most relevant file under
   `.agents/skills/add-model-price/references/`.
6. Re-run the validator.

## Edit Rules

- Do not guess prices from blogs, changelogs, SDK names, screenshots, issue
  comments, or third-party aggregators.
- Do not add broad wildcard regexes to cover unknown future models.
- Do not reformat the full pricing file unless the content change requires it.
- Do not rewrite unrelated model entries.
- Preserve existing IDs when updating an entry.
- Generate a new lowercase UUID for a new model entry.
- Refresh `updatedAt` only for entries that changed.
- Add newly released major models when they are officially documented, priced,
  and representable with Langfuse's existing usage keys. Prioritize flagship
  text/chat/reasoning models and models named by manual audit instructions.
- Do not add every provider catalog item. Skip or report models whose pricing is
  for embeddings, images, audio, batch-only, fine-tuned derivatives, or
  modality-specific endpoints unless the current task explicitly covers them and
  Langfuse can represent their usage keys safely.
- Update only pricing skill reference docs for skill learnings; do not edit
  `SKILL.md`, scripts, generated shim files, or unrelated skills during an
  automated audit.
- Keep the first selectable model in each provider array unchanged unless the
  audit explicitly intends to change the default model.
- If provider pricing has dimensions Langfuse cannot currently represent
  safely, leave the code unchanged and report the limitation.

## Evidence Required In The Agent Summary

For every changed model, include:

- model name;
- whether the change updates an existing entry or adds a newly discovered model;
- changed JSON keys or `matchPattern` behavior;
- official source URL;
- provider price unit and converted per-token value;
- validation commands run.

For every unresolved finding, include why no code change was made.

For every skill reference update, include the changed reference file and the
durable learning captured there.
