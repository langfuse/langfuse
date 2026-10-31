# Provider Sources and Price Keys

This file holds current, durable facts for pricing work. When a fact changes,
edit or delete its bullet in place. Do not add dated per-audit entries, restate
prices that are already in `default-model-prices.json`, or record that a page
was re-fetched and nothing changed.

## Official Pricing Sources

Always fetch pricing from the provider's official docs before editing.

| Provider                  | Source                                                                           |
| ------------------------- | -------------------------------------------------------------------------------- |
| Anthropic Claude          | `https://platform.claude.com/docs/en/about-claude/pricing`                       |
| OpenAI                    | `https://developers.openai.com/api/docs/pricing`                                 |
| Google Gemini (AI Studio) | `https://ai.google.dev/pricing`                                                  |
| Google Gemini (Vertex AI) | `https://cloud.google.com/vertex-ai/generative-ai/pricing#gemini-models`         |
| AWS Bedrock               | `https://aws.amazon.com/bedrock/pricing/`                                        |
| Azure OpenAI              | `https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/` |
| TypeSafe (Jev)            | `https://docs.typesafe.ai/models`                                                |

Per-model pages add detail the aggregate tables miss:
`https://developers.openai.com/api/docs/models/<model-id>`,
`https://developers.openai.com/api/docs/models/all`,
`https://platform.claude.com/docs/en/models/overview`,
`https://ai.google.dev/gemini-api/docs/pricing`, and
`https://ai.google.dev/gemini-api/docs/models`.

## Official Model Lifecycle Sources

Use these to decide whether a selectable model is still served. See "Selectable
Model Availability" in `automated-audit.md` for the removal criteria.

- Anthropic Claude: `https://platform.claude.com/docs/en/about-claude/model-deprecations`
- OpenAI: `https://developers.openai.com/api/docs/deprecations`
- Google Gemini (AI Studio): `https://ai.google.dev/gemini-api/docs/models`
  (shut-down models are labeled "Shut down") and
  `https://ai.google.dev/gemini-api/docs/deprecations`
- Google Gemini (Vertex AI):
  `https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions`.
  It redirects to
  `docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions`,
  which is outside the allowed WebFetch domains. Report Vertex lifecycle checks
  as unresolved and do not remove or add Vertex AI entries without other
  official evidence.

## Fetching Official Pages Reliably

- **OpenAI** — `openai.com/api/pricing/` returns HTTP 403 to automated fetchers;
  use `developers.openai.com`. In CI the harness can also block WebFetch. If the
  OpenAI pricing page cannot be fetched, leave OpenAI prices unchanged and
  report it.
- **Ask for verbatim rows, not summaries.** WebFetch summaries collapse columns
  and pick the wrong table. Ask for the literal row for one model ID and name
  the columns you expect.
- **OpenAI aggregate pricing table** — Rows sometimes come back in jumbled order
  or with extra values. Reconcile each number against the model's own page and
  the family multipliers before keeping it. Never average, round, or guess.
- **OpenAI Fast-mode "Specialized models" section** — Codex-family Fast-mode
  prices (for example `gpt-5.3-codex`) appear only in this section of the
  aggregate table, not on the model's own page.
- **`gpt-5-chat-latest`** — Absent from the aggregate table; confirm it on its
  own model page.
- **OpenAI Standard vs. Fine-tuning tables** — Base models with a legacy
  fine-tuning tier (`gpt-3.5-turbo`, `davinci-002`, `babbage-002`, and the
  fine-tunable `gpt-4.1*`, `gpt-4o*`, `o4-mini` snapshots) appear in both
  tables at different rates. Bare entries use the Standard table; `ft:` entries
  use the Fine-tuning table.
- **Gemini Free vs. Paid columns** — `ai.google.dev` pricing tables have a Free
  and a Paid column per row, and summaries regularly report the Free column
  ("Not available", "Free of charge") as the price. Langfuse prices the Paid
  tier. Ask for both columns explicitly and cross-check
  `ai.google.dev/pricing` against `ai.google.dev/gemini-api/docs/pricing` when
  results disagree.
- **Deprecation dates** — Summaries misjudge whether a date is past or future.
  Compare the literal shutdown date with `date -u +%Y-%m-%dT00:00:00.000Z`
  yourself. Ask for the complete list of batch headings on the deprecations
  page, not only the batches you already know, so new batches are not missed.
  The OpenAI model catalog's "Deprecated" badge is not removal evidence; only
  a dated row on the deprecations page is.
