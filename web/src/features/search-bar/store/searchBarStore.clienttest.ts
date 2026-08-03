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

  it("resetTo keeps an explicit contains glob on a textSearch field (no silent *v* → v)", () => {
    // `*foo*` (op `~`) and bare `foo` (op `=`) lower to the IDENTICAL contains
    // filter; the reverse adapter re-derives the bare form. resetTo must keep the
    // user's typed glob — same "no silent rewrite" guarantee. Covers the fields
    // this PR moved to textSearch (id/name) plus a pre-existing one.
    for (const column of ["statusMessage", "id", "name"]) {
      const store = createSearchBarStore();
      store.getState().actions.setDraft(`${column}:*foo*`);
      store.getState().actions.resetTo(`${column}:foo`);
      expect(store.getState().draft, column).toBe(`${column}:*foo*`);
    }
  });

  it("resetTo keeps a typed value whose only difference is canonical formatting", () => {
    // The lowering canonicalizes boolean case + numeric/datetime format, so the
    // reverse adapter re-derives a normalized value. resetTo must keep the typed
    // form — the symmetric positive case of the negation-fold preservation.
    const bool = createSearchBarStore();
    bool.getState().actions.setDraft("isRootObservation:TRUE");
    bool.getState().actions.resetTo("isRootObservation:true");
    expect(bool.getState().draft).toBe("isRootObservation:TRUE");

    for (const [typed, derived] of [
      ["latency:2.0", "latency:2"],
      ["latency:.5", "latency:0.5"],
      ["latency:2.5e1", "latency:25"],
    ] as const) {
      const s = createSearchBarStore();
      s.getState().actions.setDraft(typed);
      s.getState().actions.resetTo(derived);
      expect(s.getState().draft, typed).toBe(typed);
    }

    const dt = createSearchBarStore();
    dt.getState().actions.setDraft("startTime:>2026-06-01");
    dt.getState().actions.resetTo('startTime:>"2026-06-01T00:00:00.000Z"');
    expect(dt.getState().draft).toBe("startTime:>2026-06-01");

    // A genuinely different value still re-seeds.
    const diff = createSearchBarStore();
    diff.getState().actions.setDraft("latency:2.0");
    diff.getState().actions.resetTo("latency:3");
    expect(diff.getState().draft).toBe("latency:3");
  });

  it("resetTo keeps a typed `:=` where it lowers identically to the bare `:`", () => {
    // `key:=value` (exact) and `key:value` (=) lower to the same filter for every
    // field except textSearch, and the reverse adapter emits the bare form — so
    // the typed `:=` must stand instead of being rewritten to `:`.
    for (const [typed, derived] of [
      ["level:=ERROR", "level:ERROR"],
      ["latency:=2", "latency:2"],
      ["isRootObservation:=true", "isRootObservation:true"],
      ["metadata.region:=eu", "metadata.region:eu"],
      ["scores.feedback:=positive", "scores.feedback:positive"],
    ] as const) {
      const s = createSearchBarStore();
      s.getState().actions.setDraft(typed);
      s.getState().actions.resetTo(derived);
      expect(s.getState().draft, typed).toBe(typed);
    }
  });

  it("resetTo re-seeds a textSearch `:=` (exact != contains, not foldable)", () => {
    // For textSearch fields `:` means contains and `:=` means exact — different
    // ops, NOT interchangeable. A bare derived form must re-seed (no silent
    // equivalence), unlike the option/number/metadata fields above.
    const store = createSearchBarStore();
    store.getState().actions.setDraft("statusMessage:=foo");
    store.getState().actions.resetTo("statusMessage:foo");
    expect(store.getState().draft).toBe("statusMessage:foo");
  });

  it("resetTo Number-normalizes a numeric score value (not categorical)", () => {
    // accuracy is numeric → `scores.accuracy:2.0` lowers + re-derives to `:2`;
    // keep the typed `.0`, mirroring `latency:2.0`.
    const scoreTypes = {
      numericScoreNames: new Set<string>(["accuracy"]),
      categoricalScoreNames: new Set<string>(),
      traceNumericScoreNames: new Set<string>(),
      traceCategoricalScoreNames: new Set<string>(),
    };
    const store = createSearchBarStore(() => scoreTypes);
    store.getState().actions.setDraft("scores.accuracy:2.0");
    store.getState().actions.resetTo("scores.accuracy:2");
    expect(store.getState().draft).toBe("scores.accuracy:2.0");
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

  it("preview overlays without touching the draft and clears on end", () => {
    // The preview lane is display-only state: while a preset row is hovered
    // the bar shows previewText, but the draft — including in-progress typing
    // that was never committed — must survive untouched.
    const store = createSearchBarStore();
    store.getState().actions.setDraft("level:ERROR name:foo");
    store.getState().actions.setPreview("latency:>10 ");
    expect(store.getState().previewText).toBe("latency:>10 ");
    expect(store.getState().draft).toBe("level:ERROR name:foo");
    store.getState().actions.clearPreview();
    expect(store.getState().previewText).toBeNull();
    expect(store.getState().draft).toBe("level:ERROR name:foo");
  });

  it("clearPreview is a no-op when no preview is active (no churn re-render)", () => {
    // Row leave/blur and the popover's close handler can all end the same
    // preview; the extra calls must not notify subscribers.
    const store = createSearchBarStore();
    let notified = 0;
    const unsub = store.subscribe(() => notified++);
    store.getState().actions.clearPreview();
    expect(notified).toBe(0);
    store.getState().actions.setPreview("level:ERROR ");
    store.getState().actions.setPreview("level:ERROR ");
    expect(notified).toBe(1);
    unsub();
  });

  it("a draft write ends the preview (edit always wins over overlay)", () => {
    const store = createSearchBarStore();
    store.getState().actions.setPreview("latency:>10 ");
    store.getState().actions.setDraft("env:prod");
    expect(store.getState().previewText).toBeNull();

    store.getState().actions.setPreview("latency:>10 ");
    store.getState().actions.resetTo("level:ERROR");
    expect(store.getState().previewText).toBeNull();

    const chip = createSearchBarStore();
    chip.getState().actions.setDraft("level:ERROR env:dev");
    chip.getState().actions.setPreview("latency:>10 ");
    chip.getState().actions.removeChipSpan(0, 11);
    expect(chip.getState().previewText).toBeNull();
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
