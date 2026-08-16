# Model Price Audit Memory

This file is an optional snapshot of the latest automated audit whose
per-model results add useful context for a future run. It is orientation only;
reconfirm every price and tier against official provider sources before making
a change or reporting a row as confirmed.

The audit agent may replace the snapshot below with its complete current table.
Keep only one snapshot, never append an unbounded run history, never persist a
partial set of checked models, and do not update this file only to refresh the
audit date.

## Latest useful snapshot

**Audit date:** 2026-08-16

All prices listed as `$X / MTok` (per million tokens). Per-token JSON values: divide by 1,000,000.

| Provider | Model / pricing entry | Pricing checked | Price confirmed | Tiering checked | Tiering correct | Change | Official source(s) | Comments |
| -------- | --------------------- | --------------- | --------------- | --------------- | --------------- | ------ | ------------------ | -------- |
| Anthropic | claude-fable-5 | Input $10/MTok, Output $50/MTok, 5m $12.50/MTok, 1h $20/MTok, read $1/MTok | Yes | Flat 1M context at standard pricing | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed via full pricing table fetch, unchanged. |
| Anthropic | claude-mythos-5 | Same as Fable 5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Limited availability (Project Glasswing). Re-confirmed unchanged. |
| Anthropic | claude-opus-5 | Input $5/MTok, Output $25/MTok, 5m $6.25/MTok, 1h $10/MTok, read $0.50/MTok | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed. Fast mode $10/$50 MTok unchanged. |
| Anthropic | claude-opus-4-8 | Same as Opus 5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-opus-4-7 | Same as Opus 5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-opus-4-6 | Same as Opus 5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed. `inference_geo: "us"` still adds 1.1x. |
| Anthropic | claude-opus-4-5-20251101 | Same as Opus 5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-opus-4-1-20250805 | Input $15/MTok, Output $75/MTok, 5m $18.75/MTok, 1h $30/MTok, read $1.50/MTok | Yes | Deprecated — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Still listed as "retired, except on Bedrock and Google Cloud" on the current page. Entry retained, unchanged. |
| Anthropic | claude-opus-4-20250514 | Input $15/MTok, Output $75/MTok, 5m $18.75/MTok, 1h $30/MTok, read $1.50/MTok | Yes | Retired except Google Cloud — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed present on current page's main table, unchanged. |
| Anthropic | claude-sonnet-5 | Input $2/MTok, Output $10/MTok; 5m $2.50/MTok, 1h $4/MTok, read $0.20/MTok | Yes | Flat 1M context; pricing is PERMANENT (see comment) | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed via full pricing table fetch. Official page still states the $2/$10 rate "is now the standard price" and the Sep 1 2026 increase "will not occur" — do not re-flag that increase. |
| Anthropic | claude-sonnet-4-6 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-sonnet-4-5-20250929 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | No large-context tier (200k hard context-window cap) | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-sonnet-4-20250514 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | Retired except Bedrock/Google Cloud — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed present on current page's main table, unchanged. |
| Anthropic | claude-haiku-4-5-20251001 | Input $1/MTok, Output $5/MTok, 5m $1.25/MTok, 1h $2/MTok, read $0.10/MTok | Yes | No large-context tier (200k context window, not on flat 1M list) | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-3-5-haiku-20241022 | Input $0.80/MTok, Output $4/MTok, 5m $1/MTok, 1h $1.60/MTok, read $0.08/MTok | Yes | Retired except Bedrock/Google Cloud | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed present on current page's main table ("Claude Haiku 3.5"). |
| Anthropic | claude-3.7-sonnet-20250219 | Input $3/MTok, Output $15/MTok, cache $3.75/$6/$0.30 | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not on current page this run either. Legacy prices retained, not re-verified. |
| Anthropic | claude-3.5-sonnet-20241022 | Input $3/MTok, Output $15/MTok, cache $3.75/$6/$0.30 | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run. Legacy prices retained. |
| Anthropic | claude-3-5-sonnet-20240620 | Input $3/MTok, Output $15/MTok, cache $3.75/$6/$0.30 | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run. Legacy prices retained. |
| Anthropic | claude-3-opus-20240229 | Input $15/MTok, Output $75/MTok | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run. Legacy. |
| Anthropic | claude-3-sonnet-20240229 | Input $3/MTok, Output $15/MTok | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run. Legacy. |
| Anthropic | claude-3-haiku-20240307 | Input $0.25/MTok, Output $1.25/MTok | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run. Legacy. |
| AWS Bedrock | claude-3-5-sonnet-20240620 / claude-3.5-sonnet-20241022 (Public Extended Access SKU) | $6.00/MTok input, $30.00/MTok output, $7.50/MTok cache write, $0.60/MTok cache read | Yes (SKU confirmed real, Aug 4 2026) | Distinct dated SKU, not a context-length tier | Not applicable | Unresolved | https://aws.amazon.com/bedrock/pricing/ | Not re-verified this run (no aws.amazon.com fetch); permanent documented limitation (model-ID string match cannot distinguish billing SKU) — see provider-sources-and-price-keys.md. |
| OpenAI | gpt-5.6-sol | Input $5/MTok, Cached $0.50/MTok, Cache write $6.25/MTok, Output $30/MTok | Yes | Large Context (>272K): $10/$1.00/$12.50/$45 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full standard-pricing-table dump this run. |
| OpenAI | gpt-5.6-terra | Input $2/MTok, Cached $0.20/MTok, Cache write $2.50/MTok, Output $12/MTok | Yes | Large Context (>272K): $4/$0.40/$5.00/$18 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed stable. |
| OpenAI | gpt-5.6-luna | Input $0.20/MTok, Cached $0.02/MTok, Cache write $0.25/MTok, Output $1.20/MTok | Yes | Large Context (>272K): $0.40/$0.04/$0.50/$1.80 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed stable. |
| OpenAI | gpt-5.6-cyber | Input $12.50/MTok, Cached $1.25/MTok, Cache write $15.625/MTok, Output $75.00/MTok | Yes (standard tier only) | Conflicting: model page says >272K applies 2x/1.5x; pricing page's own Cyber table shows dashes (no long-context row) | No — unresolved conflict | Unresolved | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.6-cyber | New "Cyber models" (Daybreak program) discovery. Restricted access — requires separate program enrollment for authorized vulnerability research. Standard-tier price is confirmed identically by both sources; NOT added to the pricing file pending resolution of the long-context conflict. See provider-sources-and-price-keys.md. |
| OpenAI | gpt-5.5-cyber | Input $12.50/MTok, Cached $1.25/MTok, Output $75.00/MTok; no cache write shown | No | No dedicated model page (404) to confirm tiering; aggregate table shows no long-context row | No — unconfirmed | Unresolved | https://developers.openai.com/api/docs/pricing | New "Cyber models" (Daybreak program) discovery, restricted access. Dedicated model page 404s, so context window/output limit/tiering are unconfirmed. NOT added to the pricing file. See provider-sources-and-price-keys.md. |
| OpenAI | gpt-5.5-2026-04-23 (alias gpt-5.5) | Input $5/MTok, Cached $0.50/MTok, Output $30/MTok | Yes | Large Context (>272K): $10/$1.00/$45 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. No cache-write pricing for this model. |
| OpenAI | gpt-5.5-pro-2026-04-23 (alias gpt-5.5-pro) | Input $30/MTok, Output $180/MTok; no cache | Yes | Large Context (>272K): $60/$270 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4 | Input $2.50/MTok, Cached $0.25/MTok, Output $15/MTok | Yes | Large Context (>272K): $5.00/$0.50/$22.50 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4-2026-03-05 | Same as gpt-5.4 | Yes | Large Context (>272K): $5.00/$0.50/$22.50 | Yes | None | https://developers.openai.com/api/docs/pricing | Dated snapshot sibling; re-confirmed. |
| OpenAI | gpt-5.4-pro | Input $30/MTok, Output $180/MTok; no cache | Yes | Large Context (>272K): $60/$270 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4-pro-2026-03-05 | Same as gpt-5.4-pro | Yes | Large Context (>272K): $60/$270 | Yes | None | https://developers.openai.com/api/docs/pricing | Dated snapshot sibling; re-confirmed. |
| OpenAI | gpt-5.4-mini | Input $0.75/MTok, Cached $0.075/MTok, Output $4.50/MTok | Yes | No large-context tier (dashes confirmed) | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4-mini-2026-03-17 | Same as gpt-5.4-mini | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Dated snapshot sibling; re-confirmed. |
| OpenAI | gpt-5.4-nano | Input $0.20/MTok, Cached $0.02/MTok, Output $1.25/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4-nano-2026-03-17 | Same as gpt-5.4-nano | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Dated snapshot sibling; re-confirmed. |
| OpenAI | gpt-5.3-codex | Input $1.75/MTok, Cached $0.175/MTok, Output $14.00/MTok | Yes | No large-context tier (400k context window, single tier) | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.2-2025-12-11 (alias gpt-5.2) | Input $1.75/MTok, Cached $0.175/MTok, Output $14.00/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.1-2025-11-13 | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-2025-08-07 | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-mini-2025-08-07 | Input $0.25/MTok, Cached $0.025/MTok, Output $2/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-nano-2025-08-07 | Input $0.05/MTok, Cached $0.005/MTok, Output $0.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-pro-2025-10-06 | Input $15/MTok, Output $120/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged via full standard-pricing-table dump. |
| OpenAI | gpt-5.2-pro-2025-12-11 | Input $21/MTok, Output $168/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged via full standard-pricing-table dump. |
| OpenAI | gpt-4.1-2025-04-14 | Input $2/MTok, Cached $0.50/MTok, Output $8/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4.1-mini-2025-04-14 | Input $0.40/MTok, Cached $0.10/MTok, Output $1.60/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4.1-nano-2025-04-14 | Input $0.10/MTok, Cached $0.025/MTok, Output $0.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4o-2024-08-06 | Input $2.50/MTok, Cached $1.25/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4o-2024-05-13 | Input $5/MTok, Output $15/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full table dump; matches existing file value exactly. |
| OpenAI | gpt-4o-mini-2024-07-18 | Input $0.15/MTok, Cached $0.075/MTok, Output $0.60/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o1 | Input $15/MTok, Cached $7.50/MTok, Output $60/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full table dump; matches existing file value exactly. |
| OpenAI | o1-pro | Input $150/MTok, Output $600/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full table dump; matches existing file value exactly. |
| OpenAI | o3-pro | Input $20/MTok, Output $80/MTok; no cache | Yes | No large-context tier (200k context window) | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full table dump; matches existing file value exactly. |
| OpenAI | o3-2025-04-16 | Input $2/MTok, Cached $0.50/MTok, Output $8/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o3-mini-2025-01-31 | Input $1.10/MTok, Cached $0.55/MTok, Output $4.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o4-mini-2025-04-16 | Input $1.10/MTok, Cached $0.275/MTok, Output $4.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4-turbo-2024-04-09 | Input $10/MTok, Output $30/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full table dump; matches existing file value exactly. |
| OpenAI | gpt-4-0613 | Input $30/MTok, Output $60/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full table dump; matches existing file value exactly. |
| OpenAI | gpt-3.5-turbo | Input $0.50/MTok, Output $1.50/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-3.5-turbo-0125 | Input $0.50/MTok, Output $1.50/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full table dump; matches existing file value exactly. |
| OpenAI | gpt-3.5-turbo-1106 | Input $1.00/MTok, Output $2.00/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full table dump; matches existing file value exactly. |
| OpenAI | gpt-3.5-turbo-instruct | Input $1.50/MTok, Output $2.00/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full table dump; matches existing file value exactly. |
| OpenAI | davinci-002 | Input $2.00/MTok, Output $2.00/MTok (base/non-fine-tuned inference); no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full table dump; matches existing (corrected) file value. |
| OpenAI | babbage-002 | Input $0.40/MTok, Output $0.40/MTok (base/non-fine-tuned inference); no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed via full table dump; matches existing (corrected) file value. |
| OpenAI | gpt-5-chat-latest | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | No | No provider tiering | Not applicable | None | https://developers.openai.com/api/docs/models/gpt-5-chat-latest | Not re-verified this run (not present in the full standard-table dump, which does not include this alias); retained from July 2026 audit. |
| Google | gemini-2.5-flash | Input $0.30/MTok, Audio $1/MTok, Output $2.50/MTok, Cache read $0.03/MTok (audio $0.10/MTok) | Yes | No large-context tier | Yes | None | https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-2.5-flash-lite | Input $0.10/MTok, Audio $0.30/MTok, Output $0.40/MTok, Cache read $0.01/MTok (audio $0.03/MTok) | Yes | No large-context tier | Yes | None | https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-2.5-pro | Input $1.25/$2.50 MTok (≤200K/>200K), Output $10/$15 | Yes | Large Context (>200K) confirmed | Yes | None | https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. Cache-read cell not distinctly quoted this run; file's $0.125/$0.25 (10% ratio) retained unchanged, consistent with prior confirmations. |
| Google | gemini-3.5-flash | Input $1.50/MTok, Output $9.00/MTok, Cache read $0.15/MTok | Yes | No large-context tier | Yes | None | https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-3.5-flash-lite | Input $0.30/MTok, Output $2.50/MTok, Cache read: not quoted this run | Yes (input/output) | No large-context tier | Yes | None | https://ai.google.dev/gemini-api/docs/pricing | Input/output re-confirmed unchanged. Cache-read cell was not returned by this run's fetch; file's $0.03/MTok (confirmed August 4 2026) retained. |
| Google | gemini-3.1-flash-lite | Input $0.25/$0.50 (text/audio), Output $1.50, Cache read $0.025/$0.05 | Yes | No large-context tier | Yes | None | https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-3.1-flash-lite-preview | Same as GA gemini-3.1-flash-lite | No | No large-context tier | Not applicable | None | https://ai.google.dev/gemini-api/docs/pricing | Not separately listed on official page this run either; not re-verified. |
| Google | gemini-3.1-pro-preview | Input $2/$4 MTok (≤200K/>200K), Output $12/$18, Cache read $0.20/$0.40 | Yes | Large Context (>200K) confirmed | Yes | None | https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged, including cache-read tiering. |
| Google | gemini-3-flash-preview | Input $0.50/$1.00 (text/audio), Output $3.00, Cache read $0.05/$0.10 | Yes | No large-context tier | Yes | None | https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-3-pro-preview | Input $2/$4 MTok (≤200K/>200K), Output $12/$18 | No | Large Context (>200K) set in file | Not applicable | None | https://ai.google.dev/pricing | Still not listed as its own row on the official AI Studio pricing page this run (a "Gemini 3 Pro Image" / Nano Banana Pro row exists but is a distinct image-generation model); existing prices retained, not re-verified. |
| Google | gemini-3.6-flash | Input $0.75/MTok, Output $3.75/MTok, Cache read $0.075/MTok (all through Dec 31, 2026; reverts to $1.50/$7.50/$0.15 from Jan 1, 2027) | Yes | No large-context tier | Yes | None | https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed still on introductory pricing; step-up date unchanged. |
| Google | gemini-3.7-flash | Input $0.75/MTok, Output $3.75/MTok, Cache read $0.075/MTok (all through Dec 31, 2026; reverts to $1.50/$7.50/$0.15 from Jan 1, 2027) | Yes | No large-context tier | Yes | None | https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed still on introductory pricing; step-up date unchanged. |
| Google | gemini-2.0-flash | Input $0.10/MTok, Output $0.40/MTok | No | Deprecated (shut down June 1, 2026) | Not applicable | None | https://ai.google.dev/pricing | Not re-verified this run; retained for backward compatibility. |
| Google | gemini-2.0-flash-001 | Same as gemini-2.0-flash | No | Deprecated (shut down June 1, 2026) | Not applicable | None | https://ai.google.dev/pricing | Not re-verified this run; retained for backward compatibility. |

