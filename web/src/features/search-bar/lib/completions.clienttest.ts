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

  it("offers comparisons for numeric fields", () => {
    const p = plan("latency:", 8);
    expect(p?.sections.map((s) => s.title)).toContain(SECTION_COMPARE_OPS);
  });

  it("offers match operators for plain text fields", () => {
    const p = plan("statusMessage:", 14);
    expect(p?.sections.map((s) => s.title)).toContain(SECTION_MATCH_OPS);
    // No FTS * operator — full text goes through in: scopes.
    const labels = flattenOptions(p).map((o) => o.label);
    expect(labels).not.toContain("*");
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

  it("offers scoped full-text rewrites for free text", () => {
    const p = plan("refund", 6);
    const labels = flattenOptions(p).map((o) => o.label);
    expect(labels).toContain("input:~refund");
    expect(labels).toContain("in:content refund");
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
