import {
  applyPick,
  flattenOptions,
  planInputCompletions,
  SECTION_COMPARE_OPS,
  SECTION_FIELDS,
  SECTION_MATCH_OPS,
  SECTION_RECENT,
  SECTION_VALUES,
  type CompletionOption,
  type InputCompletionContext,
} from "@/src/features/search-bar/lib/completions";
import type { ObservedOptions } from "@/src/features/search-bar/lib/observed-options";

const OBSERVED: ObservedOptions = {
  level: [
    { value: "ERROR", count: 12 },
    { value: "WARNING", count: 3 },
  ],
  environment: [{ value: "production" }, { value: "dev" }],
  scores_avg: [{ value: "accuracy" }],
  score_categories: [{ value: "feedback" }],
  "score_categories.feedback": [{ value: "positive" }, { value: "negative" }],
  "metadata.region": [{ value: "eu" }, { value: "us" }],
};

function plan(
  input: string,
  caret: number,
  overrides: Partial<InputCompletionContext> = {},
) {
  return planInputCompletions({
    input,
    caret,
    observed: OBSERVED,
    recents: [],
    currentQueryText: input,
    ...overrides,
  });
}

describe("planInputCompletions", () => {
  it("plans the empty stage with fields and recents", () => {
    const p = plan("", 0, { recents: ["level:ERROR"] });
    expect(p?.stage).toBe("empty");
    const titles = p?.sections.map((s) => s.title);
    expect(titles).toContain(SECTION_FIELDS);
    expect(titles).toContain(SECTION_RECENT);
  });

  it("ranks fields against the typed key prefix but does NOT arm Enter (free-text-first)", () => {
    // A bare prefix lists the field but must not hijack Enter — the user may be
    // typing a free-text search. Enter commits the text; the field is one
    // arrow-press away.
    const p = plan("lev", 3);
    expect(p?.stage).toBe("field");
    expect(p?.autoHighlight).toBe(false);
    const first = flattenOptions(p);
    expect(first[0]).toMatchObject({ kind: "field", fieldId: "level" });
  });

  it("arms Enter only when a bare word EXACTLY names a field", () => {
    // Exact field/alias name → arm Enter to start the filter (`level` → `level:`).
    expect(plan("level", 5)?.autoHighlight).toBe(true);
    expect(plan("env", 3)?.autoHighlight).toBe(true); // alias of environment
    // Prefix / substring matches must stay free-text-first (the reported bug:
    // `n` → name:, `ess` → sessionId:).
    expect(plan("n", 1)?.autoHighlight).toBe(false);
    expect(plan("ess", 3)?.autoHighlight).toBe(false); // substring of sessionId
    // No field match at all is already free-text-first.
    expect(plan("abc", 3)?.autoHighlight ?? false).toBe(false);
  });

  it("plans observed values in the value stage", () => {
    const p = plan("level:", 6);
    expect(p?.stage).toBe("value");
    const values = flattenOptions(p).filter((o) => o.kind === "value");
    expect(values.map((o) => o.kind === "value" && o.value)).toEqual([
      "ERROR",
      "WARNING",
    ]);
  });

  it("keeps the observed-value picker for name:/id: while searching as contains", () => {
    // name/id are textSearch (so `name:chat` is a substring search) but carry
    // suggestObservedValues, so the value stage still LISTS observed values and
    // — once a value is typed — offers the glob/exact refinements alongside.
    for (const column of ["name", "id"]) {
      const p = plan(`${column}:`, column.length + 1, {
        observed: { ...OBSERVED, [column]: [{ value: "checkout" }] },
      });
      expect(p?.stage, column).toBe("value");
      const values = flattenOptions(p).filter((o) => o.kind === "value");
      expect(
        values.map((o) => o.kind === "value" && o.value),
        column,
      ).toEqual(["checkout"]);
    }
    const labels = flattenOptions(
      plan("name:chat", 9, {
        observed: { ...OBSERVED, name: [{ value: "chat" }] },
      }),
    ).map((o) => o.label);
    expect(labels).toContain("*chat*"); // contains (the bare-value default)
    expect(labels).toContain("=chat"); // exact
  });

  it("keeps a whitespace-only value an unarmed plain list (space inside empty quotes)", () => {
    // LFE-10501 BUG B. `-traceName:""` with the caret between the quotes lists
    // observed values as a PLAIN, unarmed list — Enter commits the query, not a
    // value. Typing a space between the quotes (`-traceName:" "`) must NOT flip
    // that into an armed, committable value: a lone space matched every value
    // that CONTAINS a space and auto-highlighted the first, so Enter yielded an
    // unwanted `-traceName:"Codex Turn"`.
    const observed = {
      ...OBSERVED,
      traceName: [{ value: "Codex Turn" }, { value: "Other Trace" }],
    };
    // Empty quotes, caret between them — the baseline "just a list" state.
    const empty = plan('-traceName:""', 12, { observed });
    expect(empty?.stage).toBe("value");
    expect(empty?.autoHighlight ?? false).toBe(false);
    expect(
      flattenOptions(empty).some((o) => o.kind === "value" && o.active),
    ).toBe(false);

    // A space between the quotes, caret after it — must stay the same plain list.
    const spaced = plan('-traceName:" "', 13, { observed });
    expect(spaced?.stage).toBe("value");
    expect(spaced?.autoHighlight ?? false).toBe(false);
    const values = flattenOptions(spaced).filter((o) => o.kind === "value");
    // Full observed list still offered for browsing, but nothing armed/active.
    expect(values.map((o) => o.kind === "value" && o.value)).toEqual([
      "Codex Turn",
      "Other Trace",
    ]);
    expect(values.some((o) => o.kind === "value" && o.active)).toBe(false);
    // A lone space must not wrap into match-op refinements (`*" "*`) either.
    expect(spaced?.sections.map((s) => s.title) ?? []).not.toContain(
      SECTION_MATCH_OPS,
    );
  });

  it("still arms Enter for a real typed value prefix (space fix keeps normal typing)", () => {
    // Guard on the BUG B fix: only empty/whitespace-only values go unarmed. A
    // real prefix (`ER`) still ranks + arms Enter-to-complete.
    const p = plan("level:ER", 8);
    expect(p?.autoHighlight).toBe(true);
    const first = flattenOptions(p).find((o) => o.kind === "value");
    expect(first).toMatchObject({ kind: "value", value: "ERROR" });
  });

  it("marks a complete typed value active without arming Enter", () => {
    const p = plan("level:ERROR", 11);
    expect(p?.autoHighlight).toBe(false);
    const first = flattenOptions(p)[0];
    expect(first).toMatchObject({
      kind: "value",
      value: "ERROR",
      active: true,
    });
  });

  it("plans the value stage when switching a quoted value (strips both quotes)", () => {
    // A picked value with a space serializes to `traceName:"My Test Trace"`.
    // Clicking back into it to switch must still match the observed value —
    // the typed text has to drop BOTH quotes, not just the leading one.
    const p = plan('traceName:"My Test Trace"', 25, {
      observed: { ...OBSERVED, traceName: [{ value: "My Test Trace" }] },
    });
    expect(p?.stage).toBe("value");
    const first = flattenOptions(p)[0];
    expect(first).toMatchObject({
      kind: "value",
      value: "My Test Trace",
      active: true,
    });
  });

  it("plans the value stage when switching a grouped quoted value", () => {
    // Same as the non-grouped case but inside `(... OR ...)`: clicking into
    // `"My Tag"` must match the observed tag, so both quotes have to drop.
    const p = plan('traceTags:("My Tag" OR "Other")', 14, {
      observed: {
        ...OBSERVED,
        traceTags: [{ value: "My Tag" }, { value: "Other" }],
      },
    });
    expect(p?.stage).toBe("value");
    const values = flattenOptions(p)
      .filter((o) => o.kind === "value")
      .map((o) => (o.kind === "value" ? o.value : null));
    expect(values).toContain("My Tag");
  });

  it("omits the negation pattern when the term already starts with '-'", () => {
    // The user has committed to negation by typing `-`; suggesting the
    // negation pattern (which inserts its own `-`) would double-dash to
    // `--environment:`.
    const ids = flattenOptions(plan("-", 1)).map((o) => o.id);
    expect(ids).not.toContain("pat:negation");
  });

  it("offers comparisons for numeric fields", () => {
    const p = plan("latency:", 8);
    expect(p?.sections.map((s) => s.title)).toContain(SECTION_COMPARE_OPS);
    // No dead-end option: every comparison pick must insert a symbol. The old
    // `=` entry inserted "" — picking it left the draft unchanged (silent).
    const opts = flattenOptions(p);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect("insert" in o && o.insert, JSON.stringify(o)).toBeTruthy();
    }
  });

  it("does not offer match operators for array fields (operatorIssue rejects them)", () => {
    const p = plan("traceTags:", 10, {
      observed: { ...OBSERVED, traceTags: [{ value: "a" }, { value: "b" }] },
    });
    expect(p?.stage).toBe("value");
    expect(p?.sections.map((s) => s.title)).not.toContain(SECTION_MATCH_OPS);
  });

  it("offers glob match refinements once a text value is typed", () => {
    // Empty value → nothing to wrap, no match-op section.
    const empty = plan("statusMessage:", 14);
    expect(empty?.sections.map((s) => s.title) ?? []).not.toContain(
      SECTION_MATCH_OPS,
    );
    // Typed value → wrap it in positional `*` globs (+ exact).
    const p = plan("statusMessage:rate", 18);
    expect(p?.sections.map((s) => s.title)).toContain(SECTION_MATCH_OPS);
    const labels = flattenOptions(p).map((o) => o.label);
    expect(labels).toContain("*rate*"); // contains
    expect(labels).toContain("rate*"); // starts with
    expect(labels).toContain("*rate"); // ends with
    expect(labels).toContain("=rate"); // exact
  });

  it("quotes glob refinements for values with whitespace", () => {
    // `My Test` must serialize to `*"My Test"*`, not the raw `*My Test*` the
    // lexer would split in half.
    const p = plan('statusMessage:"My Test"', 23);
    const inserts = flattenOptions(p).flatMap((o) =>
      "insert" in o ? [o.insert] : [],
    );
    expect(inserts).toContain('*"My Test"*'); // contains
    expect(inserts).toContain('"My Test"*'); // starts with
    expect(inserts).toContain('="My Test"'); // exact
  });

  it("suggests score names for score dot paths", () => {
    const p = plan("scores.", 7);
    const labels = flattenOptions(p).map((o) => o.label);
    expect(labels).toContain("scores.accuracy");
    expect(labels).toContain("scores.feedback");
  });

  it("suggests trace-score names for every accepted alias incl. singular tracescore.", () => {
    // The parser resolves tracescore./tracescores./trace_scores.; each must also
    // produce the score-name dropdown, or that spelling parses but suggests
    // nothing. (The singular form was previously missing from PATH_PREFIXES.)
    // Both trace score-name columns are requested + returned together, so model
    // the categorical one as loaded-but-empty (lazy mode keys loading on column
    // presence, not value count).
    const observed = {
      ...OBSERVED,
      trace_scores_avg: [{ value: "nps" }],
      trace_score_categories: [],
    };
    for (const prefix of ["tracescore.", "tracescores.", "trace_scores."]) {
      const p = plan(prefix, prefix.length, { observed });
      const labels = flattenOptions(p).map((o) => o.label);
      expect(labels, prefix).toContain("traceScores.nps");
    }
  });

  it("suggests categorical score values", () => {
    const p = plan("scores.feedback:", 16);
    expect(p?.sections.map((s) => s.title)).toContain(SECTION_VALUES);
    const values = flattenOptions(p).filter((o) => o.kind === "value");
    expect(values.map((o) => o.kind === "value" && o.value)).toEqual([
      "positive",
      "negative",
    ]);
  });

  it("suggests metadata values for known keys", () => {
    const p = plan("metadata.region:", 16);
    const values = flattenOptions(p).filter((o) => o.kind === "value");
    expect(values.map((o) => o.kind === "value" && o.value)).toEqual([
      "eu",
      "us",
    ]);
  });

  it("offers scoped full-text rewrites for free text, default scope first", () => {
    const p = plan("refund", 6);
    const opts = flattenOptions(p);
    // The typed text itself (default scope = ids+names+input+output) is the
    // first option — the anchor — ahead of the input:/output: rewrites.
    expect(opts[0]).toMatchObject({ id: "scope:default", label: "refund" });
    const labels = opts.map((o) => o.label);
    expect(labels).toContain("input:refund");
    expect(labels).toContain("output:refund");
    // content: was removed — the default already searches input + output.
    expect(labels).not.toContain("content:refund");
  });

  it("scopes the WHOLE coalesced free-text run, not just the caret word", () => {
    // Caret inside the middle word of `abc abc abc` — the rewrite must wrap the
    // whole run as a quoted phrase and carry its span, so picking it doesn't
    // strand the other words as free text.
    const p = plan("abc abc abc", 5);
    const opts = flattenOptions(p);
    const input = opts.find((o) => o.id === "scope:input");
    expect(input?.label).toBe('input:"abc abc abc"');
    expect(input && "insert" in input && input.insert).toBe(
      'input:"abc abc abc"',
    );
    expect(input && "replaceSpan" in input && input.replaceSpan).toEqual({
      from: 0,
      to: 11,
    });
  });

  it("scopes the WHOLE run even when a bare word matches a field alias", () => {
    // `tags` is a registered alias (traceTags), but with no `:` it is free text
    // — the parser/composer treat it so, and the run must expand across it.
    // Otherwise the rewrite wraps only `hello` and picking it strands `tags`.
    const p = plan("tags hello", 8);
    const input = flattenOptions(p).find((o) => o.id === "scope:input");
    expect(input?.label).toBe('input:"tags hello"');
    expect(input && "replaceSpan" in input && input.replaceSpan).toEqual({
      from: 0,
      to: 10,
    });
  });

  it("does not double-quote an already-quoted free-text phrase on scope rewrite", () => {
    // `"hello world"` already carries quotes; the rewrite reconstructs the
    // logical phrase and re-serializes it once, so the insert is
    // `input:"hello world"` — not the broken doubly-quoted
    // `input:"\"hello world\""` that searches for literal quotes.
    const p = plan('"hello world"', 6);
    const input = flattenOptions(p).find((o) => o.id === "scope:input");
    expect(input && "insert" in input && input.insert).toBe(
      'input:"hello world"',
    );
  });

  it("coalesces a quoted phrase + bare words into ONE clean phrase (no escaped quotes)", () => {
    // The compounding bug: a run that mixes an already-quoted phrase with bare
    // words (`"abc abc" abc`) must reconstruct to the logical `abc abc abc` and
    // re-serialize as a single `"abc abc abc"` — never `"abc abc\" abc"`.
    const p = plan('"abc abc" abc', 11);
    const opts = flattenOptions(p);
    const def = opts.find((o) => o.id === "scope:default");
    const input = opts.find((o) => o.id === "scope:input");
    expect(def && "insert" in def && def.insert).toBe('"abc abc abc"');
    expect(input && "insert" in input && input.insert).toBe(
      'input:"abc abc abc"',
    );
    // The whole raw run (quotes and all) is the replace span.
    expect(def && "replaceSpan" in def && def.replaceSpan).toEqual({
      from: 0,
      to: 13,
    });
  });

  it("teaches the positional-glob contains form, not the retired ~value", () => {
    // pat:contains must advertise + insert the `*value*` glob the parser now
    // understands; the old `name:~chat` lowered to a literal any-of on `~chat`.
    const p = plan("field", 5);
    const pat = flattenOptions(p).find((o) => o.id === "pat:contains");
    expect(pat?.label).toBe("field:*value*");
    expect(pat && "insert" in pat && pat.insert).toBe("name:*chat*");
  });

  it("offers scope switches when the caret is in an input: value", () => {
    // input:/output: are full-text scopes too — clicking into input:abc must
    // offer output:/default (and the glob refinements), each rewriting the WHOLE
    // token, never a switch back to input:.
    const p = plan("input:abc", 9);
    const opts = flattenOptions(p);
    const ids = opts.map((o) => o.id);
    expect(ids).toEqual(
      expect.arrayContaining(["scope:output", "scope:default"]),
    );
    expect(ids).not.toContain("scope:input");
    // content: was removed — never offered as a switch target.
    expect(ids).not.toContain("scope:content");
    const toOutput = opts.find((o) => o.id === "scope:output");
    expect(toOutput && "insert" in toOutput && toOutput.insert).toBe(
      "output:abc",
    );
    expect(
      toOutput && "replaceSpan" in toOutput && toOutput.replaceSpan,
    ).toEqual({ from: 0, to: 9 });
    // Glob refinements still ride alongside the scope switches.
    const labels = opts.map((o) => o.label);
    expect(labels).toContain("*abc*");
  });

  it("offers contains + exact for a negated input/output value, but no scope switches", () => {
    // tokenSpan covers the leading `-`, so a scope rewrite would splice it away
    // and flip `does not contain` → `contains` (the complement). The value
    // stage must suppress the switches when negated (match-op refinements stay).
    for (const q of ["-input:refund", "-output:refund"]) {
      const opts = flattenOptions(plan(q, q.length));
      const ids = opts.map((o) => o.id);
      expect(ids, q).not.toContain("scope:content");
      expect(ids, q).not.toContain("scope:output");
      expect(ids, q).not.toContain("scope:input");
      expect(ids, q).not.toContain("scope:default");
      // Starts/ends-with have no inverse operator, so they are gone. Contains
      // stays, and on a textSearch field exact stays too: `-input:=refund`
      // lowers to a `stringOptions none of` (exact inequality), distinct from
      // the substring `-input:refund` (does not contain).
      const labels = opts.map((o) => o.label);
      expect(labels, q).toContain("*refund*"); // contains (does not contain)
      expect(labels, q).toContain("=refund"); // exact (does not equal)
      expect(labels, q).not.toContain("refund*"); // starts with
      expect(labels, q).not.toContain("*refund"); // ends with
    }
  });

  it("offers exact on a negated id/name value (none-of), distinct from contains", () => {
    // id/name are textSearch fields with observed-value pickers. `-name:=foo`
    // is representable (-> stringOptions none of) and meaningfully different from
    // the substring `-name:foo` (does not contain), so the value stage offers it.
    const opts = flattenOptions(plan("-name:foo", "-name:foo".length));
    const labels = opts.map((o) => o.label);
    expect(labels).toContain("*foo*"); // contains (does not contain)
    expect(labels).toContain("=foo"); // exact (does not equal -> none of)
    expect(labels).not.toContain("foo*"); // starts with — no inverse op
    expect(labels).not.toContain("*foo"); // ends with — no inverse op
  });

  it("offers only contains on a negated exactOption value", () => {
    // Same parity as the textSearch case above, for exactOption text fields
    // (level/environment/name/…): starts-with (`^`) and ends-with (`$`) wrapped
    // in NOT are "not representable" (negationIssue), so picking them would land
    // a red invalid draft. The value stage must offer only the contains glob.
    const opts = flattenOptions(plan("-level:foo", "-level:foo".length));
    const labels = opts.map((o) => o.label);
    expect(labels).toContain("*foo*"); // contains (does not contain)
    expect(labels).not.toContain("foo*"); // starts with — no inverse op
    expect(labels).not.toContain("*foo"); // ends with — no inverse op
    expect(labels).not.toContain("=foo"); // exact — redundant w/ bare value
  });

  it("offers observed metadata/score names with grammar chars, quoted for insertion", () => {
    // An observed score named `foo:bar` (or a name with spaces) IS suggested:
    // the INSERTED text quotes the segment (`scores."foo:bar"`) so it re-lexes
    // as one token, while the LABEL stays the readable bare form (so it ranks
    // against the user's typed prefix).
    const observed = {
      ...OBSERVED,
      scores_avg: [{ value: "accuracy" }, { value: "foo:bar" }],
      metadata: [{ value: "region" }, { value: "a b" }],
    };
    const scoreOpts = flattenOptions(plan("scores.", 7, { observed }));
    expect(scoreOpts.map((o) => o.label)).toContain("scores.accuracy");
    const fooBar = scoreOpts.find((o) => o.label === "scores.foo:bar");
    expect(fooBar && "fieldId" in fooBar && fooBar.fieldId).toBe(
      'scores."foo:bar"',
    );
    const metaOpts = flattenOptions(plan("metadata.", 9, { observed }));
    expect(metaOpts.map((o) => o.label)).toContain("metadata.region");
    const spaced = metaOpts.find((o) => o.label === "metadata.a b");
    expect(spaced && "fieldId" in spaced && spaced.fieldId).toBe(
      'metadata."a b"',
    );
  });

  it("keeps the key-path popover open while typing the quote for a spaced name", () => {
    // The documented syntax is `scores."Rouge Score"`; typing the leading quote
    // must keep ranking the (bare-labelled) options instead of closing the
    // popover. Works the same for metadata.
    const observed = {
      ...OBSERVED,
      scores_avg: [{ value: "Rouge Score" }],
      metadata: [{ value: "my key" }],
    };
    for (const q of ['scores."', 'scores."Rou', 'scores."Rouge Score']) {
      const opts = flattenOptions(plan(q, q.length, { observed }));
      const hit = opts.find(
        (o) => "fieldId" in o && o.fieldId === 'scores."Rouge Score"',
      );
      expect(hit, q).toBeDefined();
    }
    const metaOpts = flattenOptions(plan('metadata."my', 12, { observed }));
    expect(
      metaOpts.find((o) => "fieldId" in o && o.fieldId === 'metadata."my key"'),
    ).toBeDefined();
  });

  it("quotes a spaced score name in the numeric compare-op example", () => {
    const observed = { ...OBSERVED, scores_avg: [{ value: "Rouge Score" }] };
    const q = 'scores."Rouge Score":';
    const details = flattenOptions(plan(q, q.length, { observed }))
      .map((o) => ("detail" in o ? o.detail : undefined))
      .filter(Boolean);
    expect(details.some((d) => d?.includes('scores."Rouge Score":'))).toBe(
      true,
    );
  });

  it("keeps the value stage live for a glob value (re-form + re-scope)", () => {
    // `output:*ole*` is a contains glob. Clicking into the value must still
    // plan the value stage: a leading `*` is a glob ANCHOR, not a value-
    // suppressing operator prefix. Regression for the popover going dead on
    // any glob-wrapped full-text value.
    const p = plan("output:*ole*", 9);
    expect(p?.stage).toBe("value");
    const opts = flattenOptions(p);
    const labels = opts.map((o) => o.label);
    // Match-op refinements operate on the BARE core (`ole`), not `*ole*`.
    expect(labels).toContain("*ole*"); // contains (current form)
    expect(labels).toContain("ole*"); // starts with
    expect(labels).toContain("=ole"); // exact
    const ids = opts.map((o) => o.id);
    expect(ids).toEqual(
      expect.arrayContaining(["scope:input", "scope:default"]),
    );
    expect(ids).not.toContain("scope:output");
    expect(ids).not.toContain("scope:content");
  });

  it("treats leading ~/^/$ as literal value chars, not suppressing prefixes", () => {
    // The value-prefix regex must mirror langQ's OPERATOR_PREFIXES (>= <= > < =)
    // and nothing more. After the glob migration `~`/`^`/`$` are literal chars,
    // so a value starting with one must still plan the value stage (wrapping the
    // literal), never bail to a blank popover.
    for (const value of ["~chat", "^chat", "$chat"]) {
      const p = plan(`statusMessage:${value}`, `statusMessage:${value}`.length);
      expect(p?.stage).toBe("value");
      // The match-op refinements wrap the WHOLE literal value (incl. the `~`).
      const labels = flattenOptions(p).map((o) => o.label);
      expect(labels).toContain(`*${value}*`);
    }
  });

  it("plans grouped value segments with keep-open for incomplete groups", () => {
    const p = plan("level:(ERROR OR ", 16);
    expect(p?.stage).toBe("value");
    expect(p?.keepOpenOnPick).toBe(true);
  });

  it("shows a loading row while observed values load", () => {
    const p = plan("level:", 6, { observed: undefined });
    expect(p?.loading).toBe(true);
  });

  describe("lazy filter-options (per-field on-demand loading)", () => {
    // observed is loaded for some columns but the typed field's column is absent
    // (not yet requested/streamed in). Distinct from observed === undefined.
    it("requests an option field's column and shows loading when its values are absent", () => {
      const p = plan("userId:", 7, { observed: OBSERVED });
      expect(p?.stage).toBe("value");
      expect(p?.loading).toBe(true);
      expect(p?.requestColumns).toEqual(["userId"]);
      expect(flattenOptions(p)).toHaveLength(0);
    });

    it("shows values (no loading, no request) once the column is present — even when empty", () => {
      const present = plan("userId:", 7, {
        observed: { ...OBSERVED, userId: [{ value: "u-1" }] },
      });
      expect(present?.loading).toBe(false);
      expect(present?.requestColumns).toBeUndefined();
      expect(flattenOptions(present).map((o) => o.label)).toContain("u-1");

      // Loaded-but-empty ([] present) is NOT loading — it offers no values (a
      // bare `userId:` with no matches yields no popover at all).
      const empty = plan("userId:", 7, {
        observed: { ...OBSERVED, userId: [] },
      });
      expect(empty?.loading).not.toBe(true);
      expect(empty?.requestColumns).toBeUndefined();
    });

    it("never lazy-loads a textSearch field with no server option list (id)", () => {
      // `id` is textSearch + suggestObservedValues but has no filter-options
      // column, so it must not show an endless loading row or request a column.
      const p = plan("id:abc", 6, { observed: OBSERVED });
      expect(p?.loading).toBe(false);
      expect(p?.requestColumns).toBeUndefined();
    });

    it("requests both score-name columns and shows loading on a score path", () => {
      const p = plan("scores.", 7, {
        observed: { level: [{ value: "ERROR" }] },
      });
      expect(p?.loading).toBe(true);
      expect(p?.requestColumns).toEqual(["scores_avg", "score_categories"]);
    });

    it("requests trace score-name columns while typing a trace score value", () => {
      const p = plan("traceScores.nps:", 16, {
        observed: { level: [{ value: "ERROR" }] },
      });
      expect(p?.loading).toBe(true);
      expect(p?.requestColumns).toEqual([
        "trace_scores_avg",
        "trace_score_categories",
      ]);
    });

    // A column whose fetch terminally errored settles to the empty state (no
    // loading row, no further request) — matching the sidebar — since there is no
    // auto-retry. Threaded per column via `erroredColumns`.
    it("settles an errored column to empty (no loading, no request)", () => {
      const field = plan("userId:", 7, {
        observed: OBSERVED,
        erroredColumns: new Set(["userId"]),
      });
      expect(field?.loading).not.toBe(true);
      expect(field?.requestColumns).toBeUndefined();

      const score = plan("scores.", 7, {
        observed: { level: [{ value: "ERROR" }] },
        erroredColumns: new Set(["scores_avg", "score_categories"]),
      });
      expect(score?.loading).not.toBe(true);
      expect(score?.requestColumns).toBeUndefined();
    });

    // One column's error must NOT block loading another (per-column, not global):
    // a userId timeout still lets sessionId load on demand.
    it("still loads a different column when an unrelated one errored", () => {
      const p = plan("sessionId:", 10, {
        observed: OBSERVED,
        erroredColumns: new Set(["userId"]),
      });
      expect(p?.loading).toBe(true);
      expect(p?.requestColumns).toEqual(["sessionId"]);
    });
  });

  it("never suggests the OR keyword between filters", () => {
    const p = plan("O", 1);
    const operators = flattenOptions(p).filter((o) => o.kind === "operator");
    expect(operators.map((o) => o.label)).not.toContain("OR");
  });
});