## Unresolved findings (updated 2026-08-16)

1. **OpenAI "Cyber models" (Daybreak program) — new discovery, not added.**
   `gpt-5.6-cyber` and `gpt-5.5-cyber` are officially priced but restricted-access
   models for authorized cybersecurity vulnerability research. Standard-tier
   pricing is confirmed for `gpt-5.6-cyber` ($12.50/$1.25/$15.625/$75.00 per
   MTok input/cached/cache-write/output) across two sources, but its long-context
   (>272K) tier is contradicted between the model page (says 2x/1.5x applies)
   and the pricing page's own Cyber table (shows dashes = no long-context row).
   `gpt-5.5-cyber` has no dedicated model page (404) to confirm its context
   window or tiering at all. Neither was added this run. `daybreak-blue-latest`
   and `daybreak-red-latest` are documented as aliases "currently" pointing to
   `gpt-5.6-sol` and `gpt-5.6-cyber` respectively — treat as moving targets, not
   stable model IDs, until/unless a future audit confirms they should be matched
   as literal aliases on an existing entry. See provider-sources-and-price-keys.md
   for full detail. Re-fetch both official pages with an explicit request to
   reconcile the long-context conflict before adding these two entries.

2. **claude-opus-4-1-20250805 retirement** — Deprecated, past its originally stated Aug 5
   2026 retirement date but still listed on the official pricing page as "retired, except
   on Bedrock and Google Cloud" this run. File entry retained; no action required, but
   check whether it is fully removed from the official page in the next audit.

