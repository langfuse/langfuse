# Page context

A registry of what the current page shows, as bounded structured data. Pages
publish a `PageContextSnapshot`; consumers read the active one at the moment
they need it (the assistant stage reads it when the user opens it, and sends
it to the assistant as `page_context` run context).

## Publishing

Call `usePublishPageContext(snapshot)` from a component that has the data,
with a snapshot derived in `useMemo`. Builders live in `fns/` and must stay
inside `PAGE_CONTEXT_LIMITS`; `fitPageContextSnapshot` trims to the budget.
When several surfaces publish, a peek wins over the page under it, and among
equals the most recently mounted one wins. Pages that publish nothing fall
back to `buildRoutePageContext` (route and document title).

The web server re-validates snapshots against `PageContextSnapshotSchema`
before they reach the model (`features/in-app-agent/context.ts`), so the schema
is the contract: extend it additively.

## Publishers

- Trace detail page and trace peek: `features/traces/hooks/useTracePageContext.ts`
- Prompt detail page: `features/prompts/hooks/usePromptPageContext.ts`