- **AWS Bedrock** — WebFetch cannot extract per-model numeric rows from the
  Bedrock pricing page. A Bedrock claim without a quoted number is unconfirmed;
  a qualitative footnote can only corroborate a price from another official
  source.
- **Vertex AI pricing page** — Often returns a truncated page without a usable
  table. Vertex Gemini prices are otherwise assumed to match AI Studio. When an
  official source shows they differ, use the platform-specific price, or leave
  the file unchanged and report it if it is unclear which applies.

## Provider Rules

### Anthropic

- **Context tiers** — Claude 4.6 and later models, except Haiku 5.5, include
  the full 1M-token context at standard pricing and must not have a Large
  Context tier. Sonnet 4.5 and Haiku 4.5 have a hard 200K context window, where
  longer requests fail instead of billing at a premium, so they have no Large
  Context tier either.
- **Claude Haiku 5.5** — Priced by prompt length: prompts over 100,000 tokens
  pay 5x on every rate. Modeled as a usage-detail `gt 100000` tier.
- **Cache multipliers** — The default is 0.1x base input for cache reads, 1.25x
  for 5-minute writes, and 2x for 1-hour writes. The pricing page's cache-hits
  footnote lists the exceptions: Claude Fable 5.1 and Mythos 5.1 read at 0.025x,
  and Claude Opus 5.5 and Sonnet 5.5 read at 0.05x. Re-read the footnote
  whenever a Claude model is added or changed.
- **Fast mode** — The request field is `speed: "fast"`, matched as
  `modelParameters.speed in ["fast"]` (Anthropic's `service_tier` controls
  capacity, not Fast mode). Only Opus 5.5, Opus 5, and Opus 4.8 have Fast mode.
  Opus 4.7 rejects it and Opus 4.6 bills it at standard rates, so neither gets a
  tier. Fast-mode cache prices come from applying the cache multipliers to the
  Fast-mode base input price.
- **Batch** — Not represented for any Anthropic model; it is a separate
  endpoint that ordinary ingestion does not identify.
- **Claude Sonnet 5** — $2/$10 is the standard price; the previously announced
  September 2026 increase was cancelled.
- **Claude Mythos Preview** — Has no published price row; do not add an entry.
- **Model IDs** — Current Claude IDs are dateless (`claude-opus-5-5`). Bedrock
  IDs are `anthropic.<id>` with optional region prefixes and `-v1(:0)?`.
  Anchor every pattern with `^...$` so `claude-opus-5` does not match
  `claude-opus-5-5`.

### OpenAI

- **`(openai\/)?` prefix** — Every OpenAI `matchPattern` must accept the
  optional `openai/` prefix, for example `(?i)^(openai\/)?(gpt-4o)$`.
- **Large Context** — `gpt-6*`, `gpt-5.6*`, `gpt-5.5`, `gpt-5.5-pro`, `gpt-5.4`,
  and `gpt-5.4-pro` (and their dated snapshots) switch to Large Context pricing
  above 272,000 input tokens: 2x input and cached input, 1.5x output. The
  `gpt-5.4-mini` and `gpt-5.4-nano` models have no Large Context tier.
- **Cache writes** — A distinct column priced at 1.25x input. Only the
  `gpt-5.6` and `gpt-6` families populate it today; check the column for every
  newly added model.
- **Service tiers** — Fast mode is `service_tier in ["fast","priority"]`, at 2x
  the applicable tier for the `gpt-6` and `gpt-5.6` families. Flex is
  `["flex"]` at 0.5x. Ultrafast is `["ultrafast"]` at 6x and is priced only for
  `gpt-6-astra`; `gpt-5.6-sol` has preview Ultrafast access with no published
  price. Combined service-tier plus large-context tiers are evaluated before
  single-condition tiers. When the page does not publish a Flex Large Context
  row, apply 0.5x to the Large Context tier.
- **GPT-6 family key set** — New `gpt-6*` and `gpt-6.1*` entries mirror the
  six-tier sibling shape: Standard, Fast mode · Large context, Flex · Large
  context, Fast mode, Flex, and Large Context. `gpt-6-astra` also has the two
  Ultrafast tiers.
- **Batch** — Not represented; it is a separate asynchronous endpoint.
- **Floating aliases** — Do not add entries for `-latest` style aliases such as
  `gpt-daybreak-*-latest`. `gpt-5-chat-latest` is an existing exception.