3. **AWS Bedrock "Claude 3.5 Sonnet (Public Extended Access)" pricing** — Confirmed real
   in the Aug 4 2026 audit (see provider-sources-and-price-keys.md) but not representable
   in Langfuse's schema because it matches by model-ID string only. No file change should
   be made for this; treat it as a permanent, documented limitation rather than something
   to re-investigate each run. Not re-checked this run (no `aws.amazon.com` fetch performed).

4. **Legacy Claude 3.x / 3.5 / 3.7 models not on the current pricing page** — Not
   re-verified this run (`claude-3.7-sonnet-20250219`, `claude-3.5-sonnet-20241022`,
   `claude-3-5-sonnet-20240620`, `claude-3-opus-20240229`, `claude-3-sonnet-20240229`,
   `claude-3-haiku-20240307`). Existing prices retained. Low priority since these are
   retired/legacy.

5. **gemini-3.1-flash-lite-preview and gemini-3-pro-preview** — Still not separately listed
   on the official AI Studio pricing page. Existing prices retained without fresh
   confirmation. Re-verify if these move from preview to GA or gain their own pricing row.

6. **gemini-3.6-flash / gemini-3.7-flash promotional pricing reverts 2027-01-01** — Both
   models are confirmed on introductory pricing ($0.75/$3.75/MTok input/output, $0.075/MTok
   cache read) "through December 31, 2026", stepping up to $1.50/$7.50/$0.15 "starting
   January 1, 2027". The pricing file currently holds the discounted price (correct for
   now); update both entries to the higher rate on or after 2027-01-01. This is the same
   time-based-tiering limitation previously seen with `claude-sonnet-5` — Langfuse's schema
   cannot express a calendar-date price step, so the file always holds the *currently
   active* rate, not a future one.

