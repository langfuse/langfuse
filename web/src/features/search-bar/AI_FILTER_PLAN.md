# AI Filter — Improvement & Dogfooding Plan (search bar, v4)

What the AI filter is, what's wrong with it today, and how we'll tune it **using
Langfuse itself** — prompt management, prompt versions, tracing, datasets, and
evals.

> **Scope:** the **v4** search-bar AI filter only (`searchBar.generateFilter`,
> prompt built in `server/buildFilterPrompt.ts`). The legacy **v3**
> natural-language filter (`naturalLanguageFilters.createCompletion`, remote
> prompt `get-filter-conditions-from-query`) is a separate code path and is **not**
> changed by anything here. See `README.md` → "AI filter mode".

## Status — two pieces

- **Piece 1 (MVP, mergeable now).** Make the v4 AI filter genuinely usable and
  ship it. Prod was fully broken — every call 500'd on a `temperature`
  ValidationException (Opus 4.8 rejects `temperature`/`top_p`; fixed by dropping
  them) — and nobody noticed, so the bar is "clearly works," not "perfectly
  tuned." Local experiments show the prompt is **good on the prod model** (see
  "Local prompt experiments"), and **trace-awareness** (observed values +
  metadata keys + result count injected into the prompt) is now in the MVP, so
  the model maps onto the project's real columns/values instead of guessing.
  Ship it.
- **Piece 2 (the real tuning, dogfooded on Langfuse).** Prompt management +
  versions, enriched tracing, dataset + evals — the disciplined loop, and a
  Langfuse workshop in its own right. Everything from "Why dogfood Langfuse"
  onward is Piece 2.

Note: the UX findings below were first measured on **local `claude-3-haiku`**;
Piece 1 re-measured on the **prod model (Opus 4.8)** and most resolve there.

## 1. What it is

The bar's "Ask AI" mode turns a natural-language request into a `FilterState`
applied to the v4 observations/events table:

```
prompt (+ current filters as refine context)
  → searchBar.generateFilter → LLM → JSON singleFilter[]
  → parseGeneratedFilters (validate + drop non-representable)
  → applied via setFilterState → re-derived as editable grammar pills
```

Opt-in (org `aiFeaturesEnabled`, Cloud-only; server- and client-gated). Refine
mode sends the current bar query text so the model updates the existing filters.

## 2. What's wrong (UX session 2026-06-23)

Quality is **bimodal and driven by the model** (`claude-3-haiku`), not the
plumbing. Specific prompts are accurate; terse/refine prompts fall back to the
prompt's few-shot example.

| Sev | Finding | Repro |
| --- | --- | --- |
| 🔴 Major | **Refine silently corrupts existing filters on terse instructions.** The model regurgitates the prompt's few-shot example and ignores both the request and the visible refine context. | From `level:ERROR` + last-hour, "only in production" → `environment:production` + `latency:>5` (hallucinated) + `startTime:>24h` (wrong window); `level:ERROR` **dropped**. Reproduced with "also only errors" too. |
| 🔴 Major | **Blind to the project's data** (no knowledge of actual metadata keys / observed values). | "routing queue should be membership-support" → `traceName:membership-support` (should be `metadata.routing.queue:*membership-support*`). |
| 🟠 Mod | **Focus dropped after a generation.** `disabled={pending}` blurs the input to `<body>` and it's never refocused; after a failed/empty generation, Esc no longer cancels and you must re-click to retype. | After a failed generate, `document.activeElement === body`. |
| 🟠 Mod | **Datetime pills are cryptic.** "last hour" renders as `startTime:>"2026-06-23T11:12:37.255Z"` (ms-precision ISO). Bar-wide rendering issue, surfaced by AI. | — |
| 🟡 Minor | Refine context shows as a flat grey monospace string (truncates), not the colored pills used elsewhere. | — |
| 🟡 Minor | Discoverability — "Ask AI" is a small muted button while the placeholder pushes the DSL; no cue that the AI produced the pills. | — |

**Works well (keep):** specific builds are accurate ("errors in the last hour",
"user alice slower than 10s", multi-filter); results are transparent editable
pills; keyboard path (Tab→button→Enter, Esc, back); empty-result error is clean;
apply is lossless (skipped filters preserved); v3/v4 isolation holds.

## 2b. Local prompt experiments (Opus 4.8) — Piece 1 (2026-06-23)

Ran the v4 prompt against the **prod model** (`eu.anthropic.claude-opus-4-8`, via
the playground SSO profile) over a scenario set, parsed with the production
`parseGeneratedFilters`, scored against expected filter-column sets. **12/13,
stable across runs.**

**Key finding:** the refine-leakage in §2 was a `claude-3-haiku` weakness —
**Opus 4.8 (what prod uses) handles refine correctly** (add / remove / change,
preserving context). Since prod runs Opus 4.8, the MVP prompt is good as-is; no
tuning needed to ship.

