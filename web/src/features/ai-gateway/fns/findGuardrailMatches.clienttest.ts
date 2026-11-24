import { describe, expect, it } from "vitest";

import { findGuardrailMatches } from "@/src/features/ai-gateway/fns/findGuardrailMatches";

describe("findGuardrailMatches", () => {
  it("highlights matches from multiple selected presets in order", () => {
    const segments = findGuardrailMatches(
      "My SSN is 123-45-6789, reach me at dana@example.com today.",
      ["us_ssn", "email"],
    );
    expect(segments).toEqual([
      { text: "My SSN is ", matched: false },
      { text: "123-45-6789", matched: true },
      { text: ", reach me at ", matched: false },
      { text: "dana@example.com", matched: true },
      { text: " today.", matched: false },
    ]);
  });

  it("ignores patterns for unselected presets", () => {
    const segments = findGuardrailMatches(
      "Contact dana@example.com with AKIAIOSFODNN7EXAMPLE",
      ["aws_access_key_id"],
    );
    expect(segments).toEqual([
      { text: "Contact dana@example.com with ", matched: false },
      { text: "AKIAIOSFODNN7EXAMPLE", matched: true },
    ]);
  });

  it("returns plain text when no preset matches or none are selected", () => {
    expect(findGuardrailMatches("hello world", ["us_ssn"])).toEqual([
      { text: "hello world", matched: false },
    ]);
    expect(findGuardrailMatches("123-45-6789", [])).toEqual([
      { text: "123-45-6789", matched: false },
    ]);
    expect(findGuardrailMatches("", ["us_ssn"])).toEqual([]);
  });
});