7. **OpenAI "cache writes" is still gpt-5.6-family-only among generally-available models** —
   Re-confirmed via the full standard-pricing-table dump, the distinct 1.25x-of-input
   cache-write billing dimension applies only to `gpt-5.6-sol`, `gpt-5.6-terra`,
   `gpt-5.6-luna`, and (per the Cyber table) `gpt-5.6-cyber` — every other checked OpenAI
   model still shows "—" for cache writes. Future audits should re-check this column
   whenever a new OpenAI reasoning model is added.

8. **Base vs. fine-tuning legacy pricing confusion is a real historical bug class** — The
   davinci-002/babbage-002 fix (Aug 7 2026) revealed that OpenAI's pricing page lists the
   *same* base model name in two different tables: the "Standard" table (bare inference
   pricing) and a "Fine-tuning" table (which additionally shows a Training cost plus a
   **different, higher** Input/Output inference rate for legacy fine-tuned models). A
   pricing-file entry whose `matchPattern` matches only the bare model ID (no `ft:` prefix)
   must use the **Standard** table's price, never the Fine-tuning table's price, even
   though both rows share the exact same model name in the source page. Future audits
   touching any OpenAI base model that also has a legacy fine-tuning tier (currently:
   `gpt-3.5-turbo`, `davinci-002`, `babbage-002`, and the fine-tunable snapshots
   `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`, `gpt-4.1-nano-2025-04-14`,
   `gpt-4o-2024-08-06`, `gpt-4o-mini-2024-07-18`, `o4-mini-2025-04-16`) should double-check
   which table a fetched number came from before applying it to the bare (non-`ft:`) entry.