| Scenario | Prompt (+ refine ctx) | Expected cols | Opus 4.8 |
| --- | --- | --- | --- |
| build | errors in the last hour | level, startTime | ✅ |
| build | slow traces in production | latency, environment | ✅ |
| build | failed traces from user alice | level, userId | ✅ |
| build | traces tagged billing | traceTags | ✅ |
| build | accuracy score below 0.8 | scores_avg | ✅ |
| build | output mentions refund | output | ✅ |
| build | root observations only | isRootObservation | ✅ |
| build | expensive gpt-4 calls over $0.5 | totalCost, providedModelName | ✅ |
| refine (add) | `level:ERROR startTime:>…` + "also only in production" | level, startTime, environment | ✅ preserved + added |
| refine (remove) | `latency:>2` + "drop latency, show only errors" | level | ✅ removed + added |
| refine (change) | `environment:production` + "make it staging instead" | environment | ✅ value changed |
| edge | gibberish | (none) | ✅ empty |
| **gap** | routing queue is membership-support | metadata.routing.queue | ❌ guesses traceName/sessionId |

The one failure was the **data-awareness gap**: the model didn't know the
project's metadata keys (or actual `type`/name values), so it guessed a column.

**RESOLVED (now in the MVP).** A "project data context" block is injected into
the prompt — observed values per column + metadata keys (flattened dot-paths
sampled from the visible rows) + the current result count — built on the client
from already-loaded `filterOptions` + visible rows (`lib/ai-context.ts`), capped
for cost. Re-validated on Opus 4.8 with that context:

| Prompt | Before | After (with context) |
| --- | --- | --- |
| only support chat sessions | `type:chat` → 0 rows | `traceName:SupportChatSession` ✅ |
| routing queue is membership-support | `traceName:…` / `sessionId:…` | `metadata.routing.queue:membership-support` ✅ |
| errors in the last hour (control) | ✅ | still ✅ |

The scenario set above is the seed for the Piece-2 eval dataset. Remaining
Piece-2 work: a sample of visible-row *content* (input/output) for even richer
grounding, and the full managed-prompt + dataset/eval loop.

### Full-surface capability coverage (also in the MVP)

The prompt was expanded to teach the **whole** v4 grammar — not just simple
column matches — and to be **brave with metadata**. Validated on Opus 4.8 with
*variations* (not the verbatim examples), 7/7:

| Request | Generated |
| --- | --- |
| filter to the acme tenant | `metadata.tenant:acme` |
| mention 'password reset' in the response | `output:"password reset"` |
| where the sentiment is positive | `scores.sentiment:positive` |
| traces missing a user id | `-has:userId` |
| exclude debug and warning levels | `-level:(DEBUG OR WARNING)` |
| tagged with both experiment and baseline | `traceTags:(experiment AND baseline)` |
| expensive claude calls in staging that aren't errors | `providedModelName:claude totalCost:>0.5 environment:staging -level:ERROR` |

So the generator now reaches into metadata, content (input/output) search,
numeric + categorical scores, null/has checks, tag any/all/none groups, and
negation — the full surface, generalized from diverse examples.

Harness: throwaway tsx that shells `aws bedrock-runtime converse --profile
playground` per scenario (needs Bedrock creds). **Caveat:** quality is
model-dependent — local `claude-3-haiku` fails the refine cases, so self-hosters
on a weak model see worse output; the Piece-2 eval will quantify model choice.

## 3. Why dogfood Langfuse for this

These are LLM-quality problems. Hand-tuning the prompt by eye is guesswork and
regresses silently (the example-leakage is exactly that). The disciplined fix is
a **dataset + evals + versioned prompts**, measuring every change — which is the
product we sell. Tuning our own AI feature on Langfuse is both the correct
engineering loop and authentic dogfooding.

## 4. Current instrumentation (baseline)

- ✅ **Tracing is wired.** `searchBar.generateFilter` sends each call to the
  AI-features Langfuse project via `traceSinkParams` (env
  `langfuse-natural-language-filter`, traceName `search-bar-filter`,
  `targetProjectId = LANGFUSE_AI_FEATURES_PROJECT_ID`), gated on org
  `aiTelemetryEnabled`. `fetchLLMCompletion` records the system+user messages and
  the raw completion.
- ❌ **Prompt is in-code** (`buildFilterPrompt.ts`, registry-derived) → no
  versions, no deploy-free iteration, no prompt↔trace linkage, nothing to eval.
- ❌ **No structured trace capture** of mode (build/refine), `currentQuery`,
  parsed filters, `droppedCount`, applied-vs-empty.
- ❌ **No dataset, no evals.**

## 5. Architecture decision — hybrid prompt

Don't choose between "registry-derived in code" and "managed in Langfuse" —
**split it**:

