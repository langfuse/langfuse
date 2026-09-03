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

**Audit date:** 2026-09-02

All prices listed as `$X / MTok` (per million tokens). Per-token JSON values: divide by 1,000,000.

The 2026-09-02 run re-fetched the full Anthropic pricing table (plus the models-overview
table, model-deprecations page, and the dedicated Mythos 5.1 page), the full OpenAI
standard/Fast-mode/Flex pricing tables (plus dedicated pages for `gpt-5.6-sol`,
`gpt-5.3-codex`, and `gpt-5.6-cyber`), and the Gemini AI Studio pricing/models pages
(with explicit Free/Paid column separation). Three new models were found and added:
`claude-fable-5-1`, `claude-mythos-5-1`, and `gemini-3.8-flash`. One existing entry
gained a previously undocumented tier: `gpt-5.3-codex` (Fast mode). One specialized
model was found and deliberately left unadded: `gpt-5.6-cyber` (restricted
cybersecurity endpoint, Daybreak-program-gated). All other checked rows were
reconfirmed unchanged from the 2026-08-24 snapshot.

| Provider | Model / pricing entry | Pricing checked | Price confirmed | Tiering checked | Tiering correct | Change | Official source(s) | Comments |
| -------- | --------------------- | --------------- | --------------- | --------------- | --------------- | ------ | ------------------ | -------- |
| Anthropic | claude-fable-5-1 | Input $10/MTok, Output $50/MTok, 5m $12.50/MTok, 1h $20/MTok, read $0.25/MTok (0.025x, not the standard 0.1x) | Yes | Flat 1M context; no Fast mode | Yes | Added | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/models/overview | New model, now Anthropic's recommended choice for "demanding reasoning and long-horizon agentic work" (ahead of Fable 5, now listed as legacy). Cache-read discount is 0.025x per an explicit page footnote, not the usual 0.1x. matchPattern mirrors `claude-fable-5` with a `-1` suffix. |
| Anthropic | claude-mythos-5-1 | Same as claude-fable-5-1 | Yes | Flat 1M context; no Fast mode | Yes | Added | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/models/mythos-5-1/overview | Limited availability (Project Glasswing), mirrors claude-mythos-5's simpler API-only matchPattern (no Bedrock/GCP variants). |
| Anthropic | claude-fable-5 | Input $10/MTok, Output $50/MTok, 5m $12.50/MTok, 1h $20/MTok, read $1/MTok | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged; now listed as "legacy (still available)" behind Fable 5.1 but pricing is the same. |
| Anthropic | claude-mythos-5 | Same as claude-fable-5 | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-opus-5 | Input $5/MTok, Output $25/MTok, 5m $6.25/MTok, 1h $10/MTok, read $0.50/MTok | Yes | Flat 1M context; Fast mode $10/$50 confirmed available | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-opus-4-8 | Same as Opus 5, Fast mode $10/$50 confirmed available | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-opus-4-7 | Same as Opus 5 base rate; **Fast mode NOT available** (requests with `speed:"fast"` error) | Yes | Flat 1M context; no Fast mode tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Explicitly confirmed via page text this run. File already correctly has only a Standard tier (no Fast mode) — do not add one without re-checking this page. |
| Anthropic | claude-opus-4-6 | Same as Opus 5 base rate; **Fast mode NOT available** (bills at standard rate) | Yes | Flat 1M context; no Fast mode tier | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Explicitly confirmed via page text this run. File already correctly has only a Standard tier. |
| Anthropic | claude-opus-4-5-20251101 | Same as Opus 5 | Yes | Single Standard tier in file (no separate Large Context tier); page wording on the 1M-flat-context list is ambiguous for 4.5 specifically but the main pricing table shows no separate rate, so the file's single-tier treatment is correct either way | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-opus-4-1-20250805 | Input $15/MTok, Output $75/MTok, 5m $18.75/MTok, 1h $30/MTok, read $1.50/MTok | Yes | Deprecated — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/about-claude/model-deprecations | Still "retired, except on Bedrock and Google Cloud"; deprecations page now shows a firm retirement date of August 5, 2026 (previously open-ended). |
| Anthropic | claude-opus-4-20250514 | Input $15/MTok, Output $75/MTok, 5m $18.75/MTok, 1h $30/MTok, read $1.50/MTok | Yes | Retired except Google Cloud — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing https://platform.claude.com/docs/en/about-claude/model-deprecations | Re-confirmed present; deprecations page shows firm retirement date June 15, 2026. |
| Anthropic | claude-sonnet-5 | Input $2/MTok, Output $10/MTok; 5m $2.50/MTok, 1h $4/MTok, read $0.20/MTok | Yes | Flat 1M context; permanent pricing (no Sep 1 2026 increase) | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged; the $2/$10 permanent-pricing note is still on the page verbatim. |
| Anthropic | claude-sonnet-4-6 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | Flat 1M context | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-sonnet-4-5-20250929 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | No large-context tier (200k hard cap) | Yes | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-sonnet-4-20250514 | Input $3/MTok, Output $15/MTok, 5m $3.75/MTok, 1h $6/MTok, read $0.30/MTok | Yes | Retired except Bedrock/Google Cloud — no tiering | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed present on current page's main table, unchanged. |
| Anthropic | claude-haiku-4-5-20251001 | Input $1/MTok, Output $5/MTok, 5m $1.25/MTok, 1h $2/MTok, read $0.10/MTok | Yes | No large-context tier | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed unchanged. |
| Anthropic | claude-3-5-haiku-20241022 | Input $0.80/MTok, Output $4/MTok, 5m $1/MTok, 1h $1.60/MTok, read $0.08/MTok | Yes | Retired except Bedrock/Google Cloud | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Re-confirmed present, unchanged. |
| Anthropic | claude-3.7-sonnet-20250219 / claude-3.5-sonnet-20241022 / claude-3-5-sonnet-20240620 / claude-3-opus-20240229 / claude-3-sonnet-20240229 / claude-3-haiku-20240307 | Legacy prices retained | No | Not on current page | Not applicable | None | https://platform.claude.com/docs/en/about-claude/pricing | Not re-verified this run; retired, out of "flagship" scope. |
| AWS Bedrock | claude-3-5-sonnet-20240620 / claude-3.5-sonnet-20241022 (Public Extended Access SKU) | $6.00/MTok input, $30.00/MTok output, $7.50/MTok cache write, $0.60/MTok cache read | Yes (confirmed real Aug 4 2026) | Distinct dated SKU, not a context-length tier | Not applicable | Unresolved | https://aws.amazon.com/bedrock/pricing/ | Not re-verified this run; permanent documented limitation (model-ID string match cannot distinguish billing SKU). |
| OpenAI | gpt-5.6-sol | Input $4/MTok, Cached $0.40/MTok, Cache write $5.00/MTok, Output $20/MTok | Yes | Large Context (>272K): $8/$0.80/$10.00/$30; Fast mode 2x base; Flex 0.5x base | Yes | None | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.6-sol | Promotional price cut from Aug 24 2026 reconfirmed still active, still "available at least through November 21, 2026" — re-verify after that date. |
| OpenAI | gpt-5.6-terra | Input $2/MTok, Cached $0.20/MTok, Cache write $2.50/MTok, Output $12/MTok | Yes | Large Context (>272K): $4/$0.40/$5.00/$18 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.6-luna | Input $0.20/MTok, Cached $0.02/MTok, Cache write $0.25/MTok, Output $1.20/MTok | Yes | Large Context (>272K): $0.40/$0.04/$0.50/$1.80 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.6-cyber | Input $12.50/MTok, Cached $1.25/MTok, Cache write $15.625/MTok, Output $75/MTok | Yes | Large Context (>272K) at the same 2x/1.5x multiplier as sol/terra/luna | Yes | Unresolved (deliberately not added) | https://developers.openai.com/api/docs/models/gpt-5.6-cyber | New model found this run: a specialized, Daybreak-program-gated cybersecurity endpoint (Responses API only). Deliberately left out of the pricing file and `types.ts` — see provider-sources-and-price-keys.md for the scope rationale. |
| OpenAI | gpt-5.5-2026-04-23 (alias gpt-5.5) | Input $5/MTok, Cached $0.50/MTok, Output $30/MTok | Yes | Large Context (>272K): $10/$1.00/$45 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.5-pro-2026-04-23 (alias gpt-5.5-pro) | Input $30/MTok, Output $180/MTok; no cache | Yes | Large Context (>272K): $60/$270 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4 (and dated snapshot gpt-5.4-2026-03-05) | Input $2.50/MTok, Cached $0.25/MTok, Output $15/MTok | Yes | Large Context (>272K): $5.00/$0.50/$22.50 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4-pro (and dated snapshot) | Input $30/MTok, Output $180/MTok; no cache | Yes | Large Context (>272K): $60/$270 | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4-mini (and dated snapshot) | Input $0.75/MTok, Cached $0.075/MTok, Output $4.50/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.4-nano (and dated snapshot) | Input $0.20/MTok, Cached $0.02/MTok, Output $1.25/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.3-codex | Input $1.75/MTok, Cached $0.175/MTok, Output $14.00/MTok | Yes | No large-context tier (400k context window); Fast mode $3.50/$0.35/$28.00 | Yes | Updated | https://developers.openai.com/api/docs/pricing https://developers.openai.com/api/docs/models/gpt-5.3-codex | Standard price unchanged. Added a previously-undocumented Fast mode tier found in the aggregate pricing page's "Specialized models" Fast-mode section (not on the model's own dedicated page). Also completed the Standard tier's alias set (`cache_read_input_tokens`, `reasoning_tokens`) to match the mature OpenAI reasoning-model template. |
| OpenAI | gpt-5.2-2025-12-11 | Input $1.75/MTok, Cached $0.175/MTok, Output $14.00/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.2-pro-2025-12-11 | Input $21/MTok, Output $168/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5.1-2025-11-13 | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-2025-08-07 | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-mini-2025-08-07 | Input $0.25/MTok, Cached $0.025/MTok, Output $2/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-nano-2025-08-07 | Input $0.05/MTok, Cached $0.005/MTok, Output $0.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-pro-2025-10-06 | Input $15/MTok, Output $120/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-5-chat-latest | Input $1.25/MTok, Cached $0.125/MTok, Output $10/MTok | No | No provider tiering (128,000 token context window) | Not applicable | None | https://developers.openai.com/api/docs/models/gpt-5-chat-latest | Not independently re-fetched this run (last confirmed 2026-08-21); still absent from the aggregate table by design. |
| OpenAI | gpt-4.1-2025-04-14 | Input $2/MTok, Cached $0.50/MTok, Output $8/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4.1-mini-2025-04-14 | Input $0.40/MTok, Cached $0.10/MTok, Output $1.60/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4.1-nano-2025-04-14 | Input $0.10/MTok, Cached $0.025/MTok, Output $0.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4o-2024-08-06 | Input $2.50/MTok, Cached $1.25/MTok, Output $10/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4o-2024-05-13 | Input $5/MTok, Output $15/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4o-mini-2024-07-18 | Input $0.15/MTok, Cached $0.075/MTok, Output $0.60/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o1 | Input $15/MTok, Cached $7.50/MTok, Output $60/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o1-pro | Input $150/MTok, Output $600/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o3-pro | Input $20/MTok, Output $80/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o3-2025-04-16 | Input $2/MTok, Cached $0.50/MTok, Output $8/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o3-mini-2025-01-31 | Input $1.10/MTok, Cached $0.55/MTok, Output $4.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | o4-mini-2025-04-16 | Input $1.10/MTok, Cached $0.275/MTok, Output $4.40/MTok | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4-turbo-2024-04-09 | Input $10/MTok, Output $30/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-4-0613 | Input $30/MTok, Output $60/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-3.5-turbo / gpt-3.5-turbo-0125 | Input $0.50/MTok, Output $1.50/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-3.5-turbo-1106 | Input $1.00/MTok, Output $2.00/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | gpt-3.5-turbo-instruct | Input $1.50/MTok, Output $2.00/MTok; no cache | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | davinci-002 | Input $2.00/MTok, Output $2.00/MTok (base/non-fine-tuned) | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| OpenAI | babbage-002 | Input $0.40/MTok, Output $0.40/MTok (base/non-fine-tuned) | Yes | No large-context tier | Yes | None | https://developers.openai.com/api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-2.5-flash | Input $0.30 (text/image/video) $1.00 (audio), Output $2.50, Cache read $0.03/$0.10 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-2.5-flash-lite | Input $0.10 (text/image/video) $0.30 (audio), Output $0.40, Cache read $0.01/$0.03 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-2.5-pro | Input $1.25/$2.50 (≤200k/>200k), Output $10/$15, Cache read $0.125/$0.25 | Yes | Large Context (>200K) confirmed | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. Also confirmed the file correctly omits grounding keys for this model (2.5-family grounding is $35/1,000, a different rate from 3.x's $14/1,000 — no shared-constant bug). |
| Google | gemini-3.5-flash | Input $1.50, Output $9.00, Cache read $0.15 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged. |
| Google | gemini-3.5-flash-lite | Input $0.30 (text/image/video/audio), Output $2.50, Cache read $0.03 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed unchanged via this run's targeted Paid-tier fetch. |
| Google | gemini-3.1-flash-lite | Input $0.25/$0.50 (text/audio), Output $1.50, Cache read $0.025/$0.05 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Re-confirmed unchanged. |
| Google | gemini-3.1-flash-lite-preview | Same as GA gemini-3.1-flash-lite | No | No large-context tier | Not applicable | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/models | Still not separately listed on either official page; not re-verified independently. |
| Google | gemini-3.1-pro-preview | Input $2/$4 (≤200k/>200k), Output $12/$18 | Yes | Large Context (>200K) confirmed | Yes | None | https://ai.google.dev/pricing | Re-confirmed unchanged. |
| Google | gemini-3-flash-preview | Input $0.50/$1.00 (text/audio), Output $3.00, Cache read $0.05/$0.10 | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing | Re-confirmed unchanged. |
| Google | gemini-3-pro-preview | Input $2/$4 (≤200k/>200k), Output $12/$18 | No | Large Context (>200K) set in file | Not applicable | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/models | Still not listed on either official page this run; existing prices retained, not re-verified. |
| Google | gemini-3.6-flash | Input $0.75, Output $3.75, Cache read $0.075 (all through Dec 31, 2026; reverts to $1.50/$7.50/$0.15 from Jan 1, 2027) | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing | Re-confirmed still on introductory pricing; wording and step-up date unchanged. Now the "previous-generation" Flash model behind gemini-3.7-flash and gemini-3.8-flash. |
| Google | gemini-3.7-flash | Same introductory pricing/step-up date as gemini-3.6-flash | Yes | No large-context tier | Yes | None | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/models | Re-confirmed unchanged; description changed from "New Stable" to "previous-generation" now that gemini-3.8-flash is GA. |
| Google | gemini-3.8-flash | Input $0.75, Output $3.75, Cache read $0.075 (through Dec 31, 2026; steps to $1.50/$7.50/$0.15 Jan 1, 2027) | Yes | No large-context tier | Yes | Added | https://ai.google.dev/pricing https://ai.google.dev/gemini-api/docs/pricing https://ai.google.dev/gemini-api/docs/models | New "New Stable" GA model, direct successor to gemini-3.7-flash, described as engineered "for long-horizon software engineering, autonomous agents, and complex enterprise workflows." Same intro pricing and Jan 1 2027 step-up as 3.6/3.7-flash. Added mirroring the gemini-3.7-flash key set exactly, and to `vertexAIModels`/`googleAIStudioModels` (not first entry). |
| Google | gemini-2.0-flash / gemini-2.0-flash-001 | Input $0.10, Output $0.40 | No | Deprecated (shut down June 1, 2026) | Not applicable | None | https://ai.google.dev/pricing | Not re-verified this run; retained for backward compatibility. |

