import {
  flattenOptions,
  planInputCompletions,
  SECTION_COMPARE_OPS,
  SECTION_FIELDS,
  SECTION_MATCH_OPS,
  SECTION_RECENT,
  SECTION_VALUES,
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

  it("ranks fields against the typed key prefix and arms Enter", () => {
    const p = plan("lev", 3);
    expect(p?.stage).toBe("field");
    expect(p?.autoHighlight).toBe(true);
    const first = flattenOptions(p);
    expect(first[0]).toMatchObject({ kind: "field", fieldId: "level" });
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
    const inserts = flattenOptions(p).map((o) => o.insert);
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
    // The typed text itself (default scope = ids & names) is the first option —
    // the anchor — ahead of the content:/input:/output: rewrites.
    expect(opts[0]).toMatchObject({ id: "scope:default", label: "refund" });
    const labels = opts.map((o) => o.label);
    expect(labels).toContain("content:refund");
    expect(labels).toContain("input:refund");
    expect(labels).toContain("output:refund");
  });

  it("scopes the WHOLE coalesced free-text run, not just the caret word", () => {
    // Caret inside the middle word of `abc abc abc` — the rewrite must wrap the
    // whole run as a quoted phrase and carry its span, so picking it doesn't
    // strand the other words as free text.
    const p = plan("abc abc abc", 5);
    const opts = flattenOptions(p);
    const content = opts.find((o) => o.id === "scope:content");
    expect(content?.label).toBe('content:"abc abc abc"');
    expect(content && "insert" in content && content.insert).toBe(
      'content:"abc abc abc"',
    );
    expect(content && "replaceSpan" in content && content.replaceSpan).toEqual({
      from: 0,
      to: 11,
    });
  });

  it("does not double-quote an already-quoted free-text phrase on scope rewrite", () => {
    // `"hello world"` already carries quotes; the rewrite reconstructs the
    // logical phrase and re-serializes it once, so the insert is
    // `content:"hello world"` — not the broken doubly-quoted
    // `content:"\"hello world\""` that searches for literal quotes.
    const p = plan('"hello world"', 6);
    const content = flattenOptions(p).find((o) => o.id === "scope:content");
    expect(content && "insert" in content && content.insert).toBe(
      'content:"hello world"',
    );
  });

  it("coalesces a quoted phrase + bare words into ONE clean phrase (no escaped quotes)", () => {
    // The compounding bug: a run that mixes an already-quoted phrase with bare
    // words (`"abc abc" abc`) must reconstruct to the logical `abc abc abc` and
    // re-serialize as a single `"abc abc abc"` — never `"abc abc\" abc"`.
    const p = plan('"abc abc" abc', 11);
    const opts = flattenOptions(p);
    const def = opts.find((o) => o.id === "scope:default");
    const content = opts.find((o) => o.id === "scope:content");
    expect(def && "insert" in def && def.insert).toBe('"abc abc abc"');
    expect(content && "insert" in content && content.insert).toBe(
      'content:"abc abc abc"',
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

  it("offers scope switches when the caret is in a content: value", () => {
    // The reverse of free-text → content:: clicking into content:"abc" offers
    // input:/output:/default, each rewriting the WHOLE content: token.
    const p = plan('content:"abc"', 10);
    const opts = flattenOptions(p);
    expect(opts.map((o) => o.id)).toEqual(
      expect.arrayContaining(["scope:input", "scope:output", "scope:default"]),
    );
    // content: must NOT offer a switch back to itself.
    expect(opts.map((o) => o.id)).not.toContain("scope:content");
    const toInput = opts.find((o) => o.id === "scope:input");
    expect(toInput && "insert" in toInput && toInput.insert).toBe("input:abc");
    expect(toInput && "replaceSpan" in toInput && toInput.replaceSpan).toEqual({
      from: 0,
      to: 13,
    });
    const toDefault = opts.find((o) => o.id === "scope:default");
    expect(toDefault && "insert" in toDefault && toDefault.insert).toBe("abc");
  });

  it("offers scope switches when the caret is in an input: value", () => {
    // input:/output: are full-text scopes too — clicking into input:abc must
    // offer content:/output:/default (and the glob refinements), each rewriting
    // the WHOLE token, never a switch back to input:.
    const p = plan("input:abc", 9);
    const opts = flattenOptions(p);
    const ids = opts.map((o) => o.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "scope:content",
        "scope:output",
        "scope:default",
      ]),
    );
    expect(ids).not.toContain("scope:input");
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
      expect.arrayContaining(["scope:content", "scope:input", "scope:default"]),
    );
    expect(ids).not.toContain("scope:output");
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

  it("never suggests the OR keyword between filters", () => {
    const p = plan("O", 1);
    const operators = flattenOptions(p).filter((o) => o.kind === "operator");
    expect(operators.map((o) => o.label)).not.toContain("OR");
  });
});