- **Managed template** (Langfuse Prompt Management, new prompt `search-bar-filter`
  in the AI-features project, separate from v3's): the human-tunable parts — role,
  output format, intent hints, **examples**, the **refine instruction** — with
  variables: `{{fieldCatalog}}`, `{{currentDatetime}}`, `{{currentFilters}}`,
  `{{observedContext}}`.
- **Code-injected variables** (`buildFilterPrompt.ts` shrinks to a
  `buildFilterVariables()`): the field catalog still **generated from `FIELDS`**
  (so it can't drift from the grammar), plus the observed-context (metadata keys +
  values) for the data-awareness fix.

The endpoint fetches the prompt by label, compiles with those variables, and
**links the prompt version to every trace** (`prompt:` in `traceSinkParams`, as
the v3 path already does). This is the lynchpin: it makes the example and the
refine instruction *versioned data we can A/B*, which is precisely where the
leakage lives.

## 6. The dogfood loop

- **Prompt management + labels** — fetch by `production`; iterate on `latest`,
  promote when evals improve. SDK caches by TTL to keep request latency low.
- **Dataset** `search-bar-filter-evals` (AI-features project). Items:
  `{ input: { prompt, currentQuery? }, expected_output: { queryText } }`. Seed
  with the spread that works **plus the failures**: terse refine that must
  preserve context, `routing queue → metadata.routing.queue`, time expressions,
  scores, multi-filter.
- **Deterministic scorer** (no LLM judge needed — output is structured): parse
  expected + actual into normalized `FilterState` (reuse
  `parseGeneratedFilters` + `filterStateToQueryText`), then score: exact-set
  match, filter-level precision/recall/F1, and a **`context_preserved`** flag for
  refine items. Reuses code we already have + tested.
- **Dataset runs** across prompt versions **and models** (haiku vs sonnet);
  compare in the experiments UI. This is how we kill the leakage measurably:
  change the example → run → watch `context_preserved` go 0→1 → promote.
- **Close the loop** — curate real failing production traces into the dataset;
  optionally an **online implicit-feedback score**: did the user keep the AI
  filters, or clear/edit them within a few seconds? That ranks prompt versions on
  real usage.

The data-awareness fix (#2) folds in as the `{{observedContext}}` variable, and
the dataset lets us **prove** it helps (ablate with/without on the routing-queue
case).

## 7. TODO

**Phase 0 — enrich tracing (small, parallelizable)**
- [ ] Add to each trace: mode (build/refine), `currentQuery`, parsed filters,
      `droppedCount`, applied-vs-empty; tag traces.
- [ ] Confirm traces land in the AI-features project and are queryable by env.

**Phase 1 — prompt → Prompt Management (hybrid)**
- [ ] Create managed prompt `search-bar-filter` (chat) in the AI-features project
      with the variables above; seed it from the current in-code prompt.
- [ ] Refactor `buildFilterPrompt.ts` → `buildFilterVariables()` (catalog from
      `FIELDS` + observed context).
- [ ] `generateFilter`: fetch prompt by label, compile, link version to the trace.
- [ ] Label-based rollout (`production`/`latest`); keep a code fallback if the
      fetch fails.

**Phase 2 — eval harness + baseline**
- [ ] Build the `search-bar-filter-evals` dataset (seed cases incl. the failures).
- [ ] Implement the deterministic scorer (reuse `parseGeneratedFilters` +
      `filterStateToQueryText`): exact-set, F1, `context_preserved`.
- [ ] Dataset-run script via the Langfuse SDK; record a **baseline** for the
      current prompt+model before changing anything.

**Phase 3 — tune with data**
- [ ] Iterate prompt versions: de-sticky / abstract the few-shot example;
      strengthen "preserve current filters; change only what's asked" for refine.
- [ ] Add `{{observedContext}}` (metadata keys + observed values); ablate to prove
      the routing-queue fix.
- [ ] Eval model choices (haiku vs sonnet); pick on score/cost.
- [ ] Consider a server-side guard for refine: don't drop context filters unless
      the request clearly removes them; or surface a before→after diff so any
      silent loss is visible.

**Phase 4 — close the loop (ongoing)**
- [ ] Curate failing production traces into the dataset.
- [ ] Online implicit-feedback score (kept vs cleared/edited within N seconds).

**Quick UX fixes (independent of the eval loop)**
- [ ] Restore focus after a generation (don't leave the input blurred to body).
- [ ] Render the refine context as read-only pills, not a flat truncated string.
- [ ] Friendlier datetime pill rendering (bar-wide; separate workstream).
- [ ] Discoverability polish for the "Ask AI" entry.

## 8. Open decisions

- **Hybrid prompt** (managed template + code-injected catalog/observed vars) —
  the lynchpin; everything hangs off it.
- **Scorer**: deterministic set-match (start here, reuses our code) vs LLM-judge
  for "semantic intent" vs both.
- **Model**: stay on Bedrock haiku vs move to a stronger model for this feature
  (decide via the eval, not by feel).

## 9. Key files

- `server/router.ts` — `searchBar.generateFilter` (gating, LLM call, tracing).
- `server/buildFilterPrompt.ts` — in-code prompt → becomes `buildFilterVariables()`.
- `server/parseFilterCompletion.ts` — `parseGeneratedFilters` (reuse in the scorer).
- `lib/fields.ts` — `FIELDS` (catalog source).
- `lib/filter-state-to-query.ts` — `filterStateToQueryText` (scorer normalization).
- `components/SearchBarAiPrompt.tsx` — AI sub-mode UI.
- `../natural-language-filters/server/router.ts` — v3 reference: already uses
  Prompt Management + the AI-features trace sink (the model for the hybrid).
