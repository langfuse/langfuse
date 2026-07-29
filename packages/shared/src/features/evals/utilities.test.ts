import { describe, expect, it } from "vitest";

import { extractValueFromObjectAsString } from "./utilities";

describe("extractValueFromObjectAsString", () => {
  it("does not fall back to a primitive value when its JSONPath has no match", () => {
    expect(
      extractValueFromObjectAsString(
        { input: "Hello World" },
        "input",
        "$.dasas",
      ),
    ).toEqual({ value: "", error: null });
  });

  it("can select the root primitive value with JSONPath", () => {
    expect(
      extractValueFromObjectAsString({ input: "Hello World" }, "input", "$"),
    ).toEqual({ value: "Hello World", error: null });
  });

  it("passes through a primitive value when no JSONPath is configured", () => {
    expect(
      extractValueFromObjectAsString({ input: "Hello World" }, "input"),
    ).toEqual({ value: "Hello World", error: null });
  });

  it("applies JSONPath selectors to falsy primitive values", () => {
    expect(
      extractValueFromObjectAsString({ input: false }, "input", "$.missing"),
    ).toEqual({ value: "", error: null });
  });
});
