// Per-mount search-bar store — DRAFT ONLY.
//
// Data direction is deliberately dumb and one-way: the table's URL filter
// state (FilterState + searchQuery/searchType) is the single source of truth.
// The committed query is DERIVED from it (filterStateToQueryText) and seeded
// into this store's draft via `resetTo`. The store therefore holds only the
// live editing buffer — there is no second "committed" copy to keep in sync,
// and nothing here ever writes back to the filter state (that happens in the
// container's commit workflow). This removes the reconciliation/loop-guard the
// old two-source design needed.

import { createStore, type StoreApi } from "zustand/vanilla";

import type { ScoreTypeContext } from "../lib/adapter";
import { removeToken } from "../lib/edits";
import { type Diagnostic } from "../lib/langQ";
import { scoreTypeContextEqual } from "../lib/observed-options";
import { validateQuery } from "../lib/validate";

export type SearchBarStoreState = {
  /** Live editing buffer. */
  draft: string;
  /** Pure derivations of `draft`, cached on write to avoid re-parsing. */
  draftDiagnostics: Diagnostic[];
  draftValid: boolean;
  /**
   * The draft for which a commit was last attempted while invalid. The editor
   * shows global diagnostics only when this equals the current draft, so the
   * red state appears on Enter/blur — not while the user is mid-typing.
   */
  invalidRevealDraft: string | null;

  actions: {
    setDraft: (next: string) => void;
    /**
     * Seed the draft from the derived committed baseline (commit echo, sidebar
     * edit, saved view, navigation). The ONE external→local sync; it never
     * writes anywhere else, so it cannot loop.
     */
    resetTo: (committedText: string) => void;
    /** Remove the token at `[from,to)` in the draft; returns the new text so
     * the caller can commit it. */
    removeChipSpan: (from: number, to: number) => string;
    /** Mark the current draft as a failed commit so diagnostics can show. */
    revealInvalid: () => void;
    /**
     * Re-run validation on the current draft without changing the draft or the
     * reveal state. Called when async context (observed score types) loads
     * after the draft was typed, so `draftValid` doesn't stay stale.
     */
    revalidate: () => void;
  };
};

export type SearchBarStore = StoreApi<SearchBarStoreState>;

/**
 * `resolveScoreTypes` lets draft validation route `scores.<name>` by observed
 * score type — the SAME context planCommit uses — so the store's draftValid
 * (which the editor's red-border gate reads) never disagrees with the commit
 * gate. A thunk so it always reads the latest observed options.
 */
export function createSearchBarStore(
  resolveScoreTypes?: () => ScoreTypeContext | undefined,
): SearchBarStore {
  return createStore<SearchBarStoreState>((set, get) => {
    // The score-type context used by the most recent validation. revalidate()
    // bails when the context is set-equal to this, so observed-identity churn
    // (a relative range + auto-refresh rebuilds the context every tick) doesn't
    // re-parse the draft and emit a fresh diagnostics array for no change.
    let lastScoreTypes: ScoreTypeContext | undefined;
    let hasValidated = false;

    const writeDraft = (next: string) => {
      const scoreTypes = resolveScoreTypes?.();
      lastScoreTypes = scoreTypes;
      hasValidated = true;
      const res = validateQuery(next, scoreTypes);
      set({
        draft: next,
        draftDiagnostics: res.diagnostics,
        draftValid: res.valid,
        invalidRevealDraft: null,
      });
    };

    return {
      draft: "",
      draftDiagnostics: [],
      draftValid: true,
      invalidRevealDraft: null,

      actions: {
        setDraft: writeDraft,
        resetTo: (committedText) => {
          if (committedText === get().draft) return;
          writeDraft(committedText);
        },
        removeChipSpan: (from, to) => {
          const next = removeToken(get().draft, { from, to });
          writeDraft(next);
          return next;
        },
        revealInvalid: () => set({ invalidRevealDraft: get().draft }),
        revalidate: () => {
          const scoreTypes = resolveScoreTypes?.();
          // Nothing to refresh: the draft was already validated against an
          // equal context (writeDraft and revalidate both record it), so the
          // result would be identical. Skip the parse + set to avoid a
          // no-op re-render from the fresh diagnostics array.
          if (hasValidated && scoreTypeContextEqual(scoreTypes, lastScoreTypes))
            return;
          lastScoreTypes = scoreTypes;
          hasValidated = true;
          const wasValid = get().draftValid;
          const res = validateQuery(get().draft, scoreTypes);
          set({
            draftDiagnostics: res.diagnostics,
            draftValid: res.valid,
            // If newly-arrived score types unmask an already-committed draft as
            // invalid (committed earlier against an empty context while
            // filterOptions was loading), reveal the red state so the bad
            // commit stops being silent.
            ...(wasValid && !res.valid
              ? { invalidRevealDraft: get().draft }
              : {}),
          });
        },
      },
    };
  });
}
