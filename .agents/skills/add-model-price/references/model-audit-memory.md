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

**Audit date:** 2026-08-03

All prices listed as `$X / MTok` (per million tokens). Per-token JSON values: divide by 1,000,000.

| Provider | Model / pricing entry | Pricing checked | Price confirmed | Tiering checked | Tiering correct | Change | Official source(s) | Comments |
| -------- | --------------------- | --------------- | --------------- | --------------- | --------------- | ------ | ------------------ | -------- |
| Anthropic | claude-fable-5 | Input $10/MTok, Output $50/MTok, 5m $12.5/MTok, 1h $20/MTok, read $1/MTok | Yes | Flat 1M context — no large-context tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. |
| Anthropic | claude-mythos-5 | Input $10/MTok, Output $50/MTok, 5m $12.5/MTok, 1h $20/MTok, read $1/MTok | Yes | Flat 1M context — no large-context tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. Limited availability (Project Glasswing). |
| Anthropic | claude-opus-5 | Input $5/MTok, Output $25/MTok, 5m $6.25/MTok, 1h $10/MTok, read $0.50/MTok | Yes | Flat 1M context — no large-context tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. Fast mode $10/$50 MTok. |
| Anthropic | claude-opus-4-8 | Input $5/MTok, Output $25/MTok, 5m $6.25/MTok, 1h $10/MTok, read $0.50/MTok | Yes | Flat 1M context — no large-context tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. |
| Anthropic | claude-opus-4-7 | Input $5/MTok, Output $25/MTok, 5m $6.25/MTok, 1h $10/MTok, read $0.50/MTok | Yes | Flat 1M context — no large-context tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. |
| Anthropic | claude-opus-4-6 | Input $5/MTok, Output $25/MTok, 5m $6.25/MTok, 1h $10/MTok, read $0.50/MTok | Yes | Flat 1M context — no large-context tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. `inference_geo: "us"` adds 1.1× multiplier for this and later models. |
| Anthropic | claude-opus-4-5-20251101 | Input $5/MTok, Output $25/MTok, 5m $6.25/MTok, 1h $10/MTok, read $0.50/MTok | Yes | Flat 1M context — no large-context tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. Alias `claude-opus-4-5` covered by matchPattern. |
| Anthropic | claude-opus-4-1-20250805 | Input $15/MTok, Output $75/MTok, 5m $18.75/MTok, 1h $30/MTok, read $1.50/MTok | Yes | Deprecated — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Deprecated model, still listed on official page. Retained for backward pricing compatibility. |
| Anthropic | claude-opus-4-20250514 | Input $15/MTok, Output $75/MTok, 5m $18.75/MTok, 1h $30/MTok, read $1.50/MTok | Yes | Retired, except Google Cloud — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged; still listed as retired-except-Google-Cloud row on official page. |
| Anthropic | claude-sonnet-5 | Input $2/MTok (through Aug 31 2026), Output $10/MTok, 5m $2.50/MTok, 1h $4/MTok, read $0.20/MTok | Yes | Flat 1M context; introductory pricing through Aug 31 2026, then $3/$15 with cache $3.75/$6/$0.30 | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. File must be updated to standard pricing on/after Sep 1 2026. |
| Anthropic | claude-sonnet-4-6 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | Flat 1M context — no large-context tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. |
| Anthropic | claude-sonnet-4-5-20250929 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | Large Context >200K tier in file (2× input/1.5× output) — not on Anthropic's flat long-context list and not separately published by Anthropic | No | None | https://platform.claude.com/docs/en/about-claude/pricing | Base prices confirmed unchanged. Large Context tier still unresolved (see below) — unchanged from prior audits. |
| Anthropic | claude-sonnet-4-20250514 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | Retired except Bedrock/Google Cloud — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. |
| Anthropic | claude-haiku-4-5-20251001 | Input $1/MTok, Output $5/MTok, 5m $1.25/MTok, 1h $2/MTok, read $0.10/MTok | Yes | No large-context tier | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. |
| Anthropic | claude-3-5-haiku-20241022 | Input $0.80/MTok, Output $4/MTok, 5m $1/MTok, 1h $1.60/MTok, read $0.08/MTok | Yes | Retired except Bedrock/Google Cloud — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Confirmed unchanged. |
| Anthropic | claude-3-5-sonnet-20241022 / claude-3-5-sonnet-20240620 (Bedrock cross-check) | Standard API $3/$15 MTok (file); investigated a separate Bedrock "Public Extended Access" SKU at $6/$30 MTok | No (Bedrock SKU price, not the file's modeled price) | Not applicable | Not applicable | None | https://aws.amazon.com/bedrock/pricing/ https://platform.claude.com/docs/en/about-claude/pricing | Anthropic's current pricing page no longer lists these model rows directly (legacy). A targeted Bedrock pricing fetch confirmed a real "Claude 3.5 Sonnet (Public Extended Access, Effective 1 Dec 2025)" row at $6/$30 MTok — double the file's $3/$15 — but the exact Bedrock model ID for that SKU (vs. the standard on-demand SKU) is unknown, so no file change was made. See provider-sources-and-price-keys.md for the full writeup. |
| OpenAI | gpt-5.6-sol | Input $5/MTok, Cached $0.50/MTok, Output $30/MTok | Yes | Large Context (>272K): $10/$1.00/$45 | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-5.6-terra | Input $2/MTok, Cached $0.20/MTok, Output $12/MTok | Yes | Large Context (>272K): $4/$0.40/$18 | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged (July 31 2026 price cut holds). |
| OpenAI | gpt-5.6-luna | Input $0.20/MTok, Cached $0.02/MTok, Output $1.20/MTok | Yes | Large Context (>272K): $0.40/$0.04/$1.80 | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged (July 31 2026 price cut holds). |
| OpenAI | gpt-5.5 / gpt-5.5-2026-04-23 | Input $5/MTok, Cached $0.50/MTok, Output $30/MTok | Yes | Large Context (>272K): input $10, cached $1.00, output $45 per MTok | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.5 | Added missing Large Context (>272K) tier — resolves prior unresolved threshold finding. |
| OpenAI | gpt-5.5-pro / gpt-5.5-pro-2026-04-23 | Input $30/MTok, Output $180/MTok; no cached-input discount | Yes | No tiering (flat, confirmed via dedicated model page) | Yes | None | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.5-pro | Confirmed flat, no large-context tier exists for this model. |
| OpenAI | gpt-5.4 | Input $2.50/MTok, Cached $0.25/MTok, Output $15/MTok | Yes | Large Context (>272K): input $5, cached $0.50, output $22.50 per MTok | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.4 | Added missing Large Context (>272K) tier — resolves prior unresolved threshold finding. |
| OpenAI | gpt-5.4-2026-03-05 | Input $2.50/MTok, Cached $0.25/MTok, Output $15/MTok | Yes | Large Context (>272K): input $5, cached $0.50, output $22.50 per MTok | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.4 | Dated snapshot of gpt-5.4; same Large Context tier added. |
| OpenAI | gpt-5.4-mini | Input $0.75/MTok, Cached $0.075/MTok, Output $4.50/MTok | Yes | No tiering evidence found | Not applicable | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged; no long-context column shown for mini/nano variants. |
| OpenAI | gpt-5.4-nano | Input $0.20/MTok, Cached $0.02/MTok, Output $1.25/MTok | Yes | No tiering evidence found | Not applicable | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-5.3-codex | Input $1.75/MTok, Cached $0.175/MTok, Output $14.00/MTok | Yes | No large-context tier; 400K context window | Yes | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged. |
| OpenAI | gpt-5 | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | Yes | No tiering | Not applicable | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged; matches file exactly. |
| OpenAI | o1 | Input $15/MTok, Cached $7.50/MTok, Output $60/MTok | Yes | No tiering | Not applicable | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged; matches file exactly. |
| OpenAI | o3 | Input $2/MTok, Cached $0.50/MTok, Output $8/MTok | Yes | No tiering | Not applicable | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged; matches file exactly. |
| OpenAI | o3-mini | Input $1.10/MTok, Cached $0.55/MTok, Output $4.40/MTok | Yes | No tiering | Not applicable | None | https://developers.openai.com/api/docs/pricing | Confirmed unchanged; matches file exactly. |
| Google | gemini-2.5-flash | Input $0.30/MTok, Audio $1/MTok, Output $2.50/MTok, Cache read $0.03/MTok | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. Audio-specific cache-read price not separately represented in the file (pre-existing gap, not actioned). |
| Google | gemini-2.5-flash-lite | Input $0.10/MTok, Audio $0.30/MTok, Output $0.40/MTok, Cache read $0.01/MTok | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-2.5-pro | Input $1.25/$2.50 MTok (≤200K/>200K), Output $10/$15 MTok, Cache read $0.125/MTok ≤200K | Yes | Large Context (>200K) confirmed | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-3.5-flash | Input $1.50/MTok, Output $9.00/MTok, Cache read $0.15/MTok | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-3.5-flash-lite | Input $0.30/MTok, Output $2.50/MTok, Cache read $0.03/MTok (NEW) | Yes | No large-context tier | Yes | Updated | https://ai.google.dev/pricing | Added missing context-caching price. Two independent verbatim-quote fetches confirmed the paid tier has caching at $0.03/MTok (10% of input) plus a non-representable $1.00/MTok/hour storage fee — reverses the "Not available" finding from the July 2026 audits, which likely hit the same free/paid column-collapse bug already fixed for gemini-3.1-flash-lite. |
| Google | gemini-3.1-pro-preview | Input $2/$4 MTok (≤200K/>200K), Output $12/$18 MTok, Cache read $0.20/$0.40 MTok | Yes | Large Context (>200K) confirmed | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-3.1-flash-lite | Input $0.25/MTok (text/image/video), $0.50/MTok (audio), Output $1.50/MTok, Cache read $0.025/$0.05 MTok | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-3-flash-preview | Input $0.50/MTok, Audio $1/MTok, Output $3/MTok, Cache read $0.05/MTok | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| Google | gemini-3.6-flash | Input $1.50/MTok, Output $7.50/MTok, Cache read $0.15/MTok | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Confirmed unchanged. |
| OpenAI (discovery) | gpt-5.7 / gpt-6 / o4 / o5 (searched, not found) | N/A | No | Not applicable | Not applicable | Unresolved | https://developers.openai.com/api/docs/models/all | Checked the full model catalog page for any newer flagship family beyond GPT-5.6/GPT-5.3-codex; none found as of this audit. |

## Unresolved findings (updated 2026-08-03)

1. **claude-sonnet-4-5-20250929 Large Context tier** — The file has a Large Context (>200K)
   tier for this model. The official Anthropic page still does not explicitly publish
   per-tier pricing for this model separately. Unchanged since the July 2026 audits; future
   audits should keep verifying.

2. **claude-sonnet-5 introductory pricing** — Introductory pricing ($2/$10/MTok) expires
   August 31, 2026. Standard pricing ($3/$15/MTok, cache $3.75/$6/$0.30) takes effect
   September 1, 2026. The pricing file must be updated on or after that date.

3. **claude-opus-4-1-20250805 retirement** — Deprecated; the Anthropic page still lists it
   with a "deprecated" tag rather than fully removing it. File entry retained for backward
   pricing compatibility. No action required.

4. **AWS Bedrock "Claude 3.5 Sonnet (Public Extended Access)" pricing anomaly** — Confirmed
   real via a targeted (non-summarized) Bedrock pricing page fetch on August 3 2026: $6.00/MTok
   input, $30.00/MTok output — double the standard $3/$15 rate the file uses for
   `claude-3-5-sonnet-20240620` / `claude-3.5-sonnet-20241022`. Still not actionable: the exact
   Bedrock model ID string this SKU reports in usage data is unknown. Future audits should
   look for the specific Bedrock model ID tied to "Public Extended Access" access before
   deciding whether it needs its own pricing entry.

5. **gemini-2.5-flash / gemini-2.5-flash-lite audio-modality cache-read pricing** — Google's
   pricing page shows a separate (higher) cache-read price for audio input on these models,
   but the pricing file only has one `input_cached_tokens` / `cached_content_token_count` key
   (matching the text/image/video cache-read price). This is a pre-existing, long-standing gap
   (not newly introduced) and was not actioned this run; flagging for future audits to decide
   whether Langfuse's schema should add an audio-specific cache-read key.
