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

Audit date: 2026-11-18. Scope: full OpenAI gpt-5/gpt-6 family and full
Anthropic Claude lineup re-confirmed against official pricing and
deprecations pages; TypeSafe Jev re-confirmed. Added a real coverage gap fix:
OpenAI shipped two new flagship models, `gpt-6.2-astra` and `gpt-6.2-sol`
(confirmed via their own model pages and the aggregate pricing table), added
to `default-model-prices.json` and `openAIModels`. Their pricing page also
revealed that the whole `gpt-5.6`/`gpt-6` family's single cache-write price
is actually a 30-minute-TTL rate with an unrepresented 12-hour-TTL premium
(see `provider-sources-and-price-keys.md`); this is a pre-existing gap, not
new to gpt-6.2. Google Gemini and AWS Bedrock numeric pricing could not be
re-confirmed this run (see known blockers in `provider-sources-and-price-keys.md`);
Azure OpenAI has no Azure-specific pricing entries to check (Azure
deployments match the bare OpenAI `matchPattern`s).

| Provider  | Model                        | Change  | Comments                                                                      |
| --------- | ----------------------------- | ------- | ------------------------------------------------------------------------------ |
| OpenAI    | gpt-6.2-astra                 | added   | New flagship: short $8/$0.40/$40/$10(30m write), long $16/$0.80/$60/$20; Fast 2x, Ultrafast 3x promo through 2027-02-28 then 6x; no Flex tier. |
| OpenAI    | gpt-6.2-sol                   | added   | New model: short $2/$0.10/$10/$2.50(30m write), long $4/$0.20/$15/$5; Fast 2x, Ultrafast 3x promo through 2027-02-28 then 6x; no Flex tier. |
| OpenAI    | gpt-6-astra                   | none    | Confirmed unchanged: $10/$1(cache)/$50, Ultrafast/Fast/Flex tiers unchanged.   |
| OpenAI    | gpt-6-cyber                   | none    | Confirmed unchanged: short $20/$2/$100, long (Large Context) $40/$4/$150.     |
| OpenAI    | gpt-6-sol                     | none    | Confirmed unchanged: $2/$0.20/$10.                                            |
| OpenAI    | gpt-6.1-sol                   | none    | Confirmed unchanged: $2/$0.10/$10.                                            |
| OpenAI    | gpt-6.1-terra                 | none    | Confirmed unchanged: $1/$0.05/$5.                                             |
| OpenAI    | gpt-6-luna                    | none    | Confirmed unchanged: $0.10/$0.01/$0.50.                                       |
| OpenAI    | gpt-5.6-sol                   | none    | Confirmed unchanged: $4/$0.40/$20; promotional pricing still guaranteed through 2026-11-21. |
| OpenAI    | gpt-5.6-terra                 | none    | Confirmed unchanged: $2/$0.20/$12.                                            |
| OpenAI    | gpt-5.6-luna                  | none    | Confirmed unchanged: $0.20/$0.02/$1.20.                                       |
| OpenAI    | gpt-5.6-cyber                 | none    | Confirmed unchanged: $12.50/$1.25/$75, Large Context $25/$2.50/$112.50.       |
| OpenAI    | gpt-5.5-2026-04-23            | none    | Confirmed unchanged: $5/$0.50/$30.                                            |
| OpenAI    | gpt-5.5-pro-2026-04-23        | none    | Confirmed unchanged: $30/no cache/$180.                                       |
| OpenAI    | gpt-5.4                       | none    | Confirmed unchanged: $2.50/$0.25/$15.                                         |
| OpenAI    | gpt-5.4-pro                   | none    | Confirmed unchanged: $30/no cache/$180.                                       |
| OpenAI    | gpt-5.4-mini                  | none    | Confirmed unchanged: $0.75/$0.075/$4.50.                                      |
| OpenAI    | gpt-5.4-nano                  | none    | Confirmed unchanged: $0.20/$0.02/$1.25.                                       |
| OpenAI    | gpt-5.3-codex                 | none    | Confirmed unchanged: $1.75/$0.175/$14.                                        |
| OpenAI    | gpt-5.2                       | none    | Confirmed unchanged: $1.75/$0.175/$14.                                        |
| OpenAI    | gpt-5.1                       | none    | Confirmed unchanged: $1.25/$0.125/$10.                                        |
| OpenAI    | gpt-5                         | none    | Confirmed unchanged: $1.25/$0.125/$10.                                        |
| OpenAI    | gpt-5-mini                    | none    | Confirmed unchanged: $0.25/$0.025/$2.                                         |
| OpenAI    | gpt-5-nano                    | none    | Confirmed unchanged: $0.05/$0.005/$0.40.                                      |
| OpenAI    | o3                            | none    | Confirmed unchanged: $2/$0.50/$8.                                             |
| OpenAI    | o3-pro                        | none    | Confirmed unchanged: $20/no cache/$80.                                        |
| OpenAI    | gpt-4.1                       | none    | Confirmed unchanged: $2/$0.50/$8.                                             |
| OpenAI    | gpt-4.1-mini                  | none    | Confirmed unchanged: $0.40/$0.10/$1.60.                                       |
| OpenAI    | gpt-4o                        | none    | Confirmed unchanged: $2.50/$1.25/$10.                                         |
| OpenAI    | gpt-4o-mini                   | none    | Confirmed unchanged: $0.15/$0.075/$0.60.                                      |
| Anthropic | claude-fable-5-2              | none    | Confirmed unchanged: $8/$40, cache read $0.20 (0.025x), 5m $10, 1h $16.       |
| Anthropic | claude-mythos-5-2             | none    | Confirmed unchanged: same rates as Fable 5.2; Fast mode $16/$80.              |
| Anthropic | claude-fable-5-1              | none    | Confirmed unchanged: $10/$50, cache read $0.25 (0.025x), 5m $12.50, 1h $20.   |
| Anthropic | claude-mythos-5-1             | none    | Confirmed unchanged: same rates as Fable 5.1.                                |
| Anthropic | claude-fable-5                | none    | Confirmed unchanged: $10/$50, cache read $1 (standard 0.1x), 5m $12.50, 1h $20. |
| Anthropic | claude-mythos-5               | none    | Confirmed unchanged: same rates as Fable 5.                                  |
| Anthropic | claude-opus-5-5               | none    | Confirmed unchanged: $4/$20, cache read $0.20 (0.05x); Fast mode $8/$40.      |
| Anthropic | claude-opus-5                 | none    | Confirmed unchanged: $5/$25, cache read $0.50; Fast mode $10/$50.             |
| Anthropic | claude-opus-4-8               | none    | Confirmed unchanged: $5/$25, cache read $0.50; Fast mode $10/$50.             |
| Anthropic | claude-opus-4-7               | none    | Confirmed unchanged: $5/$25, cache read $0.50.                                |
| Anthropic | claude-opus-4-6               | none    | Confirmed unchanged: $5/$25, cache read $0.50.                                |
| Anthropic | claude-opus-4-5-20251101      | none    | Confirmed unchanged: $5/$25, cache read $0.50.                                |
| Anthropic | claude-sonnet-5-5             | none    | Confirmed unchanged: $2/$10, cache read $0.10 (0.05x).                        |
| Anthropic | claude-sonnet-5               | none    | Confirmed unchanged: $2/$10 standard (cancelled Sep 2026 increase).           |
| Anthropic | claude-sonnet-4-6             | none    | Confirmed unchanged: $3/$15, cache read $0.30.                                |
| Anthropic | claude-sonnet-4-5-20250929    | none    | Still scheduled to retire 2026-11-30 per deprecations page; not yet due.      |
| Anthropic | claude-haiku-5-5              | none    | Confirmed unchanged: <=100K $0.10/$0.50; >100K $0.50/$2.50 (5x tier).         |
| Anthropic | claude-haiku-4-5-20251001     | none    | Confirmed unchanged: $1/$5, cache read $0.10.                                 |
| TypeSafe  | jev                            | none    | Confirmed unchanged: $42/billion input tokens (4.2e-8/token), output free.    |