describe("applyPick", () => {
  // Narrowing helper: the popover only picks non-recent options here.
  const nonRecent = (o: CompletionOption | undefined) =>
    o as Exclude<CompletionOption, { kind: "recent" }>;

  it("keeps the caret INSIDE the block after picking a numeric operator", () => {
    // LFE-10501 BUG A. Picking `>` for a numeric field must not append a
    // trailing space and jump the caret outside the filter — an operator
    // invites the value next, so the caret stays right after the symbol and the
    // next keystroke types the number into `latency:>`.
    const p = plan("latency:", 8);
    const gt = flattenOptions(p).find(
      (o) => o.kind === "operator" && o.label === ">",
    );
    expect(gt).toBeDefined();
    const result = applyPick(nonRecent(gt), "latency:", p!);
    expect(result.next).toBe("latency:>"); // no trailing space appended
    expect(result.caret).toBe(9); // caret sits right after `>`, inside the block
  });

  it("keeps the caret inside the block for datetime operators too", () => {
    const p = plan("startTime:", 10);
    const gte = flattenOptions(p).find(
      (o) => o.kind === "operator" && o.label === ">=",
    );
    expect(gte).toBeDefined();
    const result = applyPick(nonRecent(gte), "startTime:", p!);
    expect(result.next).toBe("startTime:>=");
    expect(result.caret).toBe(12);
  });

  it("keeps the caret inside a score-path block for its comparison operators", () => {
    const q = "scores.accuracy:";
    const p = plan(q, q.length);
    const lt = flattenOptions(p).find(
      (o) => o.kind === "operator" && o.label === "<",
    );
    expect(lt).toBeDefined();
    const result = applyPick(nonRecent(lt), q, p!);
    expect(result.next).toBe(`${q}<`);
    expect(result.caret).toBe(q.length + 1);
  });

  it("still appends a trailing space + jumps out when a VALUE completes the filter at end", () => {
    // Guard: the operator fix must not disturb the completes-at-end affordance
    // for value picks — `level:` + ERROR still lands `level:ERROR ` with the
    // caret AFTER the trailing space so the next filter starts outside the pill.
    const p = plan("level:", 6);
    const err = flattenOptions(p).find(
      (o) => o.kind === "value" && o.value === "ERROR",
    );
    expect(err).toBeDefined();
    const result = applyPick(nonRecent(err), "level:", p!);
    expect(result.next).toBe("level:ERROR ");
    expect(result.caret).toBe(12);
    expect(result.keepOpen).toBe(true);
  });

  it("keeps the caret put for an AND/NOT connective (trailing space already inserted)", () => {
    // AND/NOT already carry their own trailing space, so they were never the
    // BUG A case — assert the operator clause leaves them unchanged.
    const p = plan("level:ERROR N", 13);
    const not = flattenOptions(p).find(
      (o) => o.kind === "operator" && o.label === "NOT",
    );
    expect(not).toBeDefined();
    const result = applyPick(nonRecent(not), "level:ERROR N", p!);
    expect(result.next).toBe("level:ERROR NOT ");
    expect(result.caret).toBe("level:ERROR NOT ".length);
  });
});
