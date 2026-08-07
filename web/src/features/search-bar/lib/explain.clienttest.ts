import { deriveComposerSegments } from "@/src/features/search-bar/lib/composer-segments";
import { explainSegment } from "@/src/features/search-bar/lib/explain";

/** Explain the nth token of `query` as the tooltip reads it. */
function explain(query: string, index = 0): string | null {
  const segment = deriveComposerSegments(query)[index];
  const explanation = segment === undefined ? null : explainSegment(segment);
  return explanation === null
    ? null
    : `${explanation.label}. ${explanation.sentence}`;
}

describe("explainSegment", () => {
  it("explains the shapes users misread", () => {
    // The reported confusion: what does a leading dash mean?
    expect(explain("-env:langfuse-experiments")).toBe(
      'Exclude. Hides results where environment is "langfuse-experiments".',
    );
    expect(explain("name:(a OR b)")).toBe(
      'Any of. Matches results where name is exactly "a" or "b".',
    );
    expect(explain("latency:>2")).toBe(
      "Greater than. Matches results where latency is above 2 seconds.",
    );
  });

  it("names the operator each `=` default actually lowers to", () => {
    // Same-looking syntax, three different operators — the whole point of the
    // tooltip. Text columns contain, option columns and metadata match exactly.
    expect(explain("name:chat")).toBe(
      'Contains. Matches results where name contains "chat".',
    );
    expect(explain("name:=chat")).toBe(
      'Exactly. Matches results where name is exactly "chat".',
    );
    expect(explain("metadata.region:eu")).toBe(
      'Exactly. Matches results where the metadata key "region" is exactly "eu".',
    );
    expect(explain("level:ERROR")).toBe(
      'Is. Matches results where level is "ERROR".',
    );
    expect(explain("statusMessage:chat*")).toBe(
      'Starts with. Matches results where statusMessage starts with "chat".',
    );
  });

  it("reads a negated comparison as its flipped operator, like the lowering", () => {
    // Comparisons and booleans invert (INVERTED_COMPARISON / !value) instead of
    // hiding, so the copy must too.
    expect(explain("-latency:>2")).toBe(
      "At most. Matches results where latency is 2 seconds or less.",
    );
    expect(explain("-isRootObservation:true")).toBe(
      "Is false. Matches results where isRootObservation is false.",
    );
    expect(explain("-name:*chat*")).toBe(
      'Does not contain. Hides results where name contains "chat".',
    );
    expect(explain("startTime:>2026-06-01")).toBe(
      "After. Matches results where startTime is after 2026-06-01.",
    );
  });

  it("explains groups, null checks, scores, free text and keywords", () => {
    expect(explain("tags:(a AND b)")).toBe(
      'All of. Matches results where traceTags contains all of "a" and "b".',
    );
    expect(explain("has:endTime")).toBe(
      "Has a value. Matches results where endTime is set.",
    );
    expect(explain("-has:endTime")).toBe(
      "Missing. Matches results where endTime is not set.",
    );
    expect(explain("scores.accuracy:>0.8")).toBe(
      'Greater than. Matches results where the "accuracy" score (observation or trace level) is above 0.8.',
    );
    expect(explain("totalCost:>0.5")).toBe(
      "Greater than. Matches results where totalCost is above $0.5.",
    );
    expect(explain("refund policy")).toContain(
      'Full-text search. Matches results containing "refund policy" in their id, name, input or output.',
    );
    expect(explain("level:ERROR AND latency:>2", 1)).toBe(
      "And. Every filter has to match.",
    );
  });

  it("says nothing where it has nothing to say", () => {
    expect(explain("nope:1")).toBeNull(); // unknown field → its own diagnostic
    expect(explain("(")).toBeNull();
  });
});
