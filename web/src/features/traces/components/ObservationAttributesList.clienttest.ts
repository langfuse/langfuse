// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  attributeColumnFilter,
  attributeGrammar,
  buildObservationAttributes,
} from "./ObservationAttributesList";

describe("buildObservationAttributes", () => {
  it("adds session and user after the fixed keys and skips empty values", () => {
    const attributes = buildObservationAttributes({
      model: "gpt-4.1-mini",
      environment: "prod",
      release: null,
      version: "v7",
      sessionId: "s42",
      userId: null,
      modelParameters: { temperature: 0.2 },
    });
    expect(Object.keys(attributes)).toEqual([
      "model",
      "environment",
      "version",
      "session_id",
      "temperature",
    ]);
    expect(attributes.session_id).toBe("s42");
  });

  it("does not let model parameters overwrite session or user", () => {
    const attributes = buildObservationAttributes({
      model: null,
      environment: null,
      release: null,
      version: null,
      sessionId: "s42",
      userId: "u1",
      modelParameters: { session_id: "bogus", user_id: "bogus" },
    });
    expect(attributes).toEqual({ session_id: "s42", user_id: "u1" });
  });
});

describe("attributeColumnFilter", () => {
  it("filters session and user on the caller's table with option clauses", () => {
    for (const [key, column] of [
      ["session_id", "sessionId"],
      ["user_id", "userId"],
    ] as const) {
      for (const target of ["observations", "traces"] as const) {
        const filter = attributeColumnFilter(key, "abc", target);
        expect(filter?.target).toBe(target);
        expect(filter?.include).toEqual({
          column,
          type: "stringOptions",
          operator: "any of",
          value: ["abc"],
        });
        expect(filter?.exclude).toEqual({
          column,
          type: "stringOptions",
          operator: "none of",
          value: ["abc"],
        });
      }
    }
  });

  it("reads as search-bar grammar", () => {
    expect(attributeGrammar("session_id", "s42")).toBe("session_id:s42");
    expect(attributeGrammar("user_id", "maya chen")).toBe(
      'user_id:"maya chen"',
    );
  });
});