- **Out of scope** — The restricted Daybreak cyber models (`gpt-5.6-cyber`,
  `gpt-5.5-cyber`, `gpt-5.4-cyber`), GPT-Rosalind (`gpt-rosalind-research`),
  and the open-weight `gpt-oss-*` models. Revisit only if OpenAI publishes a
  public model page and price.

### Google Gemini

- **Cache reads** — Standard tiers price cache reads at 10% of input. Priority
  tables can round differently (3.5 Flash-Lite lists $0.05 on $0.54); use the
  published rate. A cache read price off the 10% ratio in a Standard tier is
  suspicious and needs re-verification.
- **Context-cache storage** — The per-hour storage price has no usage key; do
  not represent it.
- **Grounding** — Gemini 3.x and newer charge $14 per 1,000 grounded requests
  (`grounding_queries` / `web_search_queries` at `14e-3`). The 2.5 family
  charges $35 per 1,000 and has no grounding keys in the file.
- **Priority** — Documented `service_tier: "priority"` on the Developer API and
  the OpenAI-compatible API
  ([guide](https://ai.google.dev/gemini-api/docs/priority-inference)), matched
  as `modelParameters.service_tier in ["priority"]` without OpenAI's `fast`
  alias. Requests can be downgraded and billed at Standard; the actual tier is
  in the `x-gemini-service-tier` response header and must be recorded in
  `modelParameters.service_tier`. Missing tier data falls back to Standard. For
  Pro models, evaluate Priority + >200K, then Priority, then Large Context.
  Priority is about 1.8x Standard, but use each published rate rather than a
  multiplier. These are Developer API rates; do not infer Vertex reserved or
  regional pricing from them.
- **Gemini 4 Argon** — Implicit caching only (no cache-write keys), thinking
  billed at the output rate, flat pricing across the full context. It is in
  `googleAIStudioModels` only, pending Vertex AI lifecycle confirmation.
- **Auto-routed IDs** — The deprecations page lists `gemini-3.5-flash` and
  `gemini-3.7-flash` with shutdown date `N/A`; requests auto-route to
  `gemini-3.6-flash` and `gemini-3.8-flash`, and neither ID has its own pricing
  row anymore. This meets no removal criterion and stays unresolved for a human
  decision, especially because `gemini-3.5-flash` is the first (default)
  `vertexAIModels` entry.
- **Gemini 2.5 access notice** — The pricing and deprecations pages limit 2.5
  model access to existing users. This is not a shutdown.
- **Unlisted legacy IDs** — `gemini-2.0-flash-thinking-exp-01-21`,
  `gemini-1.5-pro`, `gemini-1.5-flash`, and `gemini-1.5-flash-8b` remain in
  `googleAIStudioModels` but appear on neither the models catalog nor the
  deprecations page. That is ambiguous, not a confirmed shutdown.
- **Out of scope** — Live, TTS, transcription, translation, image, video,
  music, embedding, robotics, computer-use, and agent-product models (for
  example `gemini-omni-*`, `veo-*`, `lyria-*`, `gemini-*-live*`,
  `gemini-*-image`, `deep-research-*`, `antigravity-*`), and Gemma, which has no
  paid API price.

### AWS Bedrock

- **Claude 3.5 Sonnet Public Extended Access** — A real SKU billed at 2x the
  standard rate in some regions, but it uses the same model ID as standard
  billing, so Langfuse cannot represent it. Do not add a second entry.
- **Amazon Nova** — Not covered. Adding it needs its own model IDs, match
  patterns, and Bedrock usage-key research; report it rather than adding it in
  an audit.

### TypeSafe Jev

- `jev` is TypeSafe's decision model. Its official price is on
  `https://docs.typesafe.ai/models`: $42 per billion input tokens, output free.
  That is `4.2e-8` for `input` and `0` for `output`, in a single Standard tier.
  Jev's usage object has only `input_tokens` and `output_tokens`.
- Verify against TypeSafe's own docs only; gateway resale prices (Vercel AI
  Gateway, OpenRouter) are not official evidence.
- The `matchPattern` already covers versioned IDs (`jev-1.13.0`, `jev-1.14.0`)
  and the `jev-latest` / `jev-preview` aliases. `typeSafeModels` in `types.ts`
  is not an audit-editable array; report a new Jev version that should become
  selectable as unresolved.

## Known Gaps

- **Legacy usage-key aliases** — Running `validate-pricing-file.mjs` with
  `--usage-key-model` for every model reports missing aliases on old Anthropic,
  Gemini, and OpenAI entries. Backfill them in a dedicated change, not as a
  side effect of a price audit.
- **Selectable IDs without pricing** — `gemini-1.5-pro`, `gemini-1.5-flash`,
  `gemini-1.5-flash-8b`, and `gemini-2.0-flash-thinking-exp-01-21` have no
  official price and no matching pricing entry. Do not add one without official
  evidence.

## Scheduled Changes

Act on a row only after re-confirming it on the official page on or after its
date, then delete the row. Add rows only for announced, dated changes that will
need action.

| Date       | Change                                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-21 | `gpt-5.6-sol` promotional pricing is guaranteed only through this date. Re-check its price.                                                                                                                                                                                      |
| 2026-11-30 | `claude-sonnet-4-5-20250929` retires. Remove it from `anthropicModels`.                                                                                                                                                                                                          |
| 2026-12-01 | `gemini-4-argon` introductory pricing ($2/$10/$0.10 Standard) steps up to $4/$20/$0.20, with Priority doubling in step.                                                                                                                                                          |
| 2026-12-11 | OpenAI "GPT-5 and o3" batch shuts down. Remove `gpt-5`, `gpt-5-2025-08-07`, `gpt-5-mini`, `gpt-5-mini-2025-08-07`, `gpt-5-nano`, `gpt-5-nano-2025-08-07`, `o3`, and `o3-2025-04-16` from `openAIModels`.                                                                         |
| 2027-01-01 | `gemini-3.6-flash`, `gemini-3.7-flash`, and `gemini-3.8-flash` introductory pricing ($0.75/$3.75/$0.075) steps up to $1.50/$7.50/$0.15. Re-check their Priority rates too.                                                                                                       |
| 2027-01-14 | OpenAI "GPT-4 series" batch shuts down (`gpt-4o-2024-08-06`, `gpt-4o-2024-11-20`, `gpt-4o-mini-2024-07-18`, `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`). Remove those snapshots and their aliases (`gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`) from `openAIModels`. |
| 2027-04-01 | OpenAI batch shuts down `gpt-5.3-codex`, `gpt-5.4-nano`, `gpt-5.4-nano-2026-03-17`, `gpt-5.1`, and `gpt-5.1-2025-11-13`. Remove them from `openAIModels`.                                                                                                                        |
| 2027-05-07 | `gemini-3.1-flash-lite` shuts down on the Gemini API (replacement `gemini-3.5-flash-lite`). Remove it from `googleAIStudioModels`; check Vertex AI separately.                                                                                                                   |

`claude-haiku-4-5-20251001` lists only a "not sooner than October 15, 2026"
retirement floor and is still Active. A floor is not a retirement date. The bare
`gpt-3.5-turbo-16k` entry in `openAIModels` is absent from the OpenAI
deprecations page and model catalog, which is ambiguous, not a confirmed
shutdown.

## Capture

1. Base input token price per million tokens
2. Output token price per million tokens
3. Cache write price when supported
4. Cache read price when supported
5. Any long-context or conditional pricing
6. All model ID variants that Langfuse should match

## Price Conversion

Values in `default-model-prices.json` are per token, not per million tokens.

Always write per-token prices as `<USD per MTok>e-6`, so the mantissa reads
directly as the provider's per-million-token price. Keep the `e-6` exponent even
for sub-dollar and sub-cent prices; never normalize to `1e-7`, `5e-8`, `1.5e-5`,
or plain decimals like `0.000001`. `0` is fine for free usage types. The only
exception is non-token usage (Gemini `grounding_queries` / `web_search_queries`
per-query prices, written as `14e-3` for $14 per 1K queries). The validator
enforces this on changed and selected entries; older entries may still use other
notation and are rewritten only when that entry changes for another reason.

| Provider Price | JSON Value | Not          |
| -------------- | ---------- | ------------ |
| `$5 / MTok`    | `5e-6`     |              |
| `$25 / MTok`   | `25e-6`    | `2.5e-5`     |
| `$0.50 / MTok` | `0.5e-6`   | `5e-7`       |
| `$0.10 / MTok` | `0.1e-6`   | `1e-7`       |
| `$0.05 / MTok` | `0.05e-6`  | `5e-8`       |
| `$6.25 / MTok` | `6.25e-6`  | `0.00000625` |

Formula:

```text
price_per_token = price_per_mtok / 1_000_000
json_literal    = "<price_per_mtok>e-6"
```

## Provider Usage Keys

Use [provider-usage-key-matrix.md](provider-usage-key-matrix.md) as the single
source of truth for OpenAI, Gemini, Anthropic, and Bedrock usage aliases. Do not
copy a partial key set from this pricing-source reference or from an older model
entry.
