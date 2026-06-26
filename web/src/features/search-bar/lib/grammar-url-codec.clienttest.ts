import { describe, expect, it } from "vitest";

import { encodeFilterInput } from "@/src/features/filters/lib/filter-query-encoding";
import {
  decodeGrammarFilter,
  encodeGrammarFilter,
  GRAMMAR_VERSION,
} from "@/src/features/search-bar/lib/grammar-url-codec";

describe("grammar-url-codec — round-trip", () => {
  it("round-trips a flat AND query (stable encode∘decode∘encode)", () => {
    const v = `${GRAMMAR_VERSION}:level:ERROR latency:>5`;
    const decoded = decodeGrammarFilter(v);
    expect(decoded).not.toBeNull();
    expect(Array.isArray(decoded!.filterInput)).toBe(true); // flat
    const re = encodeGrammarFilter(decoded!.filterInput, {
      searchQuery: decoded!.searchQuery,
      searchType: decoded!.searchType,
    });
    expect(re).toBe(v);
  });

  it("round-trips a cross-field OR tree", () => {
    const v = `${GRAMMAR_VERSION}:level:ERROR OR latency:>5`;
    const decoded = decodeGrammarFilter(v);
    expect(decoded).not.toBeNull();
    expect(Array.isArray(decoded!.filterInput)).toBe(false); // tree
    const re = encodeGrammarFilter(decoded!.filterInput);
    expect(re).toBe(v);
  });

  it("preserves free text as searchQuery through the codec", () => {
    const decoded = decodeGrammarFilter(
      `${GRAMMAR_VERSION}:level:ERROR refund`,
    );
    expect(decoded).not.toBeNull();
    expect(decoded!.searchQuery).toBe("refund");
  });

  it("prefixes the current grammar version on encode", () => {
    const v = decodeGrammarFilter(`${GRAMMAR_VERSION}:level:ERROR`);
    const re = encodeGrammarFilter(v!.filterInput);
    expect(re?.startsWith(`${GRAMMAR_VERSION}:`)).toBe(true);
  });
});

describe("grammar-url-codec — compactness vs legacy JSON", () => {
  it("is dramatically smaller than the JSON tree for a genuine nested tree", () => {
    // Cross-field AND-groups ORed together stay a TREE (they don't collapse to a
    // flat any-of like same-field OR does), so the legacy encoding is verbose
    // JSON — the exact case grammar text wins. (For same-field multi-value the
    // input collapses to a flat filter and the legacy `|`-delimited form is
    // already compact, so this win is specifically about nested/cross-field.)
    const branches = Array.from(
      { length: 30 },
      (_, i) => `(name:n${i} latency:>${i})`,
    );
    const v = `${GRAMMAR_VERSION}:${branches.join(" OR ")}`;
    const decoded = decodeGrammarFilter(v);
    expect(decoded).not.toBeNull();
    expect(Array.isArray(decoded!.filterInput)).toBe(false); // a real tree
    const grammar = encodeGrammarFilter(decoded!.filterInput)!;
    const json = encodeFilterInput(decoded!.filterInput); // legacy JSON-tree encoding
    expect(grammar.length).toBeLessThan(json.length / 2);
  });
});

describe("grammar-url-codec — graceful fallback (returns null, never throws)", () => {
  it("rejects an unversioned value", () => {
    // No leading "<int>:" — the first ":" belongs to a field token.
    expect(decodeGrammarFilter("level:ERROR")).toBeNull();
  });

  it("rejects empty / colon-less input", () => {
    expect(decodeGrammarFilter("")).toBeNull();
    expect(decodeGrammarFilter(null)).toBeNull();
    expect(decodeGrammarFilter("noseparator")).toBeNull();
  });

  it("rejects a version newer than this client (un-migratable forward)", () => {
    expect(
      decodeGrammarFilter(`${GRAMMAR_VERSION + 1}:level:ERROR`),
    ).toBeNull();
  });

  it("rejects version 0 / non-integer versions", () => {
    expect(decodeGrammarFilter("0:level:ERROR")).toBeNull();
    expect(decodeGrammarFilter("x:level:ERROR")).toBeNull();
  });

  it("rejects grammar text that doesn't validate", () => {
    expect(decodeGrammarFilter(`${GRAMMAR_VERSION}:level:`)).toBeNull();
    expect(
      decodeGrammarFilter(`${GRAMMAR_VERSION}:totallyUnknownField:x`),
    ).toBeNull();
  });

  it("encodes null/empty input as null (caller keeps the legacy param)", () => {
    expect(encodeGrammarFilter([])).toBeNull();
    expect(encodeGrammarFilter(null)).toBeNull();
    expect(encodeGrammarFilter(undefined)).toBeNull();
  });
});
