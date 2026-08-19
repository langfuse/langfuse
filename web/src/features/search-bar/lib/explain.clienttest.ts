// @vitest-environment node

import { deriveComposerSegments } from "@/src/features/search-bar/lib/composer-segments";
import { explainSegment } from "@/src/features/search-bar/lib/explain";
import { FIELDS } from "@/src/features/search-bar/lib/fields";

/** Explain the nth token of `query` as the tooltip reads it. */
function explain(query: string, index = 0): string | null {
  const segment = deriveComposerSegments(query)[index];
  const explanation = segment === undefined ? null : explainSegment(segment);
  return explanation === null
    ? null
    : `${explanation.subject} ${explanation.predicate}`.trim();
}

describe("explainSegment", () => {
  it("explains the shapes users misread", () => {
    // The reported confusion: what does a leading dash mean, and what is `env`?
    expect(explain("-env:langfuse-experiments")).toBe(
      'Environment is not "langfuse-experiments".',
    );
    expect(explain("name:(a OR b)")).toBe('Name is exactly "a" or "b".');
    expect(explain("latency:>2")).toBe("Latency is above 2 seconds.");
  });

  it("names the operator each `=` default actually lowers to", () => {
    // Same-looking syntax, three different operators — the whole point of the
    // tooltip. Text columns contain, option columns and metadata match exactly.
    expect(explain("name:chat")).toBe('Name contains "chat".');
    expect(explain("name:=chat")).toBe('Name is exactly "chat".');
    expect(explain("metadata.region:eu")).toBe(
      'Metadata "region" is exactly "eu".',
    );
    expect(explain("level:ERROR")).toBe('Status is "ERROR".');
    expect(explain("statusMessage:chat*")).toBe(
      'Status message starts with "chat".',
    );
    // `:=` and the bare form lower to the same numeric filter, so a number
    // never reads as a quoted string.
    expect(explain("latency:=2")).toBe(explain("latency:2"));
    expect(explain("latency:=2")).toBe("Latency is 2 seconds.");
  });

  it("reads a negated comparison as its flipped operator, like the lowering", () => {
    // Comparisons and booleans invert (INVERTED_COMPARISON / !value) instead of
    // hiding, so the copy must too.
    expect(explain("-latency:>2")).toBe("Latency is 2 seconds or less.");
    expect(explain("isRootObservation:true")).toBe("Is root observation.");
    expect(explain("-isRootObservation:true")).toBe("Is not root observation.");
    expect(explain("isRootObservation:false")).toBe("Is not root observation.");
    expect(explain("hasInput:false")).toBe("Has no input.");
    expect(explain("-name:*chat*")).toBe('Name does not contain "chat".');
    expect(explain("startTime:>2026-06-01")).toBe(
      "Start time is after 2026-06-01.",
    );
    expect(explain("-level:(ERROR OR WARNING)")).toBe(
      'Status is none of "ERROR", "WARNING".',
    );
  });

  it("explains groups, null checks, scores, free text and keywords", () => {
    expect(explain("tags:(a AND b)")).toBe(
      'Trace tags include all of "a" and "b".',
    );
    expect(explain("tags:a")).toBe('Trace tags include "a".');
    expect(explain("has:endTime")).toBe("End time is set.");
    expect(explain("-has:endTime")).toBe("End time is not set.");
    expect(explain("scores.accuracy:>0.8")).toBe(
      'Score "accuracy" is above 0.8.',
    );
    expect(explain("totalCost:>0.5")).toBe("Total cost is above $0.5.");
    // The label already says "per second" — don't spell the unit out twice.
    expect(explain("tps:>=50")).toBe("Tokens per second is 50 or more.");
    expect(explain("refund policy")).toBe(
      'Full-text search for "refund policy" — matches id, name, input and output.',
    );
    expect(explain("level:ERROR AND latency:>2", 1)).toBe(
      "AND — every filter has to match.",
    );
  });

  it("says nothing where it has nothing to say", () => {
    expect(explain("nope:1")).toBeNull(); // unknown field → its own diagnostic
    expect(explain("(")).toBeNull();
  });

  it("gives every registry field a usable label", () => {
    for (const field of FIELDS) {
      // A camelCase id or a unit suffix reads as broken English in a sentence.
      expect(field.label, field.id).not.toMatch(/[a-z][A-Z]|[()$]/);
      if (field.kind === "boolean") {
        // Without this the false case silently falls back to the true phrase.
        expect(field.negatedLabel, field.id).toBeDefined();
        continue;
      }
      // Only array fields get a plural verb ("Trace tags include"); everything
      // else is followed by "is", so a plural label would read "… tokens is".
      // "Status" is a singular noun that happens to end in s.
      if (field.syncMode !== "arrayOption" && field.label !== "Status") {
        expect(field.label, field.id).not.toMatch(/s$/);
      }
    }
  });
});
