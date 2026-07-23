import { describe, expect, it, vi } from "vitest";

// stringifyDatasetItemData shows a toast when it fails, so mock it to check the
// error path without firing a real toast.
const { showErrorToastMock } = vi.hoisted(() => ({
  showErrorToastMock: vi.fn(),
}));
vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: showErrorToastMock,
}));

import {
  normalizeDatasetJson,
  stringifyDatasetItemData,
} from "./datasetItemUtils";

describe("normalizeDatasetJson", () => {
  it("parses a nested stringified-JSON leaf inside a native object", () => {
    expect(normalizeDatasetJson({ a: { b: '{"c":1}' } })).toEqual({
      a: { b: { c: 1 } },
    });
  });

  it("unwraps an outer JSON-string envelope before deep-parsing", () => {
    // Regression: we must parse the wrapper string before deepParseJson so its
    // depth limit is used on the real content. If we pass the raw string
    // straight to deepParseJson, `b` stays an escaped string because parsing
    // the wrapper uses up one depth level.
    const envelope = JSON.stringify({ a: { b: JSON.stringify({ c: 1 }) } });
    expect(normalizeDatasetJson(envelope)).toEqual({ a: { b: { c: 1 } } });
  });

  it("handles payloads mixing native objects and JSON strings per-leaf", () => {
    const input = {
      model: { name: "gpt-4" }, // native object -> unchanged
      toolCall: '{"fn":"search"}', // stringified JSON -> parsed
      note: "see attached", // plain string -> unchanged
      spans: [{ id: 1 }, '{"id":2}'], // mixed array
    };
    expect(normalizeDatasetJson(input)).toEqual({
      model: { name: "gpt-4" },
      toolCall: { fn: "search" },
      note: "see attached",
      spans: [{ id: 1 }, { id: 2 }],
    });
  });

  it("leaves genuinely non-JSON strings untouched", () => {
    expect(normalizeDatasetJson("hello world")).toBe("hello world");
  });

  it("preserves big integers that would lose precision as strings", () => {
    expect(normalizeDatasetJson('{"id":107505301260286111}')).toEqual({
      id: "107505301260286111",
    });
  });

  it("does not mutate the input object (clones the shared cache value)", () => {
    const input = { a: '{"b":1}' };
    const snapshot = structuredClone(input);
    normalizeDatasetJson(input);
    expect(input).toEqual(snapshot);
  });
});

describe("stringifyDatasetItemData", () => {
  it("returns empty string for null/undefined/empty values", () => {
    expect(stringifyDatasetItemData(null)).toBe("");
    expect(stringifyDatasetItemData(undefined)).toBe("");
    expect(stringifyDatasetItemData("")).toBe("");
  });

  it("pretty-prints with nested stringified JSON expanded", () => {
    expect(stringifyDatasetItemData({ a: '{"b":1}' })).toBe(
      JSON.stringify({ a: { b: 1 } }, null, 2),
    );
  });

  it("returns empty string and toasts on serialization failure", () => {
    showErrorToastMock.mockClear();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(stringifyDatasetItemData(circular)).toBe("");
    expect(showErrorToastMock).toHaveBeenCalled();
  });
});