9. **Legacy/embedding/base-completion catalog tail not covered this run** — Entries such as
   `text-ada-001`, `text-babbage-001`, `text-curie-001`, `text-davinci-00{1,2,3}`,
   `text-embedding-*`, the Vertex `*-bison*`/`*-gecko*` PaLM family, `claude-1.x`/`claude-2.x`,
   and `gemini-1.0-*`/`gemini-pro` were not re-fetched this run (consistent with prior
   audits) since they are long-retired and out of the "flagship text/chat/reasoning model"
   scope. If a future task explicitly asks to audit embeddings or PaLM-era models, treat
   this as unverified starting ground, not confirmed.

10. **Gemini modality-specific model catalog expansion (found August 16 2026, not added)** —
    The official Gemini models page now lists several new modality-specific models:
    `gemini-3.1-flash-image`/`gemini-3.1-flash-lite-image` (Nano Banana 2 family, image
    generation), `gemini-3-pro-image` (Nano Banana Pro, image generation), `gemini-omni-flash`
    (video generation), `gemini-3.1-flash-live-preview` (audio-to-audio), and
    `gemini-3.1-flash-tts-preview` (text-to-speech). None were added — they are
    image/audio/video generation endpoints, not text/chat/reasoning models, per the
    audit-scope rule to skip modality-specific endpoints unless explicitly requested.
