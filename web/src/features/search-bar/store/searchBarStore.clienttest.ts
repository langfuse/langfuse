import { createSearchBarStore } from "@/src/features/search-bar/store/searchBarStore";

describe("searchBarStore (draft-only)", () => {
  it("validates the draft on setDraft", () => {
    const store = createSearchBarStore();
    store.getState().actions.setDraft("level:ERROR");
    expect(store.getState().draft).toBe("level:ERROR");
    expect(store.getState().draftValid).toBe(true);

    store.getState().actions.setDraft("level:ERROR OR env:dev");
    expect(store.getState().draftValid).toBe(false);
    expect(store.getState().draftDiagnostics.length).toBeGreaterThan(0);
  });

  it("seeds the draft from the committed baseline via resetTo", () => {
    const store = createSearchBarStore();
    store.getState().actions.resetTo("env:prod latency:>2");
    expect(store.getState().draft).toBe("env:prod latency:>2");
    expect(store.getState().draftValid).toBe(true);
  });

  it("resetTo is a no-op when the draft already matches (settles a commit echo)", () => {
    const store = createSearchBarStore();
    store.getState().actions.setDraft("level:ERROR");
    let notified = 0;
    const unsub = store.subscribe(() => notified++);
    store.getState().actions.resetTo("level:ERROR");
    unsub();
    expect(notified).toBe(0);
  });

  it("resetTo keeps a typed alias when the canonical echo is equivalent", () => {
    // Commit bounces `env:dev` through canonical URL state and re-derives
    // `environment:dev`; resetTo must NOT clobber the user's typed alias, since
    // the two are semantically identical (no silent rewrite).
    const store = createSearchBarStore();
    store.getState().actions.setDraft("env:dev");
    store.getState().actions.resetTo("environment:dev");
    expect(store.getState().draft).toBe("env:dev");
    // But a genuinely different committed text (external edit) still re-seeds.
    store.getState().actions.resetTo("level:ERROR");
    expect(store.getState().draft).toBe("level:ERROR");
  });

  it("resetTo keeps a typed negation that the adapter folds into the value/op", () => {
    // The adapter folds `-` into the value/operator at lowering (no NOT left in
    // FilterState), so the reverse adapter re-derives the canonical positive
    // form: `-latency:>2` → `latency:<=2`, `-isRootObservation:true` →
    // `isRootObservation:false`. resetTo must keep the user's typed form — same
    // "no silent rewrite" guarantee as the alias case.
    const numeric = createSearchBarStore();
    numeric.getState().actions.setDraft("-latency:>2");
    numeric.getState().actions.resetTo("latency:<=2");
    expect(numeric.getState().draft).toBe("-latency:>2");

    const bool = createSearchBarStore();
    bool.getState().actions.setDraft("-isRootObservation:true");
    bool.getState().actions.resetTo("isRootObservation:false");
    expect(bool.getState().draft).toBe("-isRootObservation:true");

    // A genuinely different committed text (sidebar edit) still re-seeds.
    numeric.getState().actions.resetTo("latency:<=5");
    expect(numeric.getState().draft).toBe("latency:<=5");
  });

  it("resetTo still canonicalizes free-text order (negation fold is order-preserving)", () => {
    // The flat URL contract has no slot for filter-vs-free-text interleave, so
    // the reverse adapter canonicalizes to `<filters> <freetext>`. The negation
    // fold must NOT erase that re-seed: typing `refund level:ERROR` and pressing
    // Enter re-renders as `level:ERROR refund` (documented behavior).
    const store = createSearchBarStore();
    store.getState().actions.setDraft("refund level:ERROR");
    store.getState().actions.resetTo("level:ERROR refund");
    expect(store.getState().draft).toBe("level:ERROR refund");
  });

  it("revealInvalid marks the current draft; setDraft clears it", () => {
    const store = createSearchBarStore();
    store.getState().actions.setDraft("level:ERROR OR env:dev");
    store.getState().actions.revealInvalid();
    expect(store.getState().invalidRevealDraft).toBe("level:ERROR OR env:dev");
    store.getState().actions.setDraft("level:ERROR");
    expect(store.getState().invalidRevealDraft).toBeNull();
  });

  it("removeChipSpan edits the draft and returns the new text", () => {
    const store = createSearchBarStore();
    store.getState().actions.setDraft("level:ERROR env:dev");
    const next = store.getState().actions.removeChipSpan(0, 11);
    expect(next).toBe("env:dev");
    expect(store.getState().draft).toBe("env:dev");
  });

  it("revalidate refreshes draftValid when scoreTypes change (async observed load)", () => {
    // The draft was typed before `observed` loaded (empty score sets → numeric
    // value falls back to a clean categorical filter). Once observed loads,
    // revalidate must re-run validation so draftValid agrees with planCommit.
    let st = {
      numericScoreNames: new Set<string>(),
      categoricalScoreNames: new Set<string>(),
      traceNumericScoreNames: new Set<string>(),
      traceCategoricalScoreNames: new Set<string>(),
    };
    const store = createSearchBarStore(() => st);
    store.getState().actions.setDraft("scores.accuracy:hello");
    expect(store.getState().draftValid).toBe(true);
    st = { ...st, numericScoreNames: new Set<string>(["accuracy"]) };
    store.getState().actions.revalidate();
    expect(store.getState().draftValid).toBe(false);
  });

  it("revalidate reveals the red state when a valid draft flips invalid", () => {
    // Committed against an empty context while filterOptions loaded; once score
    // types arrive and unmask it, the bar must paint red (not stay silently
    // invalid with no AlertCircle).
    let st = {
      numericScoreNames: new Set<string>(),
      categoricalScoreNames: new Set<string>(),
      traceNumericScoreNames: new Set<string>(),
      traceCategoricalScoreNames: new Set<string>(),
    };
    const store = createSearchBarStore(() => st);
    store.getState().actions.setDraft("scores.accuracy:hello");
    expect(store.getState().invalidRevealDraft).toBeNull();
    st = { ...st, numericScoreNames: new Set<string>(["accuracy"]) };
    store.getState().actions.revalidate();
    expect(store.getState().invalidRevealDraft).toBe("scores.accuracy:hello");
  });

  it("revalidate bails when scoreTypes are set-equal (no churn re-render)", () => {
    // observed identity rotates every auto-refresh tick, but when the score-name
    // sets are unchanged revalidate must NOT re-run validation / emit a fresh
    // diagnostics array (which would trigger a no-op subscriber re-render).
    let st = {
      numericScoreNames: new Set<string>(["accuracy"]),
      categoricalScoreNames: new Set<string>(),
      traceNumericScoreNames: new Set<string>(),
      traceCategoricalScoreNames: new Set<string>(),
    };
    const store = createSearchBarStore(() => st);
    store.getState().actions.setDraft("level:ERROR");
    let notified = 0;
    const unsub = store.subscribe(() => notified++);
    // New context object, identical sets (a refetch tick).
    st = { ...st, numericScoreNames: new Set<string>(["accuracy"]) };
    store.getState().actions.revalidate();
    expect(notified).toBe(0);
    // A real change still triggers a re-validate.
    st = { ...st, numericScoreNames: new Set<string>(["accuracy", "latency"]) };
    store.getState().actions.revalidate();
    expect(notified).toBe(1);
    unsub();
  });

  it("validates with scoreTypes so the store agrees with the commit gate", () => {
    // `accuracy` is numeric, so `scores.accuracy:hello` can't lower. Without
    // the same scoreTypes planCommit uses, the store would mark it valid and
    // the red-border gate (which reads draftValid) would show nothing on Enter.
    const scoreTypes = {
      numericScoreNames: new Set<string>(["accuracy"]),
      categoricalScoreNames: new Set<string>(),
      traceNumericScoreNames: new Set<string>(),
      traceCategoricalScoreNames: new Set<string>(),
    };
    const store = createSearchBarStore(() => scoreTypes);
    store.getState().actions.setDraft("scores.accuracy:hello");
    expect(store.getState().draftValid).toBe(false);
    expect(store.getState().draftDiagnostics.length).toBeGreaterThan(0);
  });
});