## Unresolved findings (updated 2026-09-02)

1. **claude-opus-4-1-20250805 / claude-opus-4-20250514 retirement** — Both still listed
   as "retired, except on Bedrock and Google Cloud" (Opus 4.1) or "except on Google
   Cloud" (Opus 4) on the main pricing page, but the model-deprecations page now shows
   firm past retirement dates (August 5, 2026 and June 15, 2026 respectively). Entries
   retained; re-check whether they are fully removed from the pricing page in the next
   audit.

2. **AWS Bedrock "Claude 3.5 Sonnet (Public Extended Access)" pricing** — Confirmed real
   (Aug 4 2026) but not representable in Langfuse's schema (model-ID string match only).
   Permanent, documented limitation; not re-checked this run.

3. **Legacy Claude 3.x / 3.5 / 3.7 models not on the current pricing page** — Not
   re-verified this run (`claude-3.7-sonnet-20250219`, `claude-3.5-sonnet-20241022`,
   `claude-3-5-sonnet-20240620`, `claude-3-opus-20240229`, `claude-3-sonnet-20240229`,
   `claude-3-haiku-20240307`). Existing prices retained. Low priority, retired/legacy.

4. **gemini-3.1-flash-lite-preview and gemini-3-pro-preview** — Still not separately
   listed on the official AI Studio pricing or models pages. Existing prices retained
   without fresh confirmation. Re-verify if these move from preview to GA.

