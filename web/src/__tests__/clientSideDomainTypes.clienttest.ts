import {
  sanitizeSuperJsonPayload,
  stringifyClientJsonValue,
  stringifyMetadata,
} from "@/src/utils/clientSideDomainTypes";

describe("clientSideDomainTypes", () => {
  describe("metadata serialization helpers", () => {
    it("does not double-stringify metadata returned from tRPC", () => {
      const metadata = JSON.stringify({ prototype: "test", safeKey: "value" });

      expect(stringifyMetadata(metadata)).toBe(metadata);
    });

    it("stringifies client JSON values without double-stringifying strings", () => {
      const input = JSON.stringify({ prototype: "test", safeKey: "value" });

      expect(stringifyClientJsonValue({ prototype: "test" })).toBe(
        JSON.stringify({ prototype: "test" }),
      );
      expect(stringifyClientJsonValue(input)).toBe(input);
    });

    it("sanitizes protected SuperJSON keys from JSON-like payloads", () => {
      const date = new Date("2024-01-01T00:00:00.000Z");

      expect(
        sanitizeSuperJsonPayload({
          prototype: "root",
          safeKey: "value",
          nested: {
            constructor: "nested",
            safeNestedKey: "nested-value",
          },
          list: [{ prototype: "list", safeListKey: "list-value" }],
          date,
        }),
      ).toEqual({
        safeKey: "value",
        nested: {
          safeNestedKey: "nested-value",
        },
        list: [{ safeListKey: "list-value" }],
        date,
      });
    });
  });
});
