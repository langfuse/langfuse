// @vitest-environment node

import { describe, expect, it } from "vitest";
import { attributeGrammar } from "./attributeGrammar";

describe("attributeGrammar", () => {
  it("reads as search-bar grammar", () => {
    expect(attributeGrammar("session_id", "s42")).toBe("session_id:s42");
    expect(attributeGrammar("user_id", "maya chen")).toBe(
      'user_id:"maya chen"',
    );
  });
});
