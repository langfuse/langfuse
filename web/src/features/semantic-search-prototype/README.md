# semantic-search-prototype

**Status: design prototype.** Storybook-only, mock data only; nothing here is
imported by the app. It explores how search by meaning over Topics summary
embeddings could surface in two places before any endpoint exists.

Run the stories: `pnpm --filter web run storybook` → **Playground / Topics
Semantic Search** and **Playground / Semantic Ask Ai Prompt**.

## The two surfaces

- **Topics UI** (`TopicsSemanticSearch`): a Keyword / Meaning switch on the
  search box above the trace list. Meaning ranks traces by how close their facet
  summary is to the query, shows a coarse similarity band (Strong / Close /
  Loose) instead of raw cosine scores, and shows which topics the matches land
  in — a quick way to see that "refund to expired card" spans refunds, billing
  and outliers.
- **Tracing search bar, Ask AI** (`SemanticAskAiPrompt`): the model splits a
  prompt into grammar filters (`env:production level:ERROR`) and a leftover
  phrase that becomes a `similar:"…"` clause, scoped to one summary facet.
  Today's Ask AI applies its filters immediately; here the split is previewed
  first, because a ranked meaning match is a different promise from an exact
  filter and the user should see which part is which.

Both surfaces say when they can't fully answer: the project has no Topics run,
or only part of the time range has summaries (coverage below 80%).

## Backend contract the stories assume

1. Embed the query with the same model the project's Topics run used.
2. Exact cosine search over `topic_facet_summaries.embedding`
   (`Array(BFloat16)`), filtered by project, facet and time range first. That
   is an exact scan rather than a vector index; the table mixes vector
   dimensions across embedding models, which a ClickHouse vector index does not
   allow.
3. Return `traceId`, summary, topic and `1 - cosineDistance` as similarity,
   plus coverage (traces in range with a summary for that facet / all traces).

`lib/mockBackend.ts` stands in for both calls and answers synchronously.

## Files

| File                                  | Owns                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `types.ts`                            | Match, coverage and status shapes shared by both surfaces.             |
| `lib/fixtures.ts`                     | Acme Support Agent matches, coverage and Ask AI interpretations.       |
| `lib/similarity.ts`                   | Similarity bands, topic grouping, coverage percent. Pure.              |
| `lib/mockBackend.ts`                  | Mock search and mock prompt split used by the interactive stories.     |
| `components/TopicsSemanticSearch.tsx` | Topics surface, controlled and presentational.                         |
| `components/SemanticAskAiPrompt.tsx`  | Ask AI surface, mirrors `search-bar/components/SearchBarAiPrompt.tsx`. |

## Open questions

- Is a similarity cutoff needed, or is "top N by meaning" enough? The stories
  show top N and no threshold.
- Should a `similar:` clause live in the filter grammar (shareable in URLs and
  saved views) or stay an Ask AI-only sort? The preview renders it as a token
  to make the grammar option concrete.
- Which facet should Ask AI pick by default when a project has several?