5. **gemini-3.6-flash / gemini-3.7-flash / gemini-3.8-flash promotional pricing reverts
   2027-01-01** — All three models are confirmed on introductory pricing ($0.75/$3.75/MTok
   input/output, $0.075/MTok cache read) "through December 31, 2026," stepping up to
   $1.50/$7.50/$0.15 "starting January 1, 2027." The pricing file currently holds the
   discounted price (correct for now); update all three entries to the higher rate on or
   after 2027-01-01. Same time-based-tiering limitation previously seen with
   `claude-sonnet-5` — Langfuse's schema cannot express a calendar-date price step, so the
   file always holds the currently active rate.

6. **OpenAI "cache writes" is still gpt-5.6-family-only (now four members)** — The
   distinct 1.25x-of-input cache-write billing dimension applies to `gpt-5.6-sol`,
   `gpt-5.6-terra`, `gpt-5.6-luna`, and the newly found (but deliberately unadded)
   `gpt-5.6-cyber`. Every other checked OpenAI model still shows "—" for cache writes.
   Re-check this column whenever a new OpenAI reasoning model is added.

7. **Base vs. fine-tuning legacy pricing confusion is a real historical bug class** — See
   the davinci-002/babbage-002 fix (Aug 7 2026). When auditing any OpenAI base model that
   also has a legacy fine-tuning tier (`gpt-3.5-turbo`, `davinci-002`, `babbage-002`, and
   the fine-tunable snapshots `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`,
   `gpt-4.1-nano-2025-04-14`, `gpt-4o-2024-08-06`, `gpt-4o-mini-2024-07-18`,
   `o4-mini-2025-04-16`), confirm which table a fetched price came from before applying it
   to the bare (non-`ft:`) entry.

