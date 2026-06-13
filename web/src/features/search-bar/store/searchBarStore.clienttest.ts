import { createSearchBarStore } from "@/src/features/search-bar/store/searchBarStore";

describe("searchBarStore (draft-only)", () => {
  it("validates the draft on setDraft", () => {
    const store = createSearchBarStore();
    store.getState().actions.setDraft("level:ERROR");
    expect(store.getState().draft).toBe("level:ERROR");
    expect(store.getState().draftValid).toBe(true);
    expect(store.getState().draftAst).not.toBeNull();

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
});
