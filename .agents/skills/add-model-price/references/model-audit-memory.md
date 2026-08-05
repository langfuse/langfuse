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

**Audit date:** 2026-08-04

All prices listed as `$X / MTok` (per million tokens). Per-token JSON values: divide by 1,000,000.

| Provider | Model / pricing entry | Pricing checked | Price confirmed | Tiering checked | Tiering correct | Change | Official source(s) | Comments |
| -------- | --------------------- | --------------- | --------------- | --------------- | --------------- | ------ | ------------------ | -------- |
| Anthropic | claude-fable-5 | Input $10/MTok, Output $50/MTok, 5m $12.50/MTok, 1h $20/MTok, read $1/MTok | Yes | Flat 1M context at standard pricing | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed via full pricing table fetch. |
| Anthropic | claude-mythos-5 | Same as Fable 5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Limited availability (Project Glasswing). Confirmed. |
| Anthropic | claude-opus-5 | Input $5/MTok, Output $25/MTok, 5m $6.25/MTok, 1h $10/MTok, read $0.50/MTok | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed. Fast mode $10/$50 MTok. |
| Anthropic | claude-opus-4-8 | Same as Opus 5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed. |
| Anthropic | claude-opus-4-7 | Same as Opus 5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed. |
| Anthropic | claude-opus-4-6 | Same as Opus 5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed. `inference_geo: "us"` adds 1.1x. |
| Anthropic | claude-opus-4-5-20251101 | Same as Opus 5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed. |
| Anthropic | claude-opus-4-1-20250805 | Input $15/MTok, Output $75/MTok, 5m $18.75/MTok, 1h $30/MTok, read $1.50/MTok | Yes | Deprecated — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Deprecated, retires August 5, 2026 (tomorrow as of this audit). Still listed on official page; entry retained. |
| Anthropic | claude-opus-4-20250514 | Input $15/MTok, Output $75/MTok, 5m $18.75/MTok, 1h $30/MTok, read $1.50/MTok | Yes | Retired except Google Cloud — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed present on current page's main table this run (row: "Claude Opus 4 (retired, except on Google Cloud)"), correcting a prior audit's belief it was absent from the page. |
| Anthropic | claude-sonnet-5 | Input $2/MTok, Output $10/MTok (through Aug 31, 2026); 5m $2.50/MTok, 1h $4/MTok, read $0.20/MTok | Yes | Flat 1M context; introductory pricing through Aug 31 2026 | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Standard pricing $3/$15 (cache $3.75/$6/$0.30) takes effect Sep 1, 2026 — update the file then. |
| Anthropic | claude-sonnet-4-6 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed. |
| Anthropic | claude-sonnet-4-5-20250929 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | No large-context tier (200k hard context-window cap) | Yes | Updated | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/build-with-claude/context-windows | Removed an incorrect "Large Context (>200K)" tier. The context-windows page confirms Sonnet 4.5 has a hard 200k-token context window (not on the 1M list) and that exceeding it returns a 400 error rather than being billed at a premium, so the tier's condition could never legitimately fire. Resolves a finding left unresolved since at least the June 2026 audit. |
| Anthropic | claude-sonnet-4-20250514 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | Retired except Bedrock/Google Cloud — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed present on current page's main table this run. |
| Anthropic | claude-haiku-4-5-20251001 | Input $1/MTok, Output $5/MTok, 5m $1.25/MTok, 1h $2/MTok, read $0.10/MTok | Yes | No large-context tier (200k context window, not on flat 1M list) | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed. |
| Anthropic | claude-3-5-haiku-20241022 | Input $0.80/MTok, Output $4/MTok, 5m $1/MTok, 1h $1.60/MTok, read $0.08/MTok | Yes | Retired except Bedrock/Google Cloud | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed present on current page's main table this run ("Claude Haiku 3.5"). |
| Anthropic | claude-3.7-sonnet-20250219 | Input $3/MTok, Output $15/MTok, cache $3.75/$6/$0.30 | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not on current page this run either. Legacy prices retained, not re-verified. |
| Anthropic | claude-3.5-sonnet-20241022 | Input $3/MTok, Output $15/MTok, cache $3.75/$6/$0.30 | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run. Legacy prices retained. Bedrock has a separate, higher "Public Extended Access" SKU — see comments on Bedrock below; not representable in the schema. |
| Anthropic | claude-3-5-sonnet-20240620 | Input $3/MTok, Output $15/MTok, cache $3.75/$6/$0.30 | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run. Legacy prices retained. Same Bedrock Public Extended Access caveat as v2 above. |
| Anthropic | claude-3-opus-20240229 | Input $15/MTok, Output $75/MTok | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run. Legacy. |
| Anthropic | claude-3-sonnet-20240229 | Input $3/MTok, Output $15/MTok | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run. Legacy. |
| Anthropic | claude-3-haiku-20240307 | Input $0.25/MTok, Output $1.25/MTok | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run. Legacy. |
| AWS Bedrock | claude-3-5-sonnet-20240620 / claude-3.5-sonnet-20241022 (Public Extended Access SKU) | $6.00/MTok input, $30.00/MTok output, $7.50/MTok cache write, $0.60/MTok cache read | Yes (SKU confirmed real) | Distinct dated SKU, not a context-length tier | Not applicable | Unresolved | https://aws.amazon.com/bedrock/pricing/ | Confirmed via targeted verbatim fetch that this is a real, distinct "Public Extended Access, Effective 1 Dec 2025" Bedrock SKU at double the standard $3/$15 rate for the same model IDs. Not actionable: Langfuse's schema matches by model-ID string only and cannot distinguish which Bedrock billing tier a given request used, so no file change was made. Documented as a permanent, confirmed limitation — see provider-sources-and-price-keys.md. |
| OpenAI | gpt-5.6-sol | Input $5/MTok, Cached $0.50/MTok, Cache write $6.25/MTok, Output $30/MTok | Yes | Large Context (>272K): $10/$1.00/$12.50/$45 | Yes | None | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.6-sol | Confirmed cache-write pricing (1.25x input) already correctly present in file. |
| OpenAI | gpt-5.6-terra | Input $2/MTok, Cached $0.20/MTok, Cache write $2.50/MTok, Output $12/MTok | Yes | Large Context (>272K): $4/$0.40/$5.00/$18 | Yes | None | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.6-terra | Confirmed stable since July 31 2026 price cut. |
| OpenAI | gpt-5.6-luna | Input $0.20/MTok, Cached $0.02/MTok, Cache write $0.25/MTok, Output $1.20/MTok | Yes | Large Context (>272K): $0.40/$0.04/$0.50/$1.80 | Yes | None | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.6-luna | Confirmed stable since July 31 2026 price cut. |
| OpenAI | gpt-5.5-2026-04-23 (alias gpt-5.5) | Input $5/MTok, Cached $0.50/MTok, Output $30/MTok | Yes | Large Context (>272K): $10/$1.00/$45 | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.5 | Added Large Context tier (272K threshold now confirmed, resolving a long-standing unresolved finding) plus missing `cache_read_input_tokens`/`reasoning_tokens` aliases. No cache-write pricing for this model (confirmed). |
| OpenAI | gpt-5.5-pro-2026-04-23 (alias gpt-5.5-pro) | Input $30/MTok, Output $180/MTok; no cache | Yes | Large Context (>272K): $60/$270 | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.5-pro | Added Large Context tier plus missing `reasoning_tokens` alias. |
| OpenAI | gpt-5.4 | Input $2.50/MTok, Cached $0.25/MTok, Output $15/MTok | Yes | Large Context (>272K): $5.00/$0.50/$22.50 | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.4 | Added Large Context tier plus missing `cache_read_input_tokens`/`reasoning_tokens` aliases. |
| OpenAI | gpt-5.4-2026-03-05 | Same as gpt-5.4 | Yes | Large Context (>272K): $5.00/$0.50/$22.50 | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.4 | Dated snapshot sibling of gpt-5.4; same fix applied. |
| OpenAI | gpt-5.4-pro | Input $30/MTok, Output $180/MTok; no cache | Yes | Large Context (>272K): $60/$270 | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.4 | Added Large Context tier plus missing `reasoning_tokens` alias. |
| OpenAI | gpt-5.4-pro-2026-03-05 | Same as gpt-5.4-pro | Yes | Large Context (>272K): $60/$270 | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.4 | Dated snapshot sibling; same fix applied. |
| OpenAI | gpt-5.4-mini | Input $0.75/MTok, Cached $0.075/MTok, Output $4.50/MTok | Yes | No large-context tier (dashes confirmed in official table) | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed no large-context tier applies; left unchanged. |
| OpenAI | gpt-5.4-mini-2026-03-17 | Same as gpt-5.4-mini | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Dated snapshot sibling; confirmed unchanged. |
| OpenAI | gpt-5.4-nano | Input $0.20/MTok, Cached $0.02/MTok, Output $1.25/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-5.4-nano-2026-03-17 | Same as gpt-5.4-nano | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Dated snapshot sibling; confirmed unchanged. |
| OpenAI | gpt-5.3-codex | Input $1.75/MTok, Cached $0.175/MTok, Output $14.00/MTok | Yes | No large-context tier (400k context window, single tier) | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-5.2-2025-12-11 | Input $1.75/MTok, Cached $0.175/MTok, Output $14.00/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-5.1-2025-11-13 | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-5-2025-08-07 | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-5-mini-2025-08-07 | Input $0.25/MTok, Cached $0.025/MTok, Output $2/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-5-nano-2025-08-07 | Input $0.05/MTok, Cached $0.005/MTok, Output $0.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-5-pro-2025-10-06 | Input $15/MTok, Output $120/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/models/gpt-5-pro | Confirmed unchanged via dedicated model page. |
| OpenAI | gpt-5.2-pro-2025-12-11 | Input $21/MTok, Output $168/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/models/gpt-5.2-pro | Confirmed unchanged via dedicated model page. |
| OpenAI | gpt-4.1-2025-04-14 | Input $2/MTok, Cached $0.50/MTok, Output $8/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-4.1-mini-2025-04-14 | Input $0.40/MTok, Cached $0.10/MTok, Output $1.60/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-4.1-nano-2025-04-14 | Input $0.10/MTok, Cached $0.025/MTok, Output $0.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-4o-2024-08-06 | Input $2.50/MTok, Cached $1.25/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-4o-mini-2024-07-18 | Input $0.15/MTok, Cached $0.075/MTok, Output $0.60/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | o3-2025-04-16 | Input $2/MTok, Cached $0.50/MTok, Output $8/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | o3-mini-2025-01-31 | Input $1.10/MTok, Cached $0.55/MTok, Output $4.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | o4-mini-2025-04-16 | Input $1.10/MTok, Cached $0.275/MTok, Output $4.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-3.5-turbo | Input $0.50/MTok, Output $1.50/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-5-chat-latest | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | No | No provider tiering | Not applicable | None | https://developers.openai.com/api/docs/models/gpt-5-chat-latest | Not re-verified this run; retained from July 2026 audit. |
| Google | gemini-2.5-flash | Input $0.30/MTok, Audio $1/MTok, Output $2.50/MTok, Cache read $0.03/MTok (audio $0.10/MTok) | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-2.5-flash-lite | Input $0.10/MTok, Audio $0.30/MTok, Output $0.40/MTok, Cache read $0.01/MTok (audio $0.03/MTok) | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-2.5-pro | Input $1.25/$2.50 MTok (≤200K/>200K), Output $10/$15, Cache read $0.125/$0.25 | Yes | Large Context (>200K) confirmed | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-3.5-flash | Input $1.50/MTok, Output $9.00/MTok, Cache read $0.15/MTok | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-3.5-flash-lite | Input $0.30/MTok, Output $2.50/MTok, Cache read $0.03/MTok | Yes | No large-context tier | Yes | Updated | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-added cache-read pricing after two independent verbatim, column-explicit fetches confirmed the Paid tier has context caching at $0.03/MTok (10% of input, matching Google's universal ratio); only the Free tier says "Not available". Reverses the July 22-31 2026 audits' conclusion that caching was unavailable on all tiers — see provider-sources-and-price-keys.md for the full flip-flop history and the lesson learned. |
| Google | gemini-3.1-flash-lite | Input $0.25/$0.50 (text/audio), Output $1.50, Cache read $0.025/$0.05 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-3.1-flash-lite-preview | Same as GA gemini-3.1-flash-lite | No | No large-context tier | Not applicable | None | https://ai.google.dev/pricing | Not separately listed on official page this run either; not re-verified. |
| Google | gemini-3.1-pro-preview | Input $2/$4 MTok (≤200K/>200K), Output $12/$18 | Yes | Large Context (>200K) confirmed | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-3-flash-preview | Input $0.50/$1.00 (text/audio), Output $3.00, Cache read $0.05/$0.10 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-3-pro-preview | Input $2/$4 MTok (≤200K/>200K), Output $12/$18 | No | Large Context (>200K) set in file | Not applicable | None | https://ai.google.dev/pricing | Still not listed on official AI Studio page this run; existing prices retained, not re-verified. |
| Google | gemini-3.6-flash | Input $1.50/MTok, Output $7.50/MTok, Cache read $0.15/MTok | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-2.0-flash | Input $0.10/MTok, Output $0.40/MTok | No | Deprecated (shut down June 1, 2026) | Not applicable | None | https://ai.google.dev/pricing | Not re-verified this run; retained for backward compatibility. |
| Google | gemini-2.0-flash-001 | Same as gemini-2.0-flash | No | Deprecated (shut down June 1, 2026) | Not applicable | None | https://ai.google.dev/pricing | Not re-verified this run; retained for backward compatibility. |

## Unresolved findings (updated 2026-08-04)

1. **claude-sonnet-5 introductory pricing** — Introductory pricing ($2/$10/MTok) expires
   August 31, 2026. Standard pricing ($3/$15/MTok, cache $3.75/$6/$0.30) takes effect
   September 1, 2026. The pricing file must be updated before or on that date.

2. **claude-opus-4-1-20250805 retirement** — Deprecated, retiring August 5, 2026 (i.e. the
   day after this audit). Still listed on the official pricing page as of this run. File
   entry retained for backward pricing compatibility; no action required now, but check
   whether the model is fully removed from the official page in the next audit.

3. **AWS Bedrock "Claude 3.5 Sonnet (Public Extended Access)" pricing** — Confirmed real
   this run (see the dedicated row above and provider-sources-and-price-keys.md), but not
   representable in Langfuse's schema because it matches by model-ID string only. No file
   change should be made for this; treat it as a permanent, documented limitation rather
   than something to re-investigate each run.

4. **Legacy Claude 3.x / 3.5 / 3.7 models not on the current pricing page** — Not
   re-verified this run (`claude-3.7-sonnet-20250219`, `claude-3.5-sonnet-20241022`,
   `claude-3-5-sonnet-20240620`, `claude-3-opus-20240229`, `claude-3-sonnet-20240229`,
   `claude-3-haiku-20240307`). Existing prices retained. Low priority since these are
   retired/legacy, but a future audit could check the model-deprecations page directly if
   there is reason to believe pricing changed.

5. **gemini-3.1-flash-lite-preview and gemini-3-pro-preview** — Still not separately listed
   on the official AI Studio pricing page. Existing prices retained without fresh
   confirmation. Re-verify if these move from preview to GA or gain their own pricing row.

6. **OpenAI "cache writes" may expand beyond the gpt-5.6 family** — As of this audit, the
   distinct 1.25x-of-input cache-write billing dimension applies only to `gpt-5.6-sol`,
   `gpt-5.6-terra`, and `gpt-5.6-luna`. Future audits should re-check the OpenAI pricing
   table's "cache writes" column whenever a new reasoning model is added, since this could
   spread to other model families.