8. **Legacy/embedding/base-completion catalog tail not covered this run** — Entries such
   as `text-ada-001`, `text-babbage-001`, `text-curie-001`, `text-davinci-00{1,2,3}`,
   `text-embedding-*`, the Vertex `*-bison*`/`*-gecko*` PaLM family, `claude-1.x`/`claude-2.x`,
   and `gemini-1.0-*`/`gemini-pro` were not re-fetched this run, consistent with prior
   audits, since they are long-retired and out of the "flagship text/chat/reasoning model"
   scope.

9. **Gemini and OpenAI specialized-modality/restricted-access model waves confirmed out
   of scope** — `gemini-omni-flash`, `gemini-3.1-flash-live-preview`,
   `gemini-3.1-flash-tts-preview`, `gemini-3.5-live-translate-preview`, the
   `veo-3.1-*-generate-preview` pair, the `lyria-3-*`/`lyria-realtime-exp` family, and
   `gemini-robotics-er-2-preview` (found 2026-08-21, video/audio/TTS/music/robotics
   endpoints) plus `gpt-5.6-cyber` and the `gpt-daybreak-*-latest` aliases (found
   2026-09-02, a gated specialized cybersecurity endpoint and floating aliases). None
   were added, per the automated-audit rule to skip modality-specific or
   restricted-access endpoints. Re-investigate only if one of them gains a standard
   text-generation mode with open access and its own per-token text pricing.

10. **Selectable models with no matching pricing regex — confirmed still a known,
    intentional gap** — Last fully cross-checked 2026-08-24: `gemini-1.5-pro`,
    `gemini-1.5-flash`, `gemini-1.5-flash-8b`, `gemini-2.0-pro-exp-02-05`,
    `gemini-2.0-flash-exp`, `gemini-2.0-flash-thinking-exp-01-21`,
    `gemini-2.5-flash-preview-09-2025`, `gemini-2.5-flash-lite-preview-09-2025` have no
    matching pricing entry — retired/experimental IDs with no official pricing page
    entry, not a new finding. Not re-run this cycle (no new selectable model was added to
    `types.ts` outside the ones this audit itself added, which do have matching entries).
