// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  attributeColumnFilter,
  attributeGrammar,
  buildModelParameters,
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
    });
    expect(Object.keys(attributes)).toEqual([
      "model",
      "environment",
      "version",
      "session_id",
    ]);
    expect(attributes.session_id).toBe("s42");
  });
});

describe("buildModelParameters", () => {
  it("keeps the call's parameters as their own table and drops empty ones", () => {
    expect(
      buildModelParameters({ temperature: 0.2, top_p: null, tools: ["a"] }),
    ).toEqual({ temperature: 0.2, tools: ["a"] });
    expect(buildModelParameters({})).toBeNull();
    expect(buildModelParameters(null)).toBeNull();
    expect(buildModelParameters("gpt-4" as unknown as null)).toBeNull();
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

  it("offers no exclude for string columns, which cannot negate exactly", () => {
    const filter = attributeColumnFilter("version", "1.2", "traces");
    expect(filter?.include).toEqual({
      column: "version",
      type: "string",
      operator: "=",
      value: "1.2",
    });
    expect(filter?.exclude).toBeUndefined();
  });

  it("reads as search-bar grammar", () => {
    expect(attributeGrammar("session_id", "s42")).toBe("session_id:s42");
    expect(attributeGrammar("user_id", "maya chen")).toBe(
      'user_id:"maya chen"',
    );
  });
});
