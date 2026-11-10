# Model Price Audit Memory

This file is an optional snapshot of the latest automated audit whose
per-model results add useful context for a future run. It is orientation only;
reconfirm every price and tier against official provider sources before making
a change or reporting a row as confirmed.

The audit agent may replace the snapshot below with its complete current
`modelsChecked` table, and only in a run that also changes
`default-model-prices.json` or `packages/shared/src/server/llm/types.ts`.
Keep only one snapshot, never append run history or narrative, never persist a
partial set of checked models, and do not update this file only to refresh the
audit date. Durable facts belong in `provider-sources-and-price-keys.md`.

## Latest useful snapshot

Audit date: 2026-11-10. Scope: Anthropic Claude current lineup, focused on the
`claude-fable-5-2` / `claude-mythos-5-2` release confirmed via
`platform.claude.com`. OpenAI, Gemini, Bedrock-other, Azure, and TypeSafe were
not re-audited this run.

| Provider  | Model                        | Change  | Comments                                                                    |
| --------- | ----------------------------- | ------- | ---------------------------------------------------------------------------- |
| Anthropic | claude-fable-5-2              | added   | New model, released 2026-11-09. $8/$40, 0.025x cache read, Fast mode $16/$80. |
| Anthropic | claude-mythos-5-2             | added   | New model, released 2026-11-09. Same pricing as Fable 5.2.                   |
| Anthropic | claude-fable-5-1              | none    | Confirmed against official pricing table, unchanged.                        |
| Anthropic | claude-mythos-5-1             | none    | Confirmed unchanged; Bedrock pattern-coverage gap noted above.              |
| Anthropic | claude-fable-5                | none    | Confirmed against official pricing table, unchanged.                        |
| Anthropic | claude-mythos-5               | none    | Confirmed unchanged.                                                        |
| Anthropic | claude-opus-5-5               | none    | Confirmed unchanged.                                                        |
| Anthropic | claude-opus-5                 | none    | Confirmed unchanged, including Fast mode tier.                              |
| Anthropic | claude-opus-4-8               | none    | Confirmed unchanged, including Fast mode tier.                              |
| Anthropic | claude-opus-4-7               | none    | Confirmed unchanged.                                                        |
| Anthropic | claude-opus-4-6               | none    | Confirmed unchanged.                                                        |
| Anthropic | claude-opus-4-5-20251101      | none    | Confirmed unchanged.                                                        |
| Anthropic | claude-sonnet-5-5             | none    | Confirmed unchanged.                                                        |
| Anthropic | claude-sonnet-5               | none    | Confirmed unchanged; $2/$10 standard price, cancelled increase still noted. |
| Anthropic | claude-sonnet-4-6             | none    | Confirmed unchanged.                                                        |
| Anthropic | claude-haiku-5-5              | none    | Confirmed unchanged, including >100K tier.                                 |
| Anthropic | claude-haiku-4-5-20251001     | none    | Confirmed unchanged.                                                        |
