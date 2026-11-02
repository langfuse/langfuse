import { describe, expect, it } from "vitest";

import { describeVariableMismatch } from "./describeVariableMismatch";

describe("describeVariableMismatch", () => {
  it("names the expected variables once each", () => {
    expect(
      describeVariableMismatch(["country", "language", "country"]),
    ).toContain("this prompt expects: country, language.");
  });

  it("stays a sentence when there is nothing to name", () => {
    expect(describeVariableMismatch([])).toBe(
      "No dataset item contains any of the variables this prompt expects.",
    );
  });
});
